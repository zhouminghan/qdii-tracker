"""
用天天基金 lsjz API + pingzhongdata 双数据源补全缺失字段。
原 fill_missing.py 逻辑搬迁，import core+sources。
Pass 1 API 调用使用 ThreadPoolExecutor 并行化（I/O 密集瓶颈）。
含申购状态刷新 + buy_status_history 数组追踪（原 refresh.py 逻辑已并入）。
"""
import json
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from core.constants import CATEGORIES, DATA_DIR, ETF_SKIP_FIELDS, ALWAYS_OVERWRITE_FIELDS
from core.utils import to_float, read_json, write_json, bump_generated_at, normalize_share_keys, beijing_now_iso
from sources.eastmoney_source import fetch_lsjz, fetch_pzd, fetch_f10, fetch_fee_rules
from sources.akshare_source import fetch_ytd, fetch_inception_return, fetch_etf_data, fetch_purchase_data, fetch_rank_data


def _update_history(share: dict, today: str):
    """申购变更追踪：状态和额度都没变 → 保持原有日期不写入；任一变化 → 追加新条目。ETF 跳过。"""
    status = share.get("buy_status", "")
    if not status or share.get("currency") == "美元" or "场内" in status:
        return
    dlimit = share.get("daily_limit", None)
    history = share.get("buy_status_history")
    if not isinstance(history, list):
        history = []
        share["buy_status_history"] = history
    entry = {"date": today, "buy_status": status, "daily_limit": dlimit}
    if history and history[-1].get("buy_status") == status and history[-1].get("daily_limit") == dlimit:
        # 状态和额度都没变 → 保持原有日期，不写入
        pass
    else:
        history.append(entry)

# 并发数：4 线程平衡速度与反爬风险
MAX_WORKERS = 4
# 限速信号量：保证不会瞬间把 API 打爆
_sem = threading.BoundedSemaphore(MAX_WORKERS)
_print_lock = threading.Lock()


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


# ======================== 并行 Worker ========================

def _fetch_lsjz_pzd(code: str):
    """Worker: 单只基金的 lsjz + pzd API 调用（两次信号量，保证并发 ≤ MAX_WORKERS）"""
    with _sem:
        lsjz = fetch_lsjz(code)
    with _sem:
        pzd = fetch_pzd(code)
    return lsjz, pzd


def _fetch_f10_wrapped(code: str):
    with _sem:
        return fetch_f10(code)


def _fetch_ytd_wrapped(code: str):
    with _sem:
        return fetch_ytd(code)


def _fetch_inception_wrapped(code: str):
    with _sem:
        return fetch_inception_return(code)


def _safe_print(*args, **kwargs):
    with _print_lock:
        print(*args, **kwargs)


# ======================== Main ========================

def main():
    import argparse
    parser = argparse.ArgumentParser(description="补全缺失字段：净值/YTD/历史收益/费率")
    parser.add_argument("--codes", help="逗号分隔的基金代码，仅处理这些；不传=全量")
    args = parser.parse_args()
    only_codes = set(args.codes.split(",")) if args.codes else None

    data_dir = DATA_DIR
    data_dir.mkdir(parents=True, exist_ok=True)

    loaded_data = _load_categories(data_dir)
    s1 = _fill_nav_and_returns(loaded_data, only_codes)
    s2 = _fill_basic_info(loaded_data, only_codes)
    s3, f3 = _fill_ytd(loaded_data, only_codes)
    s4, f4 = _fill_inception(loaded_data, only_codes)
    _write_back(data_dir, loaded_data)
    _fill_etf_prices(data_dir, only_codes)
    _refresh_purchase_status(data_dir, only_codes)

    print()
    print(f"📊 总结：Pass1(净值) {s1[0]} / {s1[1]} / {s1[2]} | Pass2(基础) {s2} | Pass3(YTD) {s3}/{f3} | Pass4(成立来) {s4}/{f4}")


def _load_categories(data_dir):
    loaded = {}
    for cat in CATEGORIES:
        fp = data_dir / f"{cat}.json"
        if fp.exists():
            loaded[cat] = read_json(fp)
        else:
            print(f"⚠️  {cat}.json 不存在，跳过（首次运行需先跑 scan + enrich）")
    return loaded


