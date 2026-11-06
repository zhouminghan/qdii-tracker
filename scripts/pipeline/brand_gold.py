"""
scripts/pipeline/brand_gold.py — 品牌实物金价

从证券之星「金条金币报价」页抓取周大福/老凤祥/中国黄金等品牌的
足金饰品（黄金）与投资金条（金条）挂牌价，写入 web/data/brand-gold.json。
页面为 GBK 编码、服务端渲染，无需浏览器。
"""
import re

import requests

from core.constants import DATA_DIR
from core.utils import beijing_now_iso, read_json, write_json

URL = "https://quote.stockstar.com/gold/salegold.shtml"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
}
OUTPUT_FP = DATA_DIR / "brand-gold.json"

# 展示顺序（stockstar 无「水贝」批发价，故不收录水贝，白皮书中的「等品牌」由下列覆盖）
BRAND_ORDER = [
    "周大福", "老凤祥", "中国黄金", "六福珠宝", "周生生",
    "周六福", "周大生", "潮宏基", "老庙黄金", "菜百首饰",
]


def _strip_tags(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def parse_brands(html):
    """从表格 HTML 解析 {brand: {"黄金": price, "金条": price}}。"""
    tbody = html.split("<tbody>", 1)[-1].split("</tbody>", 1)[0]
    brands = {}
    current = None
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", tbody, re.S):
        first_td = re.search(r"<td([^>]*)>", tr)
        has_rowspan = bool(first_td and "rowspan" in first_td.group(1))
        cells = [_strip_tags(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)]
        if has_rowspan:
            current = cells[0] if cells else None
            cells = cells[1:]
        if current and len(cells) >= 3:
            product, price, unit = cells[0], cells[1], cells[2]
            if unit == "元/克" and product in ("黄金", "金条"):
                try:
                    brands.setdefault(current, {})[product] = float(price)
                except ValueError:
                    continue
    return brands


def fetch_html():
    r = requests.get(URL, timeout=20, headers=HEADERS)
    r.raise_for_status()
    r.encoding = "gbk"
    return r.text


def build():
    """抓取 + 组装；失败且无历史快照返回 None。"""
    try:
        brands = parse_brands(fetch_html())
    except Exception as e:  # noqa: BLE001
        print(f"  ⚠ 品牌金价抓取失败: {e}")
        brands = {}

    rows = []
    for brand in BRAND_ORDER:
        data = brands.get(brand, {})
        if not data:
            continue
        rows.append({
            "brand": brand,
            "ornament": data.get("黄金"),
            "investment_bar": data.get("金条"),
        })

    if not rows:
        prev = read_json(OUTPUT_FP) if OUTPUT_FP.exists() else {}
        if prev.get("brands"):
            print("  ⚠ 品牌金价：数据源失败，保留历史快照")
            return prev
        return None

    return {
        "generated_at": beijing_now_iso(),
        "schema_version": 1,
        "source": "证券之星",
        "brands": rows,
    }


def main():
    payload = build()
    if payload is None:
        print("❌ 品牌金价：数据源失败且无历史快照，跳过写入")
        raise SystemExit(1)
    write_json(OUTPUT_FP, payload)
    names = "、".join(b["brand"] for b in payload["brands"])
    print(f"✅ 品牌金价：{len(payload['brands'])} 家（{names}）")


if __name__ == "__main__":
    main()
