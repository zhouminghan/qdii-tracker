"""
AKShare 数据源：全量批量接口 + 逐只接口。
从 enrich_data.py / fill_missing.py / refresh_purchase.py / scan_funds.py / fetch_holdings.py 提取。
"""
import akshare as ak

from core.utils import to_float


def fetch_rank_data():
    """全量涨跌幅数据（原 enrich_data.py + refresh_purchase.py 各调一次）"""
    print("🔍 拉取全量涨跌幅排名...")
    df = ak.fund_open_fund_rank_em(symbol="全部")
    print(f"  ✅ {len(df)} 条")
    rank_map = {}
    for _, row in df.iterrows():
        code = str(row["基金代码"]).strip()
        rank_map[code] = {
            "nav_date": str(row.get("日期", "")),
            "nav": to_float(row.get("单位净值")),
            "nav_cum": to_float(row.get("累计净值")),
            "daily_change": to_float(row.get("日增长率")),
            "chg_1w": to_float(row.get("近1周")),
            "chg_1m": to_float(row.get("近1月")),
            "chg_3m": to_float(row.get("近3月")),
            "chg_6m": to_float(row.get("近6月")),
            "chg_1y": to_float(row.get("近1年")),
            "chg_2y": to_float(row.get("近2年")),
            "chg_3y": to_float(row.get("近3年")),
            "chg_ytd": to_float(row.get("今年来")),
            "chg_since_inception": to_float(row.get("成立来")),
        }
    return rank_map


def fetch_purchase_data():
    """全量申购限额数据（原 enrich_data.py + refresh_purchase.py 各调一次）"""
    print("🔍 拉取全量申购状态/限额...")
    df = ak.fund_purchase_em()
    print(f"  ✅ {len(df)} 条")
    purchase_map = {}
    for _, row in df.iterrows():
        code = str(row["基金代码"]).strip()
        limit = to_float(row.get("日累计限定金额"))
        purchase_map[code] = {
            "buy_status": str(row.get("申购状态", "") or "").strip(),
            "sell_status": str(row.get("赎回状态", "") or "").strip(),
            "buy_min": to_float(row.get("购买起点")),
            "daily_limit": limit,
            "fee": str(row.get("手续费", "") or "").strip(),
        }
    return purchase_map


def fetch_etf_data():
    """ETF 场内数据（规模/价格，原 enrich_data.py）"""
    print("🔍 拉取全量 ETF 现货数据（含规模）...")
    try:
        df = ak.fund_etf_spot_em()
        print(f"  ✅ {len(df)} 条")
    except Exception as e:
        print(f"  ❌ {e}")
        return {}
    etf_map = {}
    for _, row in df.iterrows():
        code = str(row["代码"]).strip()
        total_value = to_float(row.get("总市值"))  # 元
        scale_yi = (total_value / 1e8) if total_value else None
        etf_map[code] = {
            "etf_scale_yi": scale_yi,
            "etf_price": to_float(row.get("最新价")),
            "etf_change_pct": to_float(row.get("涨跌幅")),
            "etf_volume": to_float(row.get("成交量")),
        }
    return etf_map


def fetch_ytd(code: str):
    """
    用 AKShare 抓"累计收益率走势"，推算今年以来的收益率（YTD）。
    原逻辑来自 fill_missing.py。
    返回 float 百分比，或 None。
    """
    try:
        import pandas as pd
    except ImportError:
        return None
    try:
        from core.utils import beijing_year_start
        df = ak.fund_open_fund_info_em(symbol=code, indicator="累计收益率走势")
        if df is None or len(df) == 0:
            return None
        # 兼容列名差异
        date_col = "日期" if "日期" in df.columns else "净值日期"
        ret_col = "累计收益率"
        df[date_col] = pd.to_datetime(df[date_col])
        year_start = beijing_year_start()
        ytd_df = df[df[date_col] >= year_start].sort_values(date_col)
        if len(ytd_df) < 2:
            return None
        first = ytd_df.iloc[0][ret_col]
        last = ytd_df.iloc[-1][ret_col]
        if first is None or last is None:
            return None
        chg = (1 + last / 100.0) / (1 + first / 100.0) - 1
        return round(chg * 100, 2)
    except Exception:
        return None


def fetch_inception_return(code: str):
    """
    用 AKShare 抓"累计收益率走势"，取最后一条作为成立来收益。
    原逻辑来自 fill_missing.py Pass 4。
    返回 float 百分比，或 None。
    """
    try:
        df = ak.fund_open_fund_info_em(symbol=code, indicator="累计收益率走势")
        if df is not None and len(df) > 0:
            last_val = df.iloc[-1]["累计收益率"]
            if last_val is not None:
                return round(float(last_val), 2)
    except Exception:
        pass
    return None


def fetch_fund_names():
    """全量基金名称表（原 scan_funds.py）"""
    print("🔍 从 AKShare 获取全量基金名称表...")
    df = ak.fund_name_em()
    print(f"✅ 全部基金: {len(df)} 只")
    return df


def fetch_holdings(code: str, year: str = None):
    """
    抓取单只基金的持仓数据（原 fetch_holdings.py）。
    返回 dict 或 None。
    """
    from core.utils import beijing_now_iso, beijing_year
    if year is None:
        year = str(beijing_year())
    try:
        df = ak.fund_portfolio_hold_em(symbol=code, date=year)
        if len(df) == 0:
            return None
        # 按季度分组（最新季度排前面）
        by_quarter = {}
        for _, row in df.iterrows():
            quarter = str(row.get("季度", ""))
            item = {
                "rank": int(row.get("序号", 0)) if row.get("序号") else None,
                "stock_code": str(row.get("股票代码", "")).strip(),
                "stock_name": str(row.get("股票名称", "")).strip(),
                "weight": to_float(row.get("占净值比例")),  # %
                "shares": to_float(row.get("持股数")),      # 万股
                "market_value": to_float(row.get("持仓市值")),  # 万元
            }
            by_quarter.setdefault(quarter, []).append(item)

        # 取最新季度
        quarters_sorted = sorted(by_quarter.keys(), reverse=True)
        latest_q = quarters_sorted[0] if quarters_sorted else None
        latest_holdings = by_quarter.get(latest_q, [])

        total_weight = sum(h["weight"] or 0 for h in latest_holdings)
        heavy_count = sum(1 for h in latest_holdings if (h["weight"] or 0) > 5)

        return {
            "code": code,
            "latest_quarter": latest_q,
            "holdings_count": len(latest_holdings),
            "total_weight": round(total_weight, 2),
            "heavy_count": heavy_count,
            "holdings": latest_holdings,
            "all_quarters": by_quarter,
            "fetched_at": beijing_now_iso(),
        }
    except Exception as e:
        return {"error": str(e)[:200], "code": code}
