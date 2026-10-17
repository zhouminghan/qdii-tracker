"""
scripts/pipeline/market_temperature.py — 生成「市场温度」评分数据

从公开数据源抓取四个指标（纳指趋势 / VIX / 10 年期美债 / 美元指数），
按可配置阈值映射为 0-100 分，再按权重加权得到综合得分与红绿灯区间，
写入 web/data/market-temperature.json，供前端「市场温度」Tab 渲染。

纯逻辑（score_nasdaq_trend / score_piecewise / weighted_score / band_of）可单测；
网络抓取在 sync / refresh / CI 增量时执行。

评分方向：分数越高 = 对美股 QDII 持有人越友好（机会 / 健康）。
红绿灯：绿 71-100 机会、黄 40-70 中性、红 0-39 防守。
权重与阈值均可调（本文件顶部配置），调整后必须重跑 sync。
"""
import json
from datetime import datetime

import requests

from core.constants import DATA_DIR
from core.utils import beijing_now_iso, read_json, write_json

# ============================================================
# 可配置：权重 / 区间 / 指标映射锚点
# ============================================================
WEIGHTS = {
    "nasdaq_trend": 0.4,
    "vix": 0.2,
    "treasury_10y": 0.2,
    "dxy": 0.2,
}

BAND_GREEN_MIN = 71
BAND_YELLOW_MIN = 40

# piecewise anchors：(bound, score) 升序，value <= bound 取该 score（lower is better）
VIX_ANCHORS = [(15, 85), (18, 75), (20, 65), (25, 50), (30, 35), (40, 20), (100, 10)]
TREASURY_ANCHORS = [(3.0, 90), (3.5, 80), (4.0, 70), (4.5, 60), (5.0, 45), (5.5, 30), (10.0, 15)]
DXY_ANCHORS = [(95, 80), (100, 70), (105, 55), (110, 40), (115, 25), (130, 15)]

# 纳指趋势线性映射：score = clip(50 + pct_above_ma * 5, 0, 100)
NASDAQ_SLOPE = 5.0
NASDAQ_BASE = 50.0

OUTPUT_FP = DATA_DIR / "market-temperature.json"

YAHOO_UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}


# ============================================================
# 纯逻辑（可单测）
# ============================================================
def score_piecewise(value, anchors, lower_is_better=True):
    """按锚点把原始值映射为 0-100 分。

    anchors: [(bound, score)] 升序。lower_is_better=True 时取第一个
    value <= bound 的分；否则倒序取第一个 value >= bound 的分。
    """
    if value is None:
        return None
    if lower_is_better:
        for bound, score in anchors:
            if value <= bound:
                return score
        return anchors[-1][1]
    for bound, score in reversed(anchors):
        if value >= bound:
            return score
    return anchors[0][1]


def score_nasdaq_trend(pct_above_ma):
    """纳指价格相对 200 日线的偏离 → 0-100（线性，中心 50）。"""
    if pct_above_ma is None:
        return None
    return int(max(0, min(100, round(NASDAQ_BASE + pct_above_ma * NASDAQ_SLOPE))))


def _label_of(score, labels):
    """labels: [(min_score, text)] 降序；返回第一个 score >= min_score 的文案。"""
    if score is None:
        return "暂无数据"
    for min_score, text in labels:
        if score >= min_score:
            return text
    return labels[-1][1]


def compute_scores(raw):
    """把四组原始值换算为 {key: {score, label}}。"""
    out = {}
    ndx = raw.get("nasdaq_trend") or {}
    ndx_score = score_nasdaq_trend(ndx.get("pct_above_ma"))
    out["nasdaq_trend"] = {
        "score": ndx_score,
        "label": _label_of(ndx_score, [(70, "趋势偏强"), (40, "趋势中性"), (0, "趋势偏弱")]),
    }

    vix = raw.get("vix") or {}
    vix_score = score_piecewise(vix.get("value"), VIX_ANCHORS, lower_is_better=True)
    out["vix"] = {
        "score": vix_score,
        "label": _label_of(vix_score, [(70, "情绪平稳"), (40, "情绪偏紧"), (0, "恐慌升温")]),
    }

    ty = raw.get("treasury_10y") or {}
    ty_score = score_piecewise(ty.get("value"), TREASURY_ANCHORS, lower_is_better=True)
    out["treasury_10y"] = {
        "score": ty_score,
        "label": _label_of(ty_score, [(70, "利率友好"), (40, "利率中性"), (0, "利率压制")]),
    }

    dxy = raw.get("dxy") or {}
    dxy_score = score_piecewise(dxy.get("value"), DXY_ANCHORS, lower_is_better=True)
    out["dxy"] = {
        "score": dxy_score,
        "label": _label_of(dxy_score, [(70, "美元偏弱"), (40, "美元中性"), (0, "美元偏强")]),
    }
    return out


