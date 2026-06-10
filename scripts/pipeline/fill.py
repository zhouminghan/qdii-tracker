"""
用天天基金 lsjz API + pingzhongdata 双数据源补全缺失字段。
原 fill_missing.py 逻辑搬迁，import core+sources。
"""
import json
import re
import time

from timezone_utils import beijing_now_iso
from core.constants import CATEGORIES, DATA_DIR, ETF_SKIP_FIELDS, ALWAYS_OVERWRITE_FIELDS
from core.utils import to_float, read_json, write_json, bump_generated_at
from sources.eastmoney_source import fetch_lsjz, fetch_pzd, fetch_f10, fetch_fee_rules
from sources.akshare_source import fetch_ytd, fetch_inception_return


def merge_share_data(share: dict, pzd: dict, is_etf: bool = False):
    """
    合并 pzd 数据到 share。
    - nav/nav_date/daily_change：每天都会变 → 强制覆盖（ETF 跳过这三个字段）
    - 历史收益（chg_1m/3m/6m/1y）：只填空白，避免旧值被异常返回污染
    防回退机制：nav_date 只允许前进。
    """
    updated = []

    skip_nav_fields = False
    if not is_etf:
        new_nav_date = pzd.get("nav_date")
        cur_nav_date = share.get("nav_date", "")
        if not new_nav_date:
            skip_nav_fields = True
        elif cur_nav_date and new_nav_date < cur_nav_date:
            for key in ("chg_1m", "chg_3m", "chg_6m", "chg_1y"):
                new_val = pzd.get(key)
                if new_val is not None and share.get(key) in (None, "", 0):
                    share[key] = new_val
                    updated.append(key)
            return updated

    candidate_keys = [
        "nav", "nav_date", "daily_change",
        "chg_1m", "chg_3m", "chg_6m", "chg_1y",
    ]
    for key in candidate_keys:
        if is_etf and key in ETF_SKIP_FIELDS:
            continue
        if skip_nav_fields and key in ALWAYS_OVERWRITE_FIELDS:
            continue
        new_val = pzd.get(key)
        if new_val is None:
            continue
        cur = share.get(key)
        if key in ALWAYS_OVERWRITE_FIELDS:
            share[key] = new_val
            if cur != new_val:
                updated.append(key)
        else:
            if cur in (None, "", 0):
                share[key] = new_val
                updated.append(key)
    return updated


