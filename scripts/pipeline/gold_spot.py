"""
scripts/pipeline/gold_spot.py — 现货黄金与上海金实时快照

公开源（免密钥）：
  - 金投网 jijinhao JO_71：上海黄金交易所 Au9999，元/克
  - 新浪财经 hf_XAU：伦敦金现货 XAU/USD

写入 web/data/gold-spot.json。market_snapshot.py 优先使用该独立快照；
失败时保留上一次成功值，再失败则回退本地折算。
"""
import json
import re
from datetime import datetime, timedelta, timezone

from core.constants import DATA_DIR
from core.utils import beijing_now_iso, read_json, requests_get, write_json

AU_URL = "https://api.jijinhao.com/quoteCenter/realTime.htm?codes=JO_71"
AU_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://quote.cngold.org/",
}
XAU_URL = "https://hq.sinajs.cn/list=hf_XAU"
XAU_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://finance.sina.com.cn",
}
OUTPUT_FP = DATA_DIR / "gold-spot.json"
BJ = timezone(timedelta(hours=8))


def _finite(value):
    try:
        number = float(value)
        return number if number == number else None
    except (TypeError, ValueError):
        return None


def _stamp(ms):
    value = _finite(ms)
    if value is None or value <= 0:
        return None
    # jijinhao returns milliseconds.
    seconds = value / 1000 if value > 10_000_000_000 else value
    return datetime.fromtimestamp(seconds, tz=BJ).isoformat()


def parse_au9999(text):
    """解析金投网 JO_71 → Au9999 元/克快照。"""
    match = re.search(r"quote_json\s*=\s*(\{.*\})", text, re.S)
    if not match:
        return None
    payload = json.loads(match.group(1))
    quote = payload.get("JO_71") or {}
    price = _finite(quote.get("q64"))
    if price is None or price <= 0:
        return None
    updated = _stamp(quote.get("time"))
    return {
        "price": round(price, 2),
        "change": _finite(quote.get("q70")),
        "change_pct": _finite(quote.get("q80")),
        "as_of": updated[:10] if updated else None,
        "source": "金投网 Au9999",
        "source_updated_at": updated,
        "derived": False,
    }


def parse_xau(text):
    """解析新浪 hf_XAU → London spot XAU/USD。"""
    match = re.search(r'var hq_str_hf_XAU="([^"]*)"', text)
    if not match:
        return None
    fields = match.group(1).split(",")
    if len(fields) < 14:
        return None
    price = _finite(fields[0])
    previous = _finite(fields[7])
    if price is None or price <= 0:
        return None
    change = price - previous if previous and previous > 0 else None
    change_pct = change / previous * 100 if change is not None else None
    date = fields[12] or ""
    clock = fields[6] or ""
    updated = f"{date}T{clock}+08:00" if date and clock else None
    return {
        "price": round(price, 2),
        "change": round(change, 3) if change is not None else None,
        "change_pct": round(change_pct, 3) if change_pct is not None else None,
        "as_of": date or None,
        "source": "新浪财经 hf_XAU",
        "source_updated_at": updated,
        "derived": False,
    }


def _fetch_au9999():
    response = requests_get(AU_URL, headers=AU_HEADERS, timeout=15)
    return parse_au9999(response.text) if response is not None else None


def _fetch_xau():
    response = requests_get(XAU_URL, headers=XAU_HEADERS, timeout=15)
    if response is None:
        return None
    response.encoding = "gbk"
    return parse_xau(response.text)


def build():
    """抓取 + 合并；两个源都失败时保留历史快照。"""
    previous = read_json(OUTPUT_FP) if OUTPUT_FP.exists() else {}
    result = {
        "generated_at": beijing_now_iso(),
        "schema_version": 1,
        "source": "金投网 + 新浪财经",
    }
    for key, fetcher in (("au9999", _fetch_au9999), ("xau", _fetch_xau)):
        try:
            quote = fetcher()
        except (ValueError, json.JSONDecodeError) as exc:
            print(f"  ⚠ 黄金 {key} 解析失败: {exc}")
            quote = None
        if quote:
            result[key] = quote
        elif previous.get(key):
            result[key] = previous[key]
            print(f"  ⚠ 黄金 {key}：数据源失败，保留历史快照")

    if not result.get("au9999") and not result.get("xau"):
        return previous if previous else None
    dates = [q.get("as_of") for q in (result.get("au9999"), result.get("xau")) if isinstance(q, dict) and q.get("as_of")]
    result["as_of"] = max(dates) if dates else None
    return result


def main():
    payload = build()
    if payload is None:
        print("❌ 黄金快照：数据源失败且无历史快照，跳过写入")
        raise SystemExit(1)
    write_json(OUTPUT_FP, payload)
    au = (payload.get("au9999") or {}).get("price")
    xau = (payload.get("xau") or {}).get("price")
    print(f"✅ 黄金快照：Au9999 {au} 元/克 · XAU/USD {xau}")


if __name__ == "__main__":
    main()
