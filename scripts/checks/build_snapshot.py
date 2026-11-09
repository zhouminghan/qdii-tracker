#!/usr/bin/env python3
"""
scripts/checks/build_snapshot.py — 生成每日 JSON / RSS 快照

从 web/data/*.json 汇总为便于二次加工的轻量快照：
  - web/data/snapshot.json  全部基金扁平化列表（代码/名称/分类/净值/涨跌/日期/限额/溢价/规模）
  - web/data/market-snapshot.json  首屏行情离线收盘快照（指数/科技/汇率/黄金/宏观/温度）
  - web/feed.rss            数据更新时间 + 当日涨跌幅度最大的 20 只（供 RSS 订阅）

纯离线、只读数据文件，写入 snapshot.json + feed.rss，不触碰原始数据。
由 update-data.yml 在每次数据更新后调用。
"""
import json
import html
from datetime import datetime, timezone

from core.constants import DATA_DIR, CATEGORIES, ROOT_DIR
from pipeline import market_snapshot


def _load_categories():
    out = {}
    for cat in CATEGORIES:
        fp = DATA_DIR / f"{cat}.json"
        if fp.exists():
            out[cat] = json.loads(fp.read_text(encoding="utf-8"))
    return out


def _to_float(v):
    if v is None or v == "":
        return None
    try:
        f = float(v)
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def build_snapshot():
    data = _load_categories()
    meta = {}
    meta_fp = DATA_DIR / "meta.json"
    if meta_fp.exists():
        meta = json.loads(meta_fp.read_text(encoding="utf-8"))

    funds = []
    for cat, d in data.items():
        is_etf = cat == "etf"
        for series in d.get("series", []):
            def_code = series.get("default_share_code")
            share = next((s for s in series.get("shares", []) if s.get("code") == def_code), None)
            if not share:
                share = (series.get("shares") or [None])[0]
            if not share:
                continue
            funds.append({
                "code": share.get("code"),
                "name": series.get("display_name") or share.get("name"),
                "category": cat,
                "company": series.get("company"),
                "nav": share.get("nav") if not is_etf else share.get("etf_price"),
                "daily_change": share.get("daily_change") if not is_etf else share.get("etf_change_pct"),
                "nav_date": share.get("nav_date"),
                "buy_status": share.get("buy_status"),
                "daily_limit": share.get("daily_limit"),
                "etf_premium": share.get("etf_premium") if is_etf else None,
                "scale": series.get("series_scale"),
            })

    snapshot = {
        "generated_at": meta.get("generated_at"),
        "schema_version": meta.get("schema_version"),
        "count": len(funds),
        "funds": funds,
    }
    return snapshot, meta.get("generated_at")


def build_rss(snapshot, generated_at):
    items = sorted(
        [f for f in snapshot["funds"] if _to_float(f.get("daily_change")) is not None],
        key=lambda f: abs(_to_float(f.get("daily_change"))),
        reverse=True,
    )[:20]

    pub = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
    rows = []
    for f in items:
        chg = _to_float(f.get("daily_change"))
        title = f"{f['name']} {chg:+.2f}%"
        desc = (
            f"代码 {f.get('code')} · 分类 {f.get('category')} · "
            f"净值/价格 {f.get('nav')} · 净值日 {f.get('nav_date')} · "
            f"申购 {f.get('buy_status') or '--'}"
            + (f" · 溢价 {_to_float(f.get('etf_premium')):+.2f}%" if f.get("etf_premium") is not None else "")
        )
        rows.append(
            "  <item>\n"
            f"    <title>{html.escape(title)}</title>\n"
            f"    <description>{html.escape(desc)}</description>\n"
            f"    <guid>{html.escape(str(f.get('code')))}</guid>\n"
            "  </item>"
        )

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0"><channel>\n'
        "  <title>US Fund Tracker · 美股基金看板</title>\n"
        "  <link>https://zhouminghan.github.io/qdii-tracker/</link>\n"
        f"  <description>美股 QDII/ETF 净值与涨跌快照（数据时间 {html.escape(str(generated_at))}）</description>\n"
        f"  <lastBuildDate>{pub}</lastBuildDate>\n"
        + "\n".join(rows) +
        "\n</channel></rss>\n"
    )


def main():
    snapshot, generated_at = build_snapshot()
    market_snapshot.build()
    (DATA_DIR / "snapshot.json").write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (ROOT_DIR / "web" / "feed.rss").write_text(build_rss(snapshot, generated_at), encoding="utf-8")
    # 持仓文件索引：供前端「重仓透视」只拉存在的文件，避免批量 404
    holdings_dir = DATA_DIR / "holdings"
    holdings_codes = sorted(p.stem for p in holdings_dir.glob("*.json")) if holdings_dir.exists() else []
    (DATA_DIR / "holdings-index.json").write_text(
        json.dumps({"codes": holdings_codes}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"✅ 快照已生成：{len(snapshot['funds'])} 只基金 + "
        f"{len(holdings_codes)} 个持仓索引 + market-snapshot.json"
    )


if __name__ == "__main__":
    main()