def main():
    import argparse
    parser = argparse.ArgumentParser(description="补全缺失字段：净值/YTD/历史收益/费率")
    parser.add_argument("--codes", help="逗号分隔的基金代码，仅处理这些；不传=全量")
    args = parser.parse_args()
    only_codes = set(args.codes.split(",")) if args.codes else None

    data_dir = DATA_DIR
    data_dir.mkdir(parents=True, exist_ok=True)

    loaded_data = {}
    for cat in CATEGORIES:
        fp = data_dir / f"{cat}.json"
        if fp.exists():
            loaded_data[cat] = read_json(fp)
        else:
            print(f"⚠️  {cat}.json 不存在，跳过（首次运行需先跑 scan + enrich）")

    # ------------------------- Pass 1：净值 + 历史收益 -------------------------
    targets = []
    for cat, d in loaded_data.items():
        is_etf = (cat == "etf")
        for s in d["series"]:
            for sh in s["shares"]:
                if is_etf:
                    probe_keys = ["chg_1m", "chg_1y"]
                    missing = [k for k in probe_keys if sh.get(k) in (None, "", 0)]
                    targets.append((cat, sh["code"], sh, missing or ["nav_date"], is_etf))
                else:
                    probe_keys = ["chg_1m", "chg_1y"]
                    missing = [k for k in probe_keys if sh.get(k) in (None, "", 0)]
                    targets.append((cat, sh["code"], sh, missing or ["daily-refresh"], is_etf))

    total = len(targets)
    print(f"🎯 Pass 1: {total} 只基金需处理（场外每日刷新 nav/daily_change + 历史收益补漏；ETF 仅补漏历史收益 + nav_date）"
          + (f"（仅 {only_codes}）" if only_codes else ""))
    print(f"   数据源：lsjz API（净值，快）+ pingzhongdata（历史收益，慢）")
    print()

    success = 0
    fail = 0
    for i, (cat, code, sh, missing, is_etf) in enumerate(targets, 1):
        if only_codes and code not in only_codes:
            continue
        lsjz = fetch_lsjz(code)
        pzd = fetch_pzd(code)

        if lsjz and pzd:
            for key in ("nav", "nav_date", "daily_change"):
                if key in lsjz:
                    pzd[key] = lsjz[key]
            merged = pzd
        elif lsjz:
            merged = lsjz
        elif pzd:
            merged = pzd
        else:
            merged = None

        if merged:
            up = merge_share_data(sh, merged, is_etf=is_etf)
            if is_etf:
                new_nd = lsjz.get("nav_date") if lsjz else None
                cur_nd = sh.get("nav_date", "")
                if new_nd and (not cur_nd or new_nd >= cur_nd):
                    sh["nav_date"] = new_nd
                    if "nav_date" not in up:
                        up.append("nav_date")
            if up:
                success += 1
                tag = "[ETF]" if is_etf else "     "
                src = "lsjz" if lsjz else "pzd"
                print(f"  [{i}/{total}] ✅ {tag} {code} [{src}] 补上 {up}")
            else:
                print(f"  [{i}/{total}] ✓  {code} 数据已是最新（无变化）")
        else:
            fail += 1
            print(f"  [{i}/{total}] ❌ {code} lsjz+pzd 均失败")
        time.sleep(0.15)

    # ------------------------- Pass 2：F10 基础信息 + 费率 -------------------------
    print()
    print("=" * 50)
    print("Pass 2: 从 F10 补充规模/成立日期/基金经理/费率")
    print("=" * 50)
    f10_targets = []
    for cat, d in loaded_data.items():
        for s in d["series"]:
            for sh in s["shares"]:
                if sh.get("scale") in (None, "", 0) or \
                   sh.get("established") in (None, "") or \
                   sh.get("manager") in (None, "") or \
                   sh.get("sale_service_fee") is None or \
                   sh.get("mgmt_fee") is None or \
                   sh.get("first_buy_rate") is None:
                    f10_targets.append((cat, sh["code"], sh))
    total2 = len(f10_targets)
    print(f"🎯 目标：{total2} 只缺基础信息/费率"
          + (f"（仅 {only_codes}）" if only_codes else ""))
    success2 = 0
    for i, (cat, code, sh) in enumerate(f10_targets, 1):
        if only_codes and code not in only_codes:
            continue
        info = fetch_f10(code)
        if info:
            changed = []
            for key in ["scale", "scale_raw", "established", "manager",
                        "sale_service_fee", "mgmt_fee", "custody_fee", "first_buy_rate"]:
                if info.get(key) is not None and sh.get(key) in (None, "", 0):
                    if key == "sale_service_fee" and sh.get("share_class") in ("A", "默认", "A(后端)"):
                        if info[key] > 0.05:
                            continue
                    sh[key] = info[key]
                    changed.append(key)
            if changed:
                success2 += 1
                print(f"  [{i}/{total2}] ✅ {code} 补上 {changed}")
        else:
            print(f"  [{i}/{total2}] ❌ {code} F10 失败")
        time.sleep(0.2)

    # ------------------------- Pass 2b：补 buy_rules / sell_rules -------------------------
    print()
    print("=" * 50)
    print("Pass 2b: 从天天基金费率页补充买入/卖出规则（缺失时）")
    print("=" * 50)
    fee_targets = []
    for cat, d in loaded_data.items():
        for s in d["series"]:
            for sh in s["shares"]:
                if not sh.get("buy_rules") and not sh.get("sell_rules"):
                    fee_targets.append((cat, sh["code"], sh))
    total2b = len(fee_targets)
    print(f"🎯 目标：{total2b} 只缺买卖规则"
          + (f"（仅 {only_codes}）" if only_codes else ""))
    success2b = 0
    for i, (cat, code, sh) in enumerate(fee_targets, 1):
        if only_codes and code not in only_codes:
            continue
        rules = fetch_fee_rules(code)
        if rules:
            sh["buy_rules"] = rules.get("buy_rules", [])
            sh["sell_rules"] = rules.get("sell_rules", [])
            # 免赎回费天数
            for rule in sh["sell_rules"]:
                if rule["rate"] == 0:
                    m = re.search(r"(\d+(?:\.\d+)?)\s*[天日]", rule["condition"])
                    if m:
                        sh["free_hold_days"] = int(float(m.group(1)))
                        break
            success2b += 1
        if (i) % 20 == 0:
            print(f"  进度: {i}/{total2b}")
        time.sleep(0.2)
    print(f"  ✅ 补上 {success2b}/{total2b} 只的买卖规则")

    # ------------------------- Pass 3：YTD 今年来收益 -------------------------
    print()
    print("=" * 50)
    print("Pass 3: 补充今年来收益率 chg_ytd")
    print("=" * 50)
    ytd_targets = []
    for cat, d in loaded_data.items():
        for s in d["series"]:
            for sh in s["shares"]:
                if sh.get("chg_ytd") in (None, "", 0):
                    ytd_targets.append((cat, sh["code"], sh))
    total3 = len(ytd_targets)
    print(f"🎯 目标：{total3} 只缺 YTD 数据")
    success3 = 0
    fail3 = 0
    for i, (cat, code, sh) in enumerate(ytd_targets, 1):
        ytd = fetch_ytd(code)
        if ytd is not None:
            sh["chg_ytd"] = ytd
            success3 += 1
            print(f"  [{i}/{total3}] ✅ {code} YTD = {ytd:+.2f}%")
        else:
            fail3 += 1
            print(f"  [{i}/{total3}] ❌ {code} 无累计收益率数据")
        time.sleep(0.2)

    # ------------------------- Pass 4：成立来收益 chg_since_inception -------------------------
    print()
    print("=" * 50)
    print("Pass 4: 补充成立来收益 chg_since_inception")
    print("=" * 50)
    inception_targets = []
    for cat, d in loaded_data.items():
        if cat == "etf":
            continue
        for s in d["series"]:
            for sh in s["shares"]:
                if sh.get("chg_since_inception") is None:
                    inception_targets.append((cat, sh["code"], sh))
    total4 = len(inception_targets)
    print(f"🎯 目标：{total4} 只缺成立来数据" + (f"（仅 {only_codes}）" if only_codes else ""))
    success4 = 0
    fail4 = 0
    for i, (cat, code, sh) in enumerate(inception_targets, 1):
        if only_codes and code not in only_codes:
            continue
        val = fetch_inception_return(code)
        if val is not None:
            sh["chg_since_inception"] = val
            success4 += 1
            if (i) % 10 == 0:
                print(f"  进度: {i}/{total4}")
        else:
            fail4 += 1
        time.sleep(0.3)
    print(f"  ✅ 补上 {success4}/{total4} 只的成立来收益")

    # ------------------------- 统一写回 -------------------------
    print("\n💾 写回板块数据...")
    for cat, d in loaded_data.items():
        for s in d["series"]:
            a_rmb = [sh for sh in s["shares"]
                     if sh.get("share_class") in ("A", "默认")
                     and sh.get("currency", "人民币") == "人民币"]
            if a_rmb and a_rmb[0].get("scale"):
                s["series_scale"] = a_rmb[0]["scale"]
            elif not s.get("series_scale"):
                s["series_scale"] = next((sh.get("scale") for sh in s["shares"] if sh.get("scale")), 0)
        fp = data_dir / f"{cat}.json"
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
        print(f"  ✅ {cat}.json")

    # bump meta.generated_at
    bump_generated_at()

    print()
    print(f"📊 总结：Pass1 成功 {success} / 失败 {fail} / 共 {total}")
    print(f"         Pass2 成功 {success2} / 共 {total2}")
    print(f"         Pass3 成功 {success3} / 失败 {fail3} / 共 {total3}")


if __name__ == "__main__":
    main()
