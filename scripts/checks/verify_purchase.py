#!/usr/bin/env python3
"""
scripts/checks/verify_purchase.py — 申购状态 / 日限额 / 变更历史 一致性校验

校验 buy_status / daily_limit / buy_status_history 的语义一致性，防三类回归：
  1. 场内 ETF 的 buy_status_history 被 fund_purchase_em 的「暂停申购/场内交易」抖动污染（G015）
  2. 「开放申购/不限额」哨兵值 1e11 被当作 ¥1000 亿写入 daily_limit（G016）
  3. buy_status_history 尾条与当前 buy_status / daily_limit 漂移（历史与现状不一致）

用法：
    python3 scripts/checks/verify_purchase.py          # 独立运行
    from checks.verify_purchase import run_verification  # 被 fundctl.py check 调用
"""
import json

from core.constants import DATA_DIR, CATEGORIES, ETF_CODE_PREFIXES


def _load_shares():
    """遍历所有分类 JSON，产出 (cat, share) 迭代器。"""
    for cat in CATEGORIES:
        fp = DATA_DIR / f"{cat}.json"
        if not fp.exists():
            continue
        try:
            data = json.loads(fp.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        for series in data.get("series", []):
            for share in series.get("shares", []):
                yield cat, share


def run_verification() -> list:
    """执行校验，返回错误列表（空列表 = 全部通过）。"""
    errors = []

    for cat, sh in _load_shares():
        code = sh.get("code", "")
        name = sh.get("name", code)
        label = f"{cat}/{name}({code})"
        is_etf = code.startswith(ETF_CODE_PREFIXES)

        # 1) 场内 ETF 不应有 buy_status_history
        hist = sh.get("buy_status_history") or []
        if is_etf and hist:
            errors.append(f"{label}: 场内 ETF 不应有 buy_status_history（当前 {len(hist)} 条）")

        # 2) daily_limit 不得出现开放申购哨兵值（share 与 history 都要查）
        dl = sh.get("daily_limit")
        if dl is not None and dl >= 1e11:
            errors.append(f"{label}: daily_limit 出现哨兵值 {dl}")
        for h in hist:
            hdl = h.get("daily_limit")
            if hdl is not None and hdl >= 1e11:
                errors.append(f"{label}: 历史条目 daily_limit 出现哨兵值 {hdl}")

        # 3) 非 ETF 份额：历史尾条必须与当前状态一致（美元份额已纳入追踪）
        if not is_etf and hist:
            last = hist[-1]
            if (last.get("buy_status") != sh.get("buy_status")
                    or last.get("daily_limit") != sh.get("daily_limit")):
                errors.append(
                    f"{label}: buy_status_history 尾条与当前状态不一致 "
                    f"（历史 {last} vs 当前 buy_status={sh.get('buy_status')!r} "
                    f"daily_limit={sh.get('daily_limit')!r}）"
                )

        # 4) 暂停/封闭/开放状态的 daily_limit 必须为 None（额度无意义或不限额，防噪音写入）
        for holder, hlabel in ((sh, "share"), *[(h, f"history[{i}]") for i, h in enumerate(hist)]):
            st = holder.get("buy_status") or ""
            if ("暂停" in st or "封闭" in st or "开放" in st) and holder.get("daily_limit") is not None:
                errors.append(
                    f"{label}: {hlabel} 状态为「{st}」但 daily_limit={holder.get('daily_limit')!r}，"
                    "非限购状态的额度应为 None"
                )

        # 5) 历史不得出现连续两条状态+额度完全相同（应被 _compact_history 压缩）
        for i in range(1, len(hist)):
            a, b = hist[i - 1], hist[i]
            if (a.get("buy_status") == b.get("buy_status")
                    and a.get("daily_limit") == b.get("daily_limit")):
                errors.append(
                    f"{label}: buy_status_history 连续两条重复 "
                    f"（{a.get('date')} 与 {b.get('date')} 均为 {a.get('buy_status')!r}/{a.get('daily_limit')!r}）"
                )

    return errors


def main():
    errors = run_verification()
    if errors:
        print("❌ 申购/限额一致性校验失败：")
        for e in errors:
            print(" -", e)
        raise SystemExit(1)
    print("✅ 申购/限额一致性校验通过")


if __name__ == "__main__":
    main()
