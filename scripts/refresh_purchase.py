"""
轻量申购状态刷新：仅拉取申购状态/限额 + 涨跌幅（批量接口，快）
不调用逐只雪球接口，适合高频增量更新。

Fallback 机制（2026-05-30）：
- AKShare 全量接口对规模 < 5000 万的迷你/新基金可能没有记录（如 022524 越南 D）
- 在批量合并完成后，统计漏网名单 → 走天天基金 lsjz API 单只兜底，补 nav/daily_change
- 申购状态字段（buy_status/daily_limit/fee）在 lsjz 没有，保持原值不动
"""
import json
import re
import time
from datetime import datetime
from pathlib import Path

import akshare as ak
import pandas as pd
import requests
from timezone_utils import beijing_now_iso


LSJZ_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://fundf10.eastmoney.com/",
}


def _to_float(v):
    if v is None or (isinstance(v, float) and pd.isna(v)) or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def fetch_lsjz_single(code: str):
    """走天天基金 lsjz API 单只兜底，仅返回 nav/nav_date/daily_change。
    用于规模过小、AKShare 全量接口没收录的迷你基金。
    """
    url = (
        f"https://api.fund.eastmoney.com/f10/lsjz"
        f"?callback=jQuery&fundCode={code}&pageIndex=1&pageSize=1"
    )
    try:
        r = requests.get(url, headers=LSJZ_HEADERS, timeout=8)
    except Exception:
        return None
    if r.status_code != 200:
        return None
    m = re.search(r"jQuery\((.*)\)", r.text, re.DOTALL)
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
        items = data.get("Data", {}).get("LSJZList", [])
        if not items:
            return None
        latest = items[0]
        result = {}
        if latest.get("FSRQ"):
            result["nav_date"] = latest["FSRQ"]
        nav = _to_float(latest.get("DWJZ"))
        if nav is not None:
            result["nav"] = nav
        chg = _to_float(latest.get("JZZZL"))
        if chg is not None:
            result["daily_change"] = chg
        return result if result else None
    except Exception:
        return None


