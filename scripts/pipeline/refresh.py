"""
轻量申购状态刷新：仅拉取申购状态/限额 + 涨跌幅（批量接口，快）。
原 refresh_purchase.py 逻辑搬迁，import core+sources。
增加 buy_status_history 申购历史追踪。
"""
import json
import time
from datetime import datetime, timezone, timedelta

from core.constants import CATEGORIES, DATA_DIR
from core.utils import read_json, write_json, normalize_share_keys, beijing_now_iso
from sources.akshare_source import fetch_rank_data, fetch_purchase_data, fetch_etf_data
from sources.eastmoney_source import fetch_lsjz

TZ = timezone(timedelta(hours=8))


def _update_history(share):
    """申购状态历史追踪：同状态→更新日期，不同→新开条目"""
    today = datetime.now(TZ).strftime('%Y-%m-%d')
    hist = share.setdefault('buy_status_history', [])
    status = share.get('buy_status', '')
    # 暂停/开放申购时 daily_limit 无意义，不存储
    limit = share.get('daily_limit') if ('限' in status) else None
    curr = {
        'buy_status': status,
        'daily_limit': limit,
    }
    if hist:
        last = hist[-1]
        if (last.get('buy_status') == curr['buy_status'] 
            and last.get('daily_limit') == curr['daily_limit']):
            last['date'] = today
            return
    hist.append({'date': today, **curr})


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
                    _update_history(share)  # 追踪申购状态变化
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
        normalize_share_keys(data)
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  💾 {cat}.json  更新 {updated} 只份额的申购状态 + 涨跌幅")

    # 3b. ETF 场内数据更新（etf_price / etf_change_pct）
    # why：fetch_rank_data 是开放式基金接口，不含场内 ETF；
    #      ETF 场内价须单独拉 fund_etf_spot_em，否则增量更新里 etf_price 永不刷新
    etf_fp = data_dir / "etf.json"
    if etf_fp.exists():
        etf_map = fetch_etf_data()
        if etf_map:
            with open(etf_fp, encoding="utf-8") as f:
                etf_data = json.load(f)
            etf_updated = 0
            for series in etf_data.get("series", []):
                for share in series.get("shares", []):
                    if only_codes and share["code"] not in only_codes:
                        continue
                    info = etf_map.get(share["code"])
                    if info:
                        # 对齐 enrich：只刷场内价 + 涨跌幅（不引入 etf_volume/etf_scale_yi）
                        share["etf_price"] = info.get("etf_price")
                        share["etf_change_pct"] = info.get("etf_change_pct")
                        etf_updated += 1
            normalize_share_keys(etf_data)
            with open(etf_fp, "w", encoding="utf-8") as f:
                json.dump(etf_data, f, ensure_ascii=False, indent=2)
                f.write("\n")
            print(f"  💾 etf.json 更新 {etf_updated} 只 ETF 场内价/涨跌幅")

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

            normalize_share_keys(data)
            with open(fp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  📊 Fallback 成功 {fb_success} / 失败 {fb_fail} / 共 {len(fallback_targets)}")

    # 5. 更新 meta
    now_str = beijing_now_iso()
    meta_fp = data_dir / "meta.json"
    if meta_fp.exists():
        meta = read_json(meta_fp)
        meta["generated_at"] = now_str
        write_json(meta_fp, meta)
        print(f"  ✅ meta.json generated_at bumped -> {meta['generated_at']}")

    print("\n✅ 申购状态 + 涨跌幅刷新完成！")


if __name__ == "__main__":
    main()