def _fill_nav_and_returns(loaded_data, only_codes):
    targets = []
    for cat, d in loaded_data.items():
        is_etf = (cat == "etf")
        for s in d["series"]:
            for sh in s["shares"]:
                if only_codes and sh["code"] not in only_codes:
                    continue
                probe_keys = ["chg_1m", "chg_1y"]
                missing = [k for k in probe_keys if sh.get(k) in (None, "", 0)]
                targets.append((cat, sh["code"], sh, missing or (["nav_date"] if is_etf else ["daily-refresh"]), is_etf))

    total = len(targets)
    print(f"🎯 Pass 1: {total} 只基金需处理（lsjz+pzd，{MAX_WORKERS} 线程并行）")
    success = fail = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_map = {}
        for cat, code, sh, missing, is_etf in targets:
            future = executor.submit(_fetch_lsjz_pzd, code)
            future_map[future] = (cat, code, sh, is_etf)

        for i, future in enumerate(as_completed(future_map), 1):
            cat, code, sh, is_etf = future_map[future]
            try:
                lsjz, pzd = future.result()
            except Exception as e:
                _safe_print(f"  [{i}/{total}] ❌ {code} worker 异常: {e}")
                fail += 1
                continue

            merged = None
            if lsjz and pzd:
                for key in ("nav", "nav_date", "daily_change"):
                    if key in lsjz: pzd[key] = lsjz[key]
                merged = pzd
            elif lsjz: merged = lsjz
            elif pzd:  merged = pzd

            if merged:
                up = merge_share_data(sh, merged, is_etf=is_etf)
                if is_etf:
                    new_nd = lsjz.get("nav_date") if lsjz else None
                    cur_nd = sh.get("nav_date", "")
                    if new_nd and (not cur_nd or new_nd >= cur_nd):
                        sh["nav_date"] = new_nd
                        if "nav_date" not in up: up.append("nav_date")
                if up:
                    success += 1
                    _safe_print(f"  [{i}/{total}] ✅ {'[ETF]' if is_etf else '     '} {code} [{('lsjz' if lsjz else 'pzd')}] 补上 {up}")
                else:
                    _safe_print(f"  [{i}/{total}] ✓  {code} 数据已是最新")
            else:
                fail += 1
                _safe_print(f"  [{i}/{total}] ❌ {code} lsjz+pzd 均失败")
    return success, fail, total


def _fill_basic_info(loaded_data, only_codes):
    print("\n" + "=" * 50 + "\nPass 2: F10 补充规模/成立日期/基金经理/费率\n" + "=" * 50)
    f10_targets = [(cat, sh["code"], sh) for cat, d in loaded_data.items()
                   for s in d["series"] for sh in s["shares"]
                   if (not only_codes or sh["code"] in only_codes)
                   and (sh.get("scale") in (None, "", 0) or sh.get("established") in (None, "")
                        or sh.get("manager") in (None, "") or sh.get("sale_service_fee") is None
                        or sh.get("mgmt_fee") is None or sh.get("first_buy_rate") is None)]
    total2 = len(f10_targets)
    print(f"🎯 目标：{total2} 只")
    success2 = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_map = {executor.submit(_fetch_f10_wrapped, code): (cat, code, sh)
                      for cat, code, sh in f10_targets}
        for i, future in enumerate(as_completed(future_map), 1):
            cat, code, sh = future_map[future]
            try: info = future.result()
            except Exception as e: _safe_print(f"  [{i}/{total2}] ❌ {code} worker 异常: {e}"); continue
            if info:
                changed = []
                for key in ["scale","scale_raw","established","manager","sale_service_fee","mgmt_fee","custody_fee","first_buy_rate"]:
                    if info.get(key) is not None and sh.get(key) in (None, "", 0):
                        if key == "sale_service_fee" and sh.get("share_class") in ("A", "默认", "A(后端)") and info[key] > 0.05: continue
                        sh[key] = info[key]; changed.append(key)
                if changed: success2 += 1; _safe_print(f"  [{i}/{total2}] ✅ {code} 补上 {changed}")
            else: _safe_print(f"  [{i}/{total2}] ❌ {code} F10 失败")

    # Pass 2b
    print("\n" + "=" * 50 + "\nPass 2b: 补充 buy_rules / sell_rules\n" + "=" * 50)
    fee_targets = [(cat, sh["code"], sh) for cat, d in loaded_data.items()
                   for s in d["series"] for sh in s["shares"]
                   if (not only_codes or sh["code"] in only_codes)
                   and not sh.get("buy_rules") and not sh.get("sell_rules")]
    total2b = len(fee_targets)
    print(f"🎯 目标：{total2b} 只")
    success2b = 0
    for i, (cat, code, sh) in enumerate(fee_targets, 1):
        rules = fetch_fee_rules(code)
        if rules:
            sh["buy_rules"] = rules.get("buy_rules", []); sh["sell_rules"] = rules.get("sell_rules", [])
            for rule in sh["sell_rules"]:
                if rule["rate"] == 0:
                    m = re.search(r"(\d+(?:\.\d+)?)\s*[天日]", rule["condition"])
                    if m: sh["free_hold_days"] = int(float(m.group(1))); break
            success2b += 1
        if (i) % 20 == 0: print(f"  进度: {i}/{total2b}")
    print(f"  ✅ 补上 {success2b}/{total2b} 只")
    return success2


