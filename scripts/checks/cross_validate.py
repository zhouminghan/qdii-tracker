#!/usr/bin/env python3
"""
scripts/pipeline/cross_validate.py — 跨源交叉验证

对每只基金对比 lsjz（天天基金最新净值）和 pzd（pingzhongdata 最新净值），
偏差 > 0.5% 标记为异常。防止管线通过但数据错误（Goodhart's Law）。

用法：
    python3 scripts/pipeline/cross_validate.py          # 独立运行
    from pipeline.cross_validate import run_cross_validation  # 被 fundctl.py check 调用
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.constants import DATA_DIR
from core.utils import read_json
from sources.eastmoney_source import fetch_lsjz, fetch_pzd


def run_cross_validation(sample_size: int = 20) -> tuple:
    """
    对前 sample_size 只基金进行跨源净值对比。
    返回 (compared: int, anomalies: list[dict])
    - compared：实际完成双源对比（lsjz + pzd 均有净值）的基金数
    - anomalies：偏差 > 0.5% 的异常列表
    调用方应据 compared 区分「通过 / 未验证（数据源不可用）」，避免假绿。
    """
    anomalies = []
    checked = 0
    compared = 0

    for cat_file in sorted(DATA_DIR.glob("*.json")):
        if cat_file.name == "meta.json":
            continue
        if checked >= sample_size:
            break
        try:
            data = read_json(cat_file)
        except Exception:
            continue
        for series in data.get("series", []):
            for share in series.get("shares", []):
                if checked >= sample_size:
                    break
                code = share.get("code")
                if not code or code in {"513500", "510500", "159941"}:
                    continue  # skip ETFs (no nav in same format)

                checked += 1
                try:
                    # 从两个数据源取最新净值
                    lsjz_records = fetch_lsjz(code)
                    pzd_records = fetch_pzd(code)

                    lsjz_nav = _latest_nav(lsjz_records)
                    pzd_nav = _latest_nav(pzd_records)

                    if lsjz_nav is None or pzd_nav is None:
                        continue  # 数据源不完整，跳过

                    deviation = abs(lsjz_nav - pzd_nav) / lsjz_nav * 100
                    compared += 1
                    if deviation > 0.5:
                        anomalies.append({
                            "code": code,
                            "name": share.get("name", ""),
                            "cat": cat_file.stem,
                            "lsjz_nav": round(lsjz_nav, 4),
                            "pzd_nav": round(pzd_nav, 4),
                            "deviation": round(deviation, 2),
                        })
                except Exception:
                    continue  # 单只基金失败不阻塞整体

    return compared, anomalies


def _latest_nav(records):
    """从 lsjz/pzd 记录列表中取最新 nav 值。records 格式: [{"nav": 1.5, ...}, ...]"""
    if not records:
        return None
    # records already sorted by date descending
    for r in records:
        nav = r.get("nav")
        if nav is not None and nav > 0:
            return nav
    return None


def main():
    compared, anomalies = run_cross_validation()
    if anomalies:
        for a in anomalies:
            print(f"⚠ {a['code']}({a['name']}) nav偏差: {a['deviation']:.2f}% "
                  f"(lsjz={a['lsjz_nav']}, pzd={a['pzd_nav']})")
        sys.exit(1)
    if compared == 0:
        print("⚠ 未验证：0 只完成跨源对比（lsjz/pzd 数据源不可用），无法判定")
        sys.exit(0)
    else:
        print(f"✅ 跨源交叉验证通过（{compared} 只对比）")
        sys.exit(0)


if __name__ == "__main__":
    main()
