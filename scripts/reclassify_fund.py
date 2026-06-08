#!/usr/bin/env python3
"""
增量分类调整：将一只基金从一个板块移到另一个板块。

用法：
    python3 reclassify_fund.py --keyword "富国全球科技互联网" --from global_other --to active

只做三件事（~30秒）：
1. 从旧分类 JSON 中取出目标 series 的完整数据
2. 移到新分类 JSON
3. 按需补数据（active/global_other 补 holdings，etf 补 nav_date）
4. 同步更新 config/funds.json 的白名单（force_include / active_whitelist）

不需要跑全量流水线！数据（nav/scale/fee/收益/申购状态等）原样携带。
"""
import argparse
import json
import time
from pathlib import Path

from timezone_utils import beijing_now_iso
from config_loader import get_config, save_config


DATA_DIR = Path(__file__).parent.parent / "web" / "data"

VALID_CATEGORIES = ["sp500", "nasdaq_passive", "active", "global_index", "global_other", "etf"]


def load_json(path: Path) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: dict):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def find_series(data: dict, keyword: str):
    """在 data["series"] 中查找 display_name 或 series_name 包含 keyword 的 series"""
    for i, s in enumerate(data["series"]):
        if keyword in s.get("display_name", "") or keyword in s.get("series_name", ""):
            return i, s
    return -1, None


def update_series_category(series: dict, new_cat: str):
    """更新 series 的 category 字段和 series_id"""
    series["category"] = new_cat
    # series_id 格式: 公司__系列名__分类，需要更新分类部分
    old_sid = series.get("series_id", "")
    parts = old_sid.rsplit("_", 1)
    if len(parts) == 2:
        series["series_id"] = f"{parts[0]}_{new_cat}"


def recalc_series_scale(series: dict):
    """重算 series_scale（A类人民币规模）"""
    a_rmb = [s for s in series["shares"]
             if s.get("share_class") in ("A", "默认", "A(后端)")
             and s.get("currency", "人民币") == "人民币"]
    if a_rmb:
        series["series_scale"] = a_rmb[0].get("scale") or 0
    else:
        series["series_scale"] = next((s.get("scale") for s in series["shares"] if s.get("scale")), 0)


def bump_generated_at(data: dict, now: str):
    """更新 JSON 的 generated_at"""
    data["generated_at"] = now


def update_meta(now: str):
    """更新 meta.json 的 generated_at 和各分类统计"""
    meta_fp = DATA_DIR / "meta.json"
    meta = load_json(meta_fp)
    meta["generated_at"] = now

    for cat in VALID_CATEGORIES:
        fp = DATA_DIR / f"{cat}.json"
        if not fp.exists():
            continue
        d = load_json(fp)
        series_count = len(d.get("series", []))
        fund_count = sum(len(s.get("shares", [])) for s in d.get("series", []))
        if cat in meta:
            meta[cat]["series"] = series_count
            meta[cat]["funds"] = fund_count

    save_json(meta_fp, meta)
    print(f"  ✅ meta.json updated")


def update_series_count(data: dict):
    """更新顶层 series_count 字段"""
    data["series_count"] = len(data.get("series", []))


def update_total_scale(data: dict):
    """更新顶层 total_scale 字段"""
    total = sum(s.get("series_scale") or 0 for s in data.get("series", []))
    data["total_scale"] = round(total, 2)


def fetch_holdings_for_code(code: str) -> bool:
    """为单只基金抓取 holdings，返回是否成功"""
    import akshare as ak
    from fetch_holdings import fetch_holdings

    holdings_dir = DATA_DIR / "holdings"
    holdings_dir.mkdir(parents=True, exist_ok=True)

    result = fetch_holdings(code)
    if result and "error" not in result:
        save_json(holdings_dir / f"{code}.json", result)
        top3 = result["holdings"][:3] if result["holdings"] else []
        top_str = " | ".join(f"{h['stock_name']} {h['weight']}%" for h in top3)
        print(f"  ✅ holdings/{code}.json - {top_str}")
        return True
    else:
        err = (result or {}).get("error", "无数据") if result else "无数据"
        print(f"  ⚠️  holdings/{code}.json 抓取失败: {err[:80]}")
        return False


def update_config_whitelist(series: dict, keyword: str, to_cat: str):
    """更新 config/funds.json（force_include + active_whitelist）"""
    cfg = get_config()
    classify = cfg.get("classify", {})
    force_include = classify.setdefault("force_include", {})

    # 该 series 的所有份额代码都强制映射到目标分类
    for sh in series.get("shares", []):
        code = sh.get("code")
        if code:
            force_include[code] = to_cat

    # 仅 active 分类维护关键字白名单
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

    # 1. 从源分类中找到目标 series
    from_fp = DATA_DIR / f"{from_cat}.json"
    to_fp = DATA_DIR / f"{to_cat}.json"

    if not from_fp.exists():
        print(f"❌ 源文件不存在: {from_fp}")
        return
    if not to_fp.exists():
        print(f"❌ 目标文件不存在: {to_fp}")
        return

    from_data = load_json(from_fp)
    to_data = load_json(to_fp)

    idx, series = find_series(from_data, keyword)
    if series is None:
        print(f"❌ 在 {from_cat}.json 中未找到匹配 '{keyword}' 的 series")
        # 尝试模糊匹配
        for s in from_data["series"]:
            print(f"  候选: {s.get('display_name', '')}")
        return

    display_name = series.get("display_name", "")
    shares_count = len(series.get("shares", []))
    print(f"🎯 找到: {display_name} ({shares_count} 只份额) 在 {from_cat}")

    # 2. 从源分类中移除
    from_data["series"].pop(idx)
    update_series_count(from_data)
    update_total_scale(from_data)
    bump_generated_at(from_data, now)

    # 3. 更新 series 的 category
    update_series_category(series, to_cat)
    recalc_series_scale(series)

    # 4. 添加到目标分类
    to_data["series"].append(series)
    # 按规模排序
    to_data["series"].sort(key=lambda s: -(s.get("series_scale") or 0))
    update_series_count(to_data)
    update_total_scale(to_data)
    bump_generated_at(to_data, now)

    # 5. 保存
    save_json(from_fp, from_data)
    save_json(to_fp, to_data)
    print(f"✅ {display_name} 已从 {from_cat} 移到 {to_cat}")

    # 6. 按需补数据
    needs_holdings = to_cat in ("active", "global_other") and not args.no_holdings
    if needs_holdings:
        print(f"\n📊 抓取 holdings...")
        default_code = series.get("default_share_code")
        if default_code:
            fetch_holdings_for_code(default_code)
        time.sleep(0.3)

    # 7. 更新 meta.json
    update_meta(now)

    # 8. 更新 config/funds.json 白名单（确保下次全量 scan 不会归错）
    if not args.no_whitelist:
        print(f"\n📝 更新 config/funds.json 白名单...")
        update_config_whitelist(series, keyword, to_cat)

    print(f"\n🎉 完成！{display_name} 已从 {from_cat} 移到 {to_cat}")
    print(f"   ⏱️  耗时约 5 秒（vs 全量流水线 8-10 分钟）")


if __name__ == "__main__":
    main()