def _fill_ytd(loaded_data, only_codes):
    print("\n" + "=" * 50 + "\nPass 3: chg_ytd\n" + "=" * 50)
    ytd_targets = [(cat, sh["code"], sh) for cat, d in loaded_data.items()
                   for s in d["series"] for sh in s["shares"]
                   if (not only_codes or sh["code"] in only_codes)
                   and sh.get("chg_ytd") in (None, "", 0)]
    total3 = len(ytd_targets)
    print(f"🎯 目标：{total3} 只")
    s = f = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_map = {executor.submit(_fetch_ytd_wrapped, code): (cat, code, sh) for cat, code, sh in ytd_targets}
        for i, future in enumerate(as_completed(future_map), 1):
            cat, code, sh = future_map[future]
            try: ytd = future.result()
            except Exception as e: _safe_print(f"  [{i}/{total3}] ❌ {code} worker 异常: {e}"); f += 1; continue
            if ytd is not None: sh["chg_ytd"] = ytd; s += 1; _safe_print(f"  [{i}/{total3}] ✅ {code} YTD = {ytd:+.2f}%")
            else: f += 1; _safe_print(f"  [{i}/{total3}] ❌ {code} 无数据")
    return s, f


def _fill_inception(loaded_data, only_codes):
    print("\n" + "=" * 50 + "\nPass 4: chg_since_inception\n" + "=" * 50)
    inception_targets = [(cat, sh["code"], sh) for cat, d in loaded_data.items() if cat != "etf"
                         for s in d["series"] for sh in s["shares"]
                         if (not only_codes or sh["code"] in only_codes)
                         and sh.get("chg_since_inception") is None]
    total4 = len(inception_targets)
    print(f"🎯 目标：{total4} 只")
    s = f = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_map = {executor.submit(_fetch_inception_wrapped, code): (cat, code, sh) for cat, code, sh in inception_targets}
        for i, future in enumerate(as_completed(future_map), 1):
            cat, code, sh = future_map[future]
            try: val = future.result()
            except Exception as e: _safe_print(f"  [{i}/{total4}] ❌ {code} worker 异常: {e}"); f += 1; continue
            if val is not None: sh["chg_since_inception"] = val; s += 1
            else: f += 1
            if (i) % 10 == 0: _safe_print(f"  进度: {i}/{total4}")
    return s, f


def _write_back(data_dir, loaded_data):
    print("\n💾 写回板块数据...")
    for cat, d in loaded_data.items():
        for s in d["series"]:
            a_rmb = [sh for sh in s["shares"] if sh.get("share_class") in ("A", "默认") and sh.get("currency", "人民币") == "人民币"]
            if a_rmb and a_rmb[0].get("scale"): s["series_scale"] = a_rmb[0]["scale"]
            elif not s.get("series_scale"): s["series_scale"] = next((sh.get("scale") for sh in s["shares"] if sh.get("scale")), 0)
        fp = data_dir / f"{cat}.json"
        normalize_share_keys(d)
        with open(fp, "w", encoding="utf-8") as f: json.dump(d, f, ensure_ascii=False, indent=2)
        print(f"  ✅ {cat}.json")
    bump_generated_at()


def _fill_etf_prices(data_dir, only_codes):
    etf_fp = data_dir / "etf.json"
    if not etf_fp.exists(): return
    etf_map = fetch_etf_data()
    if not etf_map: return
    etf_data = read_json(etf_fp)
    etf_updated = 0
    for series in etf_data.get("series", []):
        for share in series.get("shares", []):
            if only_codes and share["code"] not in only_codes: continue
            info = etf_map.get(share["code"])
            if info:
                share["etf_price"] = info.get("etf_price"); share["etf_change_pct"] = info.get("etf_change_pct")
                etf_updated += 1
    normalize_share_keys(etf_data)
    write_json(etf_fp, etf_data)
    print(f"  💾 ETF 场内价 {etf_updated} 只")


def _refresh_purchase_status(data_dir, only_codes):
    today = beijing_now_iso()[:10]
    purchase_map = fetch_purchase_data()
    rank_map = fetch_rank_data()
    for cat in CATEGORIES:
        fp = data_dir / f"{cat}.json"
        if not fp.exists(): continue
        data = read_json(fp)
        updated = 0
        for series in data.get("series", []):
            for share in series.get("shares", []):
                code = share["code"]
                if only_codes and code not in only_codes: continue
                if code in purchase_map: share.update(purchase_map[code]); updated += 1
                if code in rank_map:
                    r = rank_map[code]
                    if r.get("nav_date", "") >= share.get("nav_date", ""):
                        for k, v in r.items():
                            if v is not None and k not in ("nav_date","nav","nav_cum","daily_change"):
                                share[k] = v
                _update_history(share, today)
        normalize_share_keys(data)
        write_json(fp, data)
        if updated: print(f"  💾 {cat}.json 申购 {updated} 只")


if __name__ == "__main__":
    main()
