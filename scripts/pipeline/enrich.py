"""
丰富基金数据：涨跌幅/限额/申购状态/规模/基金经理/成立时间/费率。
原 enrich_data.py 逻辑搬迁，import core+sources。
"""
import json
import time

from timezone_utils import beijing_now_iso
from core.constants import CATEGORIES, DATA_DIR, CURRENCY_RANK, SHARE_CLASS_RANK
from core.utils import read_json, write_json, bump_generated_at
from sources.akshare_source import fetch_rank_data, fetch_purchase_data, fetch_etf_data
from sources.eastmoney_source import fetch_lsjz
from sources.xueqiu_source import fetch_basic_info, fetch_fee_detail


def share_sort_key(share: dict) -> tuple:
    """
    份额排序键（小的在前）
    排序规则：
    1. 币种：人民币 < 美元 < 欧元 < 港币
    2. 份额类型：A < C < E < F < H < I < Q < R < LOF < FOF < 默认
    3. 代码（数字小的在前）
    """
    cr = CURRENCY_RANK.get(share.get("currency"), 9)
    class_r = SHARE_CLASS_RANK.get(share.get("share_class"), 99)
    return (cr, class_r, share.get("code", ""))


def main():
    import argparse
    parser = argparse.ArgumentParser(description="丰富基金数据：规模/费率/经理/收益")
    parser.add_argument("--codes", help="逗号分隔的基金代码，仅处理这些；不传=全量")
    args = parser.parse_args()
    only_codes = set(args.codes.split(",")) if args.codes else None

    data_dir = DATA_DIR

    # Step 1: 批量数据（快）
    rank_map = fetch_rank_data()
    purchase_map = fetch_purchase_data()
    etf_map = fetch_etf_data()

    # Step 2: 收集所有要补基础信息的基金代码
    all_codes = []
    series_by_cat = {}
    for cat in CATEGORIES:
        fp = data_dir / f"{cat}.json"
        if not fp.exists():
            continue
        series_by_cat[cat] = read_json(fp)
        for series in series_by_cat[cat]["series"]:
            for share in series["shares"]:
                all_codes.append(share["code"])

    total = len(all_codes)
    print(f"\n🔍 需要补基础信息的基金: {total} 只")

    # Step 3: 逐只拉取基础信息（慢，带进度）
    basic_info_map = {}
    fee_detail_map = {}
    filtered_codes = [c for c in all_codes if not only_codes or c in only_codes]
    print(f"⏳ 开始抓取规模/经理/成立时间 + 费率详情（逐只调用雪球接口）..."
          + (f"（仅 {len(filtered_codes)} 只）" if only_codes else ""))
    for i, code in enumerate(filtered_codes, 1):
        basic = fetch_basic_info(code)
        basic_info_map[code] = basic
        fee_detail_map[code] = fetch_fee_detail(code)
        if i % 10 == 0 or i == total:
            fd = fee_detail_map[code]
            free_days = fd.get('free_hold_days')
            buy_rate = fd.get('first_buy_rate')
            print(f"  进度: {i}/{total}  最新: {code} 规模={basic.get('scale_raw', '--')} 首档买入={buy_rate} 免费持有={free_days}天")
        time.sleep(0.2)

    # Step 4: 合并所有数据到 series 里
    print("\n🔀 合并数据并计算默认份额（按规模最大）...")
    for cat in CATEGORIES:
        if cat not in series_by_cat:
            continue
        data = series_by_cat[cat]
        for series in data["series"]:
            for share in series["shares"]:
                code = share["code"]
                # 涨跌幅数据：防回退
                rank_info = rank_map.get(code, {})
                if rank_info:
                    new_nav_date = rank_info.get("nav_date")
                    cur_nav_date = share.get("nav_date", "")
                    if new_nav_date and cur_nav_date and new_nav_date < cur_nav_date:
                        for k, v in rank_info.items():
                            if v is not None and k not in ("nav_date", "nav", "nav_cum", "daily_change"):
                                share[k] = v
                    else:
                        for k, v in rank_info.items():
                            if v is not None:
                                share[k] = v
                share.update(purchase_map.get(code, {}))
                share.update(basic_info_map.get(code, {}))
                share.update(fee_detail_map.get(code, {}))

                # ETF 场内数据
                etf_info = etf_map.get(code)
                if etf_info:
                    if etf_info.get("etf_scale_yi") and not share.get("scale"):
                        share["scale"] = etf_info["etf_scale_yi"]
                        share["scale_raw"] = f"{etf_info['etf_scale_yi']:.2f}亿"
                    share["etf_price"] = etf_info.get("etf_price")
                    share["etf_change_pct"] = etf_info.get("etf_change_pct")
                    # ETF nav_date 用 lsjz 真实披露日
                    new_nav_date = fetch_lsjz(code)
                    cur_nav_date = share.get("nav_date", "")
                    if new_nav_date and new_nav_date.get("nav_date"):
                        nd = new_nav_date["nav_date"]
                        if not cur_nav_date or nd >= cur_nav_date:
                            share["nav_date"] = nd
                    time.sleep(0.15)

            # 份额排序
            series["shares"].sort(key=share_sort_key)
            series["default_share_code"] = series["shares"][0]["code"] if series["shares"] else None
            # series_scale 取 A 类人民币份额规模
            a_rmb = [s for s in series["shares"]
                     if s.get("share_class") in ("A", "默认", "A(后端)")
                     and s.get("currency", "人民币") == "人民币"]
            if a_rmb:
                series["series_scale"] = a_rmb[0].get("scale") or 0
            else:
                series["series_scale"] = next((s.get("scale") for s in series["shares"] if s.get("scale")), 0)

        # 系列按规模排序
        data["series"].sort(key=lambda s: -(s.get("series_scale") or 0))
        total_scale = sum(s.get("series_scale") or 0 for s in data["series"])
        data["total_scale"] = round(total_scale, 2)
        data["enriched_at"] = beijing_now_iso()

        with open(data_dir / f"{cat}.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  💾 {cat}.json  系列数={len(data['series'])}  总规模={data['total_scale']}亿")

    # 更新 meta
    bump_generated_at()

    print("\n✅ 全量丰富完成！")


if __name__ == "__main__":
    main()
