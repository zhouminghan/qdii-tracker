"""
计算主动基金实时估值（参考 FundDrift 公式）

核心公式：
  估值影响(%) = Σ(持仓权重% × 涨跌幅%) / 100 + 股票仓位比例 × 汇率变动% / 100

输入：
  - web/data/holdings/{code}.json  — 每只基金的 Top10 持仓 + 权重
  - web/data/us_stocks.json        — 持仓股票的实时行情（涨跌幅）
  - web/data/active.json           — 主动基金列表（含 default_share_code）
  - web/data/global_other.json     — 全球其他 QDII 列表

输出：
  - web/data/estimates.json        — 所有主动基金的估值结果

与 FundDrift（fund.this52.cn）的关系：
  - 同源公式，但本项目是离线预计算 + 前端动态重算
  - FundDrift 后端每 30 秒刷新，本项目由流水线定时跑 + 前端 fetchStocksLive() 动态更新
"""
import json
from datetime import datetime
from pathlib import Path


# 默认股票仓位比例（如果无法从数据中获取）
DEFAULT_STOCK_RATIO = 90.0  # QDII 股票型基金默认 90%


def load_json(path: Path) -> "dict | None":
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def calc_single_fund(holdings_data: dict, stocks_map: dict, fx_change: float = 0.0) -> "dict | None":
    """
    计算单只基金的估值影响

    Args:
        holdings_data: holdings/{code}.json 的内容
        stocks_map: us_stocks.json 的 stocks 字段 {code: {change_pct, ...}}
        fx_change: 美元兑人民币汇率变动百分比（正=美元升值）

    Returns:
        估值结果 dict，或 None（数据不足时）
    """
    holdings = holdings_data.get("holdings", [])
    if not holdings:
        return None

    total_weight = holdings_data.get("total_weight", 0)
    # 估算股票仓位：用持仓总权重作为近似（Top10 权重之和通常在 50-80%）
    # 实际仓位通常更高（90%+），但 Top10 只覆盖部分
    stock_ratio = DEFAULT_STOCK_RATIO

    stock_contribution = 0.0
    matched_count = 0
    unmatched_codes = []
    top_movers = []

    for h in holdings:
        code = (h.get("stock_code") or "").strip()
        weight = h.get("weight") or 0
        name = h.get("stock_name") or code

        # 查找该股票的实时涨跌幅
        stock_info = stocks_map.get(code)
        if stock_info and stock_info.get("change_pct") is not None:
            change = stock_info["change_pct"]
            impact = weight * change / 100  # 权重 × 涨跌幅 / 100
            stock_contribution += impact
            matched_count += 1
            top_movers.append({
                "code": code,
                "name": name,
                "weight": weight,
                "change": change,
                "impact": round(impact, 4),
            })
        else:
            unmatched_codes.append(code)

    # 按影响绝对值排序（最大的排前面）
    top_movers.sort(key=lambda x: abs(x["impact"]), reverse=True)

    # 汇率影响
    fx_contribution = stock_ratio * fx_change / 100

    # 总估值影响
    estimated_impact = round(stock_contribution + fx_contribution, 4)

    return {
        "code": holdings_data.get("code", ""),
        "name": "",  # 由调用方填充
        "estimated_impact": estimated_impact,
        "total_weight": total_weight,
        "stock_ratio": stock_ratio,
        "stock_contribution": round(stock_contribution, 4),
        "fx_contribution": round(fx_contribution, 4),
        "matched_count": matched_count,
        "holdings_count": len(holdings),
        "top_movers": top_movers,      # 保留全部已匹配持仓（前端重算需要完整数据）
        "top_movers_display": top_movers[:5],  # 影响最大的前 5（用于展示）
        "unmatched_codes": unmatched_codes,
        "latest_quarter": holdings_data.get("latest_quarter", ""),
    }