def main():
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "web" / "data"

    # 1. 批量拉取申购数据（全量，秒级）
    print("🔍 拉取全量申购状态/限额...")
    purchase_df = ak.fund_purchase_em()
    print(f"  ✅ {len(purchase_df)} 条")
    purchase_map = {}
    for _, row in purchase_df.iterrows():
        code = str(row["基金代码"]).strip()
        limit = _to_float(row.get("日累计限定金额"))
        purchase_map[code] = {
            "buy_status": str(row.get("申购状态", "") or "").strip(),
            "sell_status": str(row.get("赎回状态", "") or "").strip(),
            "buy_min": _to_float(row.get("购买起点")),
            "daily_limit": limit,
            "fee": str(row.get("手续费", "") or "").strip(),
        }

    # 2. 批量拉取涨跌幅数据（全量，秒级）
    print("🔍 拉取全量涨跌幅排名...")
    rank_df = ak.fund_open_fund_rank_em(symbol="全部")
    print(f"  ✅ {len(rank_df)} 条")
    rank_map = {}
    for _, row in rank_df.iterrows():
        code = str(row["基金代码"]).strip()
        rank_map[code] = {
            "nav_date": str(row.get("日期", "")),
            "nav": _to_float(row.get("单位净值")),
            "nav_cum": _to_float(row.get("累计净值")),
            "daily_change": _to_float(row.get("日增长率")),
            "chg_1w": _to_float(row.get("近1周")),
            "chg_1m": _to_float(row.get("近1月")),
            "chg_3m": _to_float(row.get("近3月")),
            "chg_6m": _to_float(row.get("近6月")),
            "chg_1y": _to_float(row.get("近1年")),
            "chg_2y": _to_float(row.get("近2年")),
            "chg_3y": _to_float(row.get("近3年")),
            "chg_ytd": _to_float(row.get("今年来")),
            "chg_since_inception": _to_float(row.get("成立来")),
        }

    # 3. 合并到现有 JSON 文件，同时收集"批量接口漏网名单"以便走 lsjz 兜底
    #    场内 ETF 跳过 fallback（前端用 etf_price/etf_change_pct，净值口径不同）
    fallback_targets = []  # [(file_path, share_dict, code), ...]
    for cat in ["sp500", "nasdaq_passive", "active", "global_index", "global_other", "etf"]:
        fp = data_dir / f"{cat}.json"
        if not fp.exists():
            continue
        with open(fp, encoding="utf-8") as f:
            data = json.load(f)
        updated = 0
        for series in data["series"]:
            for share in series["shares"]:
                code = share["code"]
                # 申购数据
                if code in purchase_map:
                    share.update(purchase_map[code])
                    updated += 1
                # 涨跌幅数据
                if code in rank_map:
                    # 防回退：nav_date 只允许前进，不允许接口返回旧日期覆盖新日期
                    new_nav_date = rank_map[code].get("nav_date")
                    cur_nav_date = share.get("nav_date", "")
                    if new_nav_date and cur_nav_date and new_nav_date < cur_nav_date:
                        # 接口返回了更旧的日期 → 跳过 nav 相关字段，只更新涨跌幅
                        for k, v in rank_map[code].items():
                            if v is not None and k not in ("nav_date", "nav", "nav_cum", "daily_change"):
                                share[k] = v
                    else:
                        for k, v in rank_map[code].items():
                            if v is not None:
                                share[k] = v
                else:
                    # 批量接口没收录 → 加入 fallback 队列（ETF 跳过：净值口径不同）
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
        # 按文件分组，避免重复读写
        by_file = {}
        for fp, sh, code in fallback_targets:
            by_file.setdefault(fp, []).append((sh, code))

        fb_success = 0
        fb_fail = 0
        for fp, items in by_file.items():
            # 重新读取（前面已经写过一次）
            with open(fp, encoding="utf-8") as f:
                data = json.load(f)
            # 构建 code → share 映射，方便就地更新
            code_to_share = {}
            for series in data["series"]:
                for share in series["shares"]:
                    code_to_share[share["code"]] = share

            for sh_orig, code in items:
                lsjz = fetch_lsjz_single(code)
                if not lsjz:
                    fb_fail += 1
                    print(f"  ❌ {code} lsjz 也无数据")
                    time.sleep(0.15)
                    continue
                target = code_to_share.get(code, sh_orig)
                # 防回退：nav_date 只允许前进
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

            # 写回
            with open(fp, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  📊 Fallback 成功 {fb_success} / 失败 {fb_fail} / 共 {len(fallback_targets)}")

    # 5. 更新 meta：bump generated_at（前端缓存破坏参数） + 记录申购刷新时间
    meta_fp = data_dir / "meta.json"
    if meta_fp.exists():
        with open(meta_fp, encoding="utf-8") as f:
            meta = json.load(f)
        meta["generated_at"] = beijing_now_iso()
        meta["purchase_refreshed_at"] = beijing_now_iso()
        with open(meta_fp, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        print(f"  ✅ meta.json generated_at bumped -> {meta['generated_at']}")

    # 同时更新所有数据文件的 generated_at 字段
    print("  🔄 更新数据文件 generated_at...")
    now_str = beijing_now_iso()
    for cat in ["sp500", "nasdaq_passive", "active", "global_index", "global_other", "etf"]:
        fp = data_dir / f"{cat}.json"
        if not fp.exists():
            continue
        with open(fp, encoding="utf-8") as f:
            data = json.load(f)
        data["generated_at"] = now_str
        with open(fp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  ✅ 所有数据文件 generated_at 更新为 -> {now_str}")

    print("\n✅ 申购状态 + 涨跌幅刷新完成！")


if __name__ == "__main__":
    main()