def weighted_score(scores):
    """加权求和并四舍五入到整数。"""
    total = 0.0
    for key, weight in WEIGHTS.items():
        score = scores.get(key, {}).get("score")
        if score is not None:
            total += score * weight
    return int(round(total))


def band_of(score):
    """返回 (band, verdict, summary)。"""
    if score >= BAND_GREEN_MIN:
        return "green", "绿灯 · 机会区间", "市场整体偏乐观，适合关注或分批买入。"
    if score >= BAND_YELLOW_MIN:
        return "yellow", "黄灯 · 中性区间", "市场处于合理区间，适合定投或谨慎操作。"
    return "red", "红灯 · 防守区间", "市场风险偏高，控制仓位、避免追高。"


def build_notes(raw, scores):
    """生成每个指标的简短分析文案。"""
    notes = {}
    ndx = raw.get("nasdaq_trend") or {}
    pct = ndx.get("pct_above_ma")
    if pct is not None:
        notes["nasdaq_trend"] = f"纳指 100 位于 200 日线{'上方' if pct >= 0 else '下方'} {abs(pct):.1f}%。"
    vix = raw.get("vix") or {}
    if vix.get("value") is not None:
        notes["vix"] = f"VIX {vix['value']:.1f}，恐慌情绪{'温和' if scores['vix']['score'] >= 70 else '偏高' if scores['vix']['score'] < 40 else '中性'}。"
    ty = raw.get("treasury_10y") or {}
    if ty.get("value") is not None:
        notes["treasury_10y"] = f"10 年期美债收益率 {ty['value']:.2f}%。"
    dxy = raw.get("dxy") or {}
    if dxy.get("value") is not None:
        notes["dxy"] = f"美元指数 {dxy['value']:.1f}。"
    return notes


def build_interpretation(raw, scores):
    """根据指标得分生成利好与风险因子列表。"""
    positives, risks = [], []
    if scores["nasdaq_trend"]["score"] is not None and scores["nasdaq_trend"]["score"] >= 70:
        pct = (raw.get("nasdaq_trend") or {}).get("pct_above_ma")
        positives.append(f"纳指趋势偏强，位于 200 日线上方 {pct:.1f}%。")
    if scores["vix"]["score"] is not None and scores["vix"]["score"] >= 70:
        positives.append(f"VIX {raw['vix']['value']:.1f}，恐慌情绪温和。")
    if scores["treasury_10y"]["score"] is not None and scores["treasury_10y"]["score"] >= 70:
        positives.append(f"10 年期美债收益率 {raw['treasury_10y']['value']:.2f}%，对成长股压制有限。")
    if scores["dxy"]["score"] is not None and scores["dxy"]["score"] >= 70:
        positives.append(f"美元指数 {raw['dxy']['value']:.1f}，流动性环境友好。")

    if scores["nasdaq_trend"]["score"] is not None and scores["nasdaq_trend"]["score"] < 40:
        risks.append("纳指跌破 200 日线，趋势转弱。")
    if scores["vix"]["score"] is not None and scores["vix"]["score"] < 40:
        risks.append(f"VIX {raw['vix']['value']:.1f}，恐慌情绪升温。")
    if scores["treasury_10y"]["score"] is not None and scores["treasury_10y"]["score"] < 40:
        risks.append(f"10 年期美债收益率 {raw['treasury_10y']['value']:.2f}%，压制高估值资产。")
    if scores["dxy"]["score"] is not None and scores["dxy"]["score"] < 40:
        risks.append(f"美元指数 {raw['dxy']['value']:.1f}，流动性偏紧。")

    if not positives:
        positives.append("暂无显著利好因子，指标整体中性。")
    if not risks:
        risks.append("暂无显著风险因子，保持关注仓位节奏。")
    return positives, risks