def fetch_fx_change() -> float:
    """
    获取美元兑人民币汇率日变动百分比

    优先用 AKShare，失败则返回 0（汇率影响通常很小，-0.1% ~ +0.1%）
    """
    try:
        import akshare as ak
        # 尝试多个 AKShare 汇率接口（接口名随版本变化）
        for func_name in ["currency_spot_em", "fx_spot_em"]:
            func = getattr(ak, func_name, None)
            if func is None:
                continue
            try:
                df = func(symbol="美元人民币")
                if df is not None and len(df) > 0:
                    latest = df.iloc[-1]
                    for col in ["涨跌幅", "change_pct"]:
                        if col in latest.index:
                            val = latest[col]
                            if val is not None:
                                return float(val)
            except Exception:
                continue
    except Exception as e:
        print(f"  ⚠️  AKShare 汇率获取失败: {e}")

    # 兜底：从腾讯财经取
    try:
        import requests
        resp = requests.get(
            "https://qt.gtimg.cn/q=USDCNY",
            timeout=5,
        )
        text = resp.text.strip()
        if text and '~' in text:
            parts = text.split('~')
            if len(parts) > 32:
                change_pct = float(parts[32])
                return change_pct
    except Exception:
        pass

    print("  ⚠️  汇率获取全部失败，使用 0.0")
    return 0.0


def main():
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "web" / "data"
    holdings_dir = data_dir / "holdings"

    print("🧮 开始计算主动基金估值...")

    # 1. 加载股票行情
    stocks_data = load_json(data_dir / "us_stocks.json")
    stocks_map = stocks_data.get("stocks", {}) if stocks_data else {}
    print(f"  📊 已加载 {len(stocks_map)} 只股票行情")

    # 2. 获取汇率变动
    fx_change = fetch_fx_change()
    print(f"  💱 汇率变动: {fx_change:+.4f}%")

    # 3. 收集需要估值的基金代码（active + global_other）
    fund_name_map = {}  # code -> display_name
    for cat in ["active"]:
        cat_data = load_json(data_dir / f"{cat}.json")
        if not cat_data:
            continue
        for series in cat_data.get("series", []):
            default_code = series.get("default_share_code")
            display_name = series.get("display_name", "")
            if default_code:
                fund_name_map[default_code] = display_name

    print(f"  🎯 需要估值的基金: {len(fund_name_map)} 只")

    # 4. 逐只计算估值
    estimates = {}
    success = 0
    skip = 0

    for code, name in fund_name_map.items():
        holdings_path = holdings_dir / f"{code}.json"
        holdings_data = load_json(holdings_path)

        if not holdings_data or "error" in holdings_data:
            skip += 1
            continue

        result = calc_single_fund(holdings_data, stocks_map, fx_change)
        if result is None:
            skip += 1
            continue

        result["name"] = name
        estimates[code] = result
        success += 1

    print(f"  ✅ 计算完成: 成功 {success} 只, 跳过 {skip} 只")

    # 5. 保存结果
    output = {
        "generated_at": datetime.now().isoformat(),
        "fx_change": fx_change,
        "total_funds": len(estimates),
        "funds": estimates,
    }

    out_path = data_dir / "estimates.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"  💾 已保存到 {out_path}")

    # 6. 打印 Top5 估值影响最大的基金
    sorted_funds = sorted(estimates.values(), key=lambda x: abs(x["estimated_impact"]), reverse=True)
    print(f"\n  📈 估值影响 Top5:")
    for i, f in enumerate(sorted_funds[:5], 1):
        impact = f["estimated_impact"]
        sign = "+" if impact > 0 else ""
        top1 = f["top_movers"][0] if f["top_movers"] else {}
        top1_str = f"（{top1.get('name', '?')} {top1.get('change', 0):+.2f}%×{top1.get('weight', 0):.1f}%）" if top1 else ""
        print(f"    {i}. {f['name'][:16]}  {sign}{impact:.2f}%  {top1_str}")


if __name__ == "__main__":
    main()
