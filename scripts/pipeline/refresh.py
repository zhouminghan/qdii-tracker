"""
轻量申购状态刷新：仅拉取申购状态/限额 + 涨跌幅（批量接口，快）。
原 refresh_purchase.py 逻辑搬迁，import core+sources。
"""
import json
import time

from timezone_utils import beijing_now_iso
from core.constants import CATEGORIES, DATA_DIR
from core.utils import read_json, write_json, bump_generated_at
from sources.akshare_source import fetch_rank_data, fetch_purchase_data
from sources.eastmoney_source import fetch_lsjz


def main():
    import argparse
    parser = argparse.ArgumentParser(description="轻量申购状态刷新")
    parser.add_argument("--codes", help="逗号分隔的基金代码，仅处理这些；不传=全量")
    args = parser.parse_args()
    only_codes = set(args.codes.split(",")) if args.codes else None

    data_dir = DATA_DIR

    # 1. 批量拉取申购数据（全量，秒级）
    purchase_map = fetch_purchase_data()

    # 2. 批量拉取涨跌幅数据（全量，秒级）
    rank_map = fetch_rank_data()

    # 3. 合并到现有 JSON 文件，同时收集"批量接口漏网名单"以便走 lsjz 兜底
    fallback_targets = []
    for cat in CATEGORIES:
        fp = data_dir / f"{cat}.json"
        if not fp.exists():
            continue
        with open(fp, encoding="utf-8") as f:
            data = json.load(f)
        updated = 0
        for series in data["series"]:
            for share in series["shares"]:
                code = share["code"]
                if only_codes and code not in only_codes:
                    continue
                # 申购数据
                if code in purchase_map:
                    share.update(purchase_map[code])
                    updated += 1
                # 涨跌幅数据
                if code in rank_map:
                    new_nav_date = rank_map[code].get("nav_date")
                    cur_nav_date = share.get("nav_date", "")
                    if new_nav_date and cur_nav_date and new_nav_date < cur_nav_date:
                        for k, v in rank_map[code].items():
                            if v is not None and k not in ("nav_date", "nav", "nav_cum", "daily_change"):
                                share[k] = v
                    else:
                        for k, v in rank_map[code].items():
                            if v is not None:
                                share[k] = v
                else:
                    if cat != "etf":
                        fallback_targets.append((fp, share, code))
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  💾 {cat}.json  更新 {updated} 只份额的申购状态 + 涨跌幅")

    # 4. Fallback：对批量接口漏网的基金走 lsjz 单只兜底
    if fallback_targets:
        print()
        print("=" * 50)
        print(f"🩹 Fallback: AKShare 漏掉 {len(fallback_targets)} 只，走 lsjz 单只兜底")
        print("=" * 50)
        by_file = {}
        for fp, sh, code in fallback_targets:
            by_file.setdefault(fp, []).append((sh, code))

        fb_success = 0
        fb_fail = 0
        for fp, items in by_file.items():
            with open(fp, encoding="utf-8") as f:
                data = json.load(f)
            code_to_share = {}
            for series in data["series"]:
                for share in series["shares"]:
                    code_to_share[share["code"]] = share

            for sh_orig, code in items:
                if only_codes and code not in only_codes:
                    continue
                lsjz = fetch_lsjz(code)
                if not lsjz:
                    fb_fail += 1
                    print(f"  ❌ {code} lsjz 也无数据")
                    time.sleep(0.15)
                    continue
                target = code_to_share.get(code, sh_orig)
                # 防回退
                new_date = lsjz.get("nav_date")
                cur_date = target.get("nav_date", "")
                if new_date and cur_date and new_date < cur_date:
                    print(f"  ⏭️  {code} lsjz 日期({new_date}) 早于现存({cur_date})，跳过")
                    time.sleep(0.15)
                    continue
                changed = []
                for k, v in lsjz.items():
                    if v is not None and target.get(k) != v:
                        target[k] = v
                        changed.append(k)
                if changed:
                    fb_success += 1
                    print(f"  ✅ {code} 补上 {changed}")
                else:
                    print(f"  ✓  {code} lsjz 数据已是最新")
                time.sleep(0.15)

            with open(fp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  📊 Fallback 成功 {fb_success} / 失败 {fb_fail} / 共 {len(fallback_targets)}")

    # 5. 更新 meta
    now_str = beijing_now_iso()
    meta_fp = data_dir / "meta.json"
    if meta_fp.exists():
        meta = read_json(meta_fp)
        meta["generated_at"] = now_str
        meta["purchase_refreshed_at"] = now_str
        write_json(meta_fp, meta)
        print(f"  ✅ meta.json generated_at bumped -> {meta['generated_at']}")

    bump_generated_at()

    print("\n✅ 申购状态 + 涨跌幅刷新完成！")


if __name__ == "__main__":
    main()