# ============================================================
# 数据抓取（每个函数独立容错，返回 raw dict 或 None）
# ============================================================
def _to_float(v):
    try:
        f = float(v)
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def fetch_nasdaq_trend():
    import akshare as ak

    df = ak.index_us_stock_sina(symbol=".NDX")
    if df is None or len(df) == 0:
        return None
    close = _to_float(df.iloc[-1]["close"])
    ma200 = _to_float(df["close"].tail(200).mean())
    if close is None or ma200 is None or ma200 <= 0:
        return None
    pct = (close - ma200) / ma200 * 100
    return {
        "price": round(close, 2),
        "ma200": round(ma200, 2),
        "pct_above_ma": round(pct, 2),
        "date": str(df.iloc[-1]["date"])[:10],
    }


def fetch_treasury_10y():
    import akshare as ak
    from core.utils import beijing_now

    start = (beijing_now().replace(year=beijing_now().year - 1)).strftime("%Y%m%d")
    df = ak.bond_zh_us_rate(start_date=start)
    if df is None or len(df) == 0:
        return None
    value = _to_float(df.iloc[-1].get("美国国债收益率10年"))
    if value is None:
        return None
    return {"value": round(value, 2), "date": str(df.iloc[-1]["日期"])[:10]}


def fetch_dxy():
    import akshare as ak

    df = ak.index_global_hist_em(symbol="美元指数")
    if df is None or len(df) == 0:
        return None
    value = _to_float(df.iloc[-1].get("最新价"))
    if value is None:
        return None
    return {"value": round(value, 2), "date": str(df.iloc[-1]["日期"])[:10]}


def fetch_vix():
    url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1y&interval=1d"
    r = requests.get(url, timeout=15, headers=YAHOO_UA)
    r.raise_for_status()
    result = r.json()["chart"]["result"][0]
    timestamps = result.get("timestamp") or []
    closes = (result.get("indicators", {}).get("quote") or [{}])[0].get("close") or []
    value = None
    date = None
    for ts, close in zip(timestamps, closes):
        f = _to_float(close)
        if f is not None:
            value = f
            date = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
    if value is None:
        return None
    return {"value": round(value, 2), "date": date}


FETCHERS = [
    ("nasdaq_trend", fetch_nasdaq_trend, "新浪"),
    ("vix", fetch_vix, "Yahoo Finance"),
    ("treasury_10y", fetch_treasury_10y, "东方财富"),
    ("dxy", fetch_dxy, "东方财富"),
]


# ============================================================
# 组装与写盘
# ============================================================
def build():
    """抓取 + 打分，返回 (payload, fresh_count)；全部失败且无历史快照返回 (None, 0)。"""
    prev = read_json(OUTPUT_FP) if OUTPUT_FP.exists() else {}
    prev_indicators = prev.get("indicators", {})

    raw = {}
    fresh_count = 0
    for key, fn, _source in FETCHERS:
        raw[key] = None
        try:
            fresh = fn()
        except Exception as e:  # noqa: BLE001
            print(f"  ⚠ 市场温度[{key}] 抓取失败: {e}")
            fresh = None
        if fresh is not None:
            raw[key] = fresh
            fresh_count += 1
        elif key in prev_indicators and prev_indicators[key].get("raw"):
            raw[key] = prev_indicators[key]["raw"]

    if fresh_count == 0:
        if not prev:
            return None, 0
        print("  ⚠ 市场温度：全部数据源失败，保留历史快照")
        return prev, 0

    scores = compute_scores(raw)
    notes = build_notes(raw, scores)
    positives, risks = build_interpretation(raw, scores)
    score = weighted_score(scores)
    band, verdict, summary = band_of(score)

    indicators = {}
    for key, _fn, source in FETCHERS:
        info = scores[key]
        indicators[key] = {
            "score": info["score"],
            "label": info["label"],
            "raw": raw.get(key),
            "note": notes.get(key, "数据暂缺。"),
            "source": source,
            "stale": raw.get(key) is None,
        }

    payload = {
        "generated_at": beijing_now_iso(),
        "schema_version": 1,
        "score": score,
        "band": band,
        "verdict": verdict,
        "summary": summary,
        "weights": WEIGHTS,
        "indicators": indicators,
        "positives": positives,
        "risks": risks,
        "disclaimer": "本评分仅为基于公开数据的量化情绪参考，不构成投资建议。权重与阈值可调，历史表现不代表未来。",
    }
    return payload, fresh_count


def main():
    payload, fresh_count = build()
    if payload is None:
        print("❌ 市场温度：全部数据源失败且无历史快照，跳过写入")
        raise SystemExit(1)
    write_json(OUTPUT_FP, payload)
    print(f"✅ 市场温度：{payload['score']} 分 · {payload['verdict']}（{fresh_count}/4 项新鲜）")


if __name__ == "__main__":
    main()
