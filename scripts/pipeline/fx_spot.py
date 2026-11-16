"""
scripts/pipeline/fx_spot.py — 实时汇率快照

从新浪财经外汇接口抓取在岸/离岸人民币、日元、港元即期报价，写入
web/data/fx-spot.json。免密钥，失败时保留上一次成功快照。

产物只做首屏报价覆盖；历史日 K 仍由 kline_history.py 维护。
"""
import re
from datetime import timedelta, timezone

from core.constants import DATA_DIR
from core.utils import beijing_now_iso, read_json, requests_get, write_json

URL = "https://hq.sinajs.cn/list=fx_susdcny,fx_susdcnh,fx_susdjpy,fx_susdhkd,fx_scnyhkd"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://finance.sina.com.cn",
}
OUTPUT_FP = DATA_DIR / "fx-spot.json"
BJ = timezone(timedelta(hours=8))

SYMBOL_MAP = {
    "fx_susdcny": "fxUSDCNY",
    "fx_susdcnh": "usdcnh",
    "fx_susdjpy": "fxUSDJPY",
    "fx_susdhkd": "fxUSDHKD",
    "fx_scnyhkd": "fxCNYHKD",
}


def _finite(value):
    try:
        number = float(value)
        return number if number == number else None
    except (TypeError, ValueError):
        return None


def parse_quote_line(line):
    """解析单行 Sina 外汇报价；返回 (symbol, quote) 或 (None, None)。"""
    match = re.match(r'var hq_str_(\w+)="([^"]*)"', line.strip())
    if not match:
        return None, None
    symbol, body = match.group(1), match.group(2)
    fields = body.split(",")
    if len(fields) < 18:
        return None, None
    price = _finite(fields[8])
    if price is None or price <= 0:
        return None, None
    date = fields[17] or ""
    clock = fields[0] or ""
    updated = f"{date}T{clock}+08:00" if date and clock else None
    return symbol, {
        "price": round(price, 6),
        "change": _finite(fields[11]),
        "change_pct": _finite(fields[10]),
        "as_of": date or None,
        "source": f"新浪财经 {symbol}",
        "source_updated_at": updated,
        "derived": False,
    }


def parse_payload(text):
    """把新浪多行报价解析为 {前端key: quote}。"""
    items = {}
    for line in text.splitlines():
        symbol, quote = parse_quote_line(line)
        key = SYMBOL_MAP.get(symbol)
        if key and quote:
            items[key] = quote
    return items


def fetch_text():
    response = requests_get(URL, headers=HEADERS, timeout=15)
    if response is None:
        return None
    response.encoding = "gbk"
    return response.text


def build():
    """抓取 + 合并；全部失败时保留历史快照。"""
    previous = read_json(OUTPUT_FP) if OUTPUT_FP.exists() else {}
    previous_items = previous.get("items") or {}
    try:
        fetched = parse_payload(fetch_text() or "")
    except ValueError as exc:
        print(f"  ⚠ 实时汇率解析失败: {exc}")
        fetched = {}

    if not fetched:
        if previous_items:
            print("  ⚠ 实时汇率：数据源失败，保留历史快照")
            return previous
        return None

    items = {**previous_items, **fetched}
    dates = [item.get("as_of") for item in items.values() if item.get("as_of")]
    return {
        "generated_at": beijing_now_iso(),
        "schema_version": 1,
        "source": "新浪财经外汇",
        "as_of": max(dates) if dates else None,
        "items": items,
    }


def main():
    payload = build()
    if payload is None:
        print("❌ 实时汇率：数据源失败且无历史快照，跳过写入")
        raise SystemExit(1)
    write_json(OUTPUT_FP, payload)
    keys = ", ".join(sorted((payload.get("items") or {}).keys()))
    print(f"✅ 实时汇率：{keys}（{payload.get('as_of')}）")


if __name__ == "__main__":
    main()
