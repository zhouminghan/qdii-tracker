"""
scripts/pipeline/cnn_sentiment.py — 生成「CNN 恐慌与贪婪」仪表盘数据

从 CNN 公开数据接口抓取恐慌贪婪指数（0-100）与历史序列，写入
web/data/cnn-fear-greed.json，供前端「市场温度」Tab 的恐慌贪婪仪表盘渲染，
并作为 VIX & PE 阶梯定投矩阵的恐慌贪婪输入。

分档（与 core.dca_strategy 一致）：
  0-25 极度恐慌 / 25-45 恐惧 / 45-55 中性 / 55-75 贪婪 / 75-100 极度贪婪。

纯函数（band_of）可单测；网络抓取在 sync / refresh / CI 增量时执行，
失败时复用历史快照。
"""
from datetime import datetime, timezone

import requests

from core.constants import DATA_DIR
from core.utils import beijing_now_iso, read_json, write_json

OUTPUT_FP = DATA_DIR / "cnn-fear-greed.json"

CNN_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
CNN_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Origin": "https://www.cnn.com",
    "Referer": "https://www.cnn.com/markets/fear-and-greed",
    "Accept": "application/json",
}

CNN_BAND_LABELS = {
    "extreme_fear": "极度恐慌",
    "fear": "恐惧",
    "neutral": "中性",
    "greed": "贪婪",
    "extreme_greed": "极度贪婪",
}


def band_of(score):
    """把 0-100 分数映射为阶梯 key 与中文标签。"""
    score = float(score or 0)
    if score < 25:
        key = "extreme_fear"
    elif score < 45:
        key = "fear"
    elif score < 55:
        key = "neutral"
    elif score < 75:
        key = "greed"
    else:
        key = "extreme_greed"
    return {"key": key, "label": CNN_BAND_LABELS[key]}


def _epoch_to_date(ms):
    try:
        return datetime.fromtimestamp(float(ms) / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d")
    except (TypeError, ValueError, OSError):
        return None


def parse_payload(payload):
    """把 CNN 原始 JSON 组装为站点数据（纯逻辑，可单测）。"""
    fg = payload.get("fear_and_greed") or {}
    hist = (payload.get("fear_and_greed_historical") or {}).get("data") or []
    score = fg.get("score")
    if score is None:
        return None
    band = band_of(score)

    history = []
    for row in hist[-180:]:
        date = _epoch_to_date(row.get("x"))
        if date and row.get("y") is not None:
            history.append({"date": date, "score": round(float(row["y"]), 2)})

    return {
        "generated_at": beijing_now_iso(),
        "schema_version": 1,
        "source": "CNN Fear & Greed",
        "score": round(float(score), 2),
        "rating": fg.get("rating"),
        "band": band["key"],
        "label": band["label"],
        "timestamp": fg.get("timestamp"),
        "previous": {
            "close": round(float(fg["previous_close"]), 2) if fg.get("previous_close") is not None else None,
            "week": round(float(fg["previous_1_week"]), 2) if fg.get("previous_1_week") is not None else None,
            "month": round(float(fg["previous_1_month"]), 2) if fg.get("previous_1_month") is not None else None,
            "year": round(float(fg["previous_1_year"]), 2) if fg.get("previous_1_year") is not None else None,
        },
        "history": history,
        "disclaimer": "CNN 恐慌与贪婪指数仅为市场情绪参考，不构成具体买卖建议。",
    }


def fetch_payload():
    """拉取 CNN 原始 JSON；带浏览器 Origin/Referer 以通过其 bot 校验。"""
    r = requests.get(CNN_URL, timeout=20, headers=CNN_HEADERS)
    if r.status_code == 418:
        raise RuntimeError("CNN 返回 418（bot 校验未通过）")
    r.raise_for_status()
    return r.json()


def build():
    """抓取 + 组装；失败且无历史快照返回 None。"""
    try:
        payload = parse_payload(fetch_payload())
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠ CNN 恐慌贪婪抓取失败: {e}")
        payload = None

    if payload is None:
        prev = read_json(OUTPUT_FP) if OUTPUT_FP.exists() else {}
        if prev.get("score") is not None:
            print("  ⚠ CNN 恐慌贪婪：数据源失败，保留历史快照")
            return prev
        return None
    return payload


def main():
    payload = build()
    if payload is None:
        print("❌ CNN 恐慌贪婪：全部数据源失败且无历史快照，跳过写入")
        raise SystemExit(1)
    write_json(OUTPUT_FP, payload)
    print(f"✅ CNN 恐慌贪婪：{payload['score']:.1f} 分 · {payload['label']}")


if __name__ == "__main__":
    main()
