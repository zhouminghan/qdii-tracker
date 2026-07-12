"""
增量分类调整：将一只基金从一个板块移到另一个板块。
原 reclassify_fund.py 逻辑搬迁，import core+sources。
"""
import argparse
import time

from core.constants import CATEGORIES, DATA_DIR, HOLDINGS_DIR, HOLDINGS_CATEGORIES
from core.utils import read_json, write_json, normalize_share_keys, normalize_holdings_keys, beijing_now_iso, calc_series_scale
from core.config_loader import get_config, save_config
from sources.akshare_source import fetch_holdings


VALID_CATEGORIES = CATEGORIES


def find_series(data: dict, keyword: str):
    for i, s in enumerate(data["series"]):
        if keyword in s.get("display_name", "") or keyword in s.get("series_name", ""):
            return i, s
    return -1, None


def update_series_category(series: dict, new_cat: str):
    series["category"] = new_cat
    old_sid = series.get("series_id", "")
    parts = old_sid.rsplit("_", 1)
    if len(parts) == 2:
        series["series_id"] = f"{parts[0]}_{new_cat}"


def recalc_series_scale(series: dict):
    series["series_scale"] = calc_series_scale(series["shares"])


def update_meta(now: str):
    meta_fp = DATA_DIR / "meta.json"
    meta = read_json(meta_fp)
    meta["generated_at"] = now

    for cat in VALID_CATEGORIES:
        fp = DATA_DIR / f"{cat}.json"
        if not fp.exists():
            continue
        d = read_json(fp)
        series_count = len(d.get("series", []))
        fund_count = sum(len(s.get("shares", [])) for s in d.get("series", []))
        if cat in meta:
            meta[cat]["series"] = series_count
            meta[cat]["funds"] = fund_count

    write_json(meta_fp, meta)
    print(f"  ✅ meta.json updated")


def update_series_count(data: dict):
    data["series_count"] = len(data.get("series", []))


def update_total_scale(data: dict):
    total = sum(s.get("series_scale") or 0 for s in data.get("series", []))
    data["total_scale"] = round(total, 2)


def fetch_holdings_for_code(code: str) -> bool:
    holdings_dir = HOLDINGS_DIR
    holdings_dir.mkdir(parents=True, exist_ok=True)

    result = fetch_holdings(code)
    if result and "error" not in result:
        normalize_holdings_keys(result)
        write_json(holdings_dir / f"{code}.json", result)
        top3 = result["holdings"][:3] if result["holdings"] else []
        top_str = " | ".join(f"{h['stock_name']} {h['weight']}%" for h in top3)
        print(f"  ✅ holdings/{code}.json - {top_str}")
        return True
    else:
        err = (result or {}).get("error", "无数据") if result else "无数据"
        print(f"  ⚠️  holdings/{code}.json 抓取失败: {err[:80]}")
        return False


def update_config_whitelist(series: dict, keyword: str, to_cat: str):
    cfg = get_config()
    classify = cfg.get("classify", {})
    force_include = classify.setdefault("force_include", {})

    for sh in series.get("shares", []):
        code = sh.get("code")
        if code:
            force_include[code] = to_cat

    if to_cat == "active":
        wl = classify.setdefault("active_whitelist", [])
        if keyword not in wl:
            wl.append(keyword)

    save_config(cfg)
    print("  ✅ config/funds.json 已更新（force_include/active_whitelist）")


def main():
    parser = argparse.ArgumentParser(description="增量分类调整：将一只基金从一个板块移到另一个板块")
    parser.add_argument("--keyword", required=True, help="基金关键词（匹配 display_name 或 series_name）")
    parser.add_argument("--from", dest="from_cat", required=True, choices=VALID_CATEGORIES, help="源分类")
    parser.add_argument("--to", dest="to_cat", required=True, choices=VALID_CATEGORIES, help="目标分类")
    parser.add_argument("--no-holdings", action="store_true", help="跳过 holdings 抓取（移到非主动分类时可用）")
    parser.add_argument("--no-whitelist", action="store_true", help="跳过 config/funds.json 白名单更新")
    args = parser.parse_args()

    now = beijing_now_iso()
    keyword = args.keyword
    from_cat = args.from_cat
    to_cat = args.to_cat

    from_fp = DATA_DIR / f"{from_cat}.json"
    to_fp = DATA_DIR / f"{to_cat}.json"

    if not from_fp.exists():
        print(f"❌ 源文件不存在: {from_fp}")
        return
    if not to_fp.exists():
        print(f"❌ 目标文件不存在: {to_fp}")
        return

    from_data = read_json(from_fp)
    to_data = read_json(to_fp)

    idx, series = find_series(from_data, keyword)
    if series is None:
        print(f"❌ 在 {from_cat}.json 中未找到匹配 '{keyword}' 的 series")
        for s in from_data["series"]:
            print(f"  候选: {s.get('display_name', '')}")
        return

    display_name = series.get("display_name", "")
    shares_count = len(series.get("shares", []))
    print(f"🎯 找到: {display_name} ({shares_count} 只份额) 在 {from_cat}")

    from_data["series"].pop(idx)
    update_series_count(from_data)
    update_total_scale(from_data)

    update_series_category(series, to_cat)
    recalc_series_scale(series)

    to_data["series"].append(series)
    to_data["series"].sort(key=lambda s: -(s.get("series_scale") or 0))
    update_series_count(to_data)
    update_total_scale(to_data)

    normalize_share_keys(from_data)
    normalize_share_keys(to_data)
    write_json(from_fp, from_data)
    write_json(to_fp, to_data)
    print(f"✅ {display_name} 已从 {from_cat} 移到 {to_cat}")

    needs_holdings = to_cat in HOLDINGS_CATEGORIES and not args.no_holdings
    if needs_holdings:
        print(f"\n📊 抓取 holdings...")
        default_code = series.get("default_share_code")
        if default_code:
            fetch_holdings_for_code(default_code)
        time.sleep(0.3)

    update_meta(now)

    if not args.no_whitelist:
        print(f"\n📝 更新 config/funds.json 白名单...")
        update_config_whitelist(series, keyword, to_cat)

    print(f"\n🎉 完成！{display_name} 已从 {from_cat} 移到 {to_cat}")
    print(f"   ⏱️  耗时约 5 秒（vs 全量流水线 8-10 分钟）")


if __name__ == "__main__":
    main()
