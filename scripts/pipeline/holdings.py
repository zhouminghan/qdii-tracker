"""
抓取基金持仓（Top10 重仓股）。
原 fetch_holdings.py 逻辑搬迁，import core+sources。
"""
import json
import time

from core.constants import CATEGORIES, DATA_DIR, HOLDINGS_DIR
from core.utils import write_json, normalize_holdings_keys
from core.config_loader import get_config
from sources.akshare_source import fetch_holdings


def main():
    import argparse
    parser = argparse.ArgumentParser(description="抓取基金持仓（Top10 重仓股）")
    parser.add_argument("--codes", help="逗号分隔的基金代码，仅处理这些；不传=全量")
    args = parser.parse_args()
    only_codes = set(args.codes.split(",")) if args.codes else None

    data_dir = DATA_DIR
    holdings_dir = HOLDINGS_DIR
    holdings_dir.mkdir(parents=True, exist_ok=True)

    # 抓主动基金 + 全球/其他 QDII
    target_codes = []
    for cat in ["active", "global_other"]:
        fp = data_dir / f"{cat}.json"
        if not fp.exists():
            continue
        with open(fp, encoding="utf-8") as f:
            d = json.load(f)
        for series in d["series"]:
            default_code = series.get("default_share_code")
            if default_code:
                target_codes.append((default_code, series.get("display_name", "")))

    # 显式白名单
    cfg = get_config()
    EXTRA_HOLDINGS_CODES = [
        (code, info["name"])
        for code, info in cfg.get("passive_override", {}).items()
        if info.get("type") == "active"
    ]
    existing_codes = {c for c, _ in target_codes}
    for code, name in EXTRA_HOLDINGS_CODES:
        if code not in existing_codes:
            target_codes.append((code, name))

    total = len(target_codes)
    print(f"🎯 目标：{total} 只主动基金" + (f"（仅 {only_codes}）" if only_codes else ""))
    print(f"📁 输出：{holdings_dir}")
    print()

    success = 0
    fail = 0
    for i, (code, name) in enumerate(target_codes, 1):
        if only_codes and code not in only_codes:
            continue
        result = fetch_holdings(code)
        if result and "error" not in result:
            normalize_holdings_keys(result)
            write_json(holdings_dir / f"{code}.json", result)
            success += 1
            top_str = ""
            if result["holdings"]:
                top3 = result["holdings"][:3]
                top_str = " | ".join(f"{h['stock_name']} {h['weight']}%" for h in top3)
            print(f"  [{i}/{total}] ✅ {code} {name[:20]} - {top_str}")
        else:
            fail += 1
            err = (result or {}).get("error", "未知") if result else "无数据"
            print(f"  [{i}/{total}] ❌ {code} {name[:20]} - {err[:50]}")

        time.sleep(0.3)

    print()
    print(f"✅ 完成：成功 {success} 失败 {fail}")


if __name__ == "__main__":
    main()
