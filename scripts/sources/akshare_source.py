"""
AKShare 数据源：全量批量接口 + 逐只接口。
从 enrich_data.py / fill_missing.py / refresh_purchase.py / scan_funds.py / fetch_holdings.py 提取。
"""
import akshare as ak

from core.constants import AKSHARE_TIMEOUT
from core.utils import to_float, make_timeout_caller


_call_ak = make_timeout_caller(AKSHARE_TIMEOUT)


def fetch_rank_data():
    """全量涨跌幅数据（原 enrich_data.py + refresh_purchase.py 各调一次）"""
    print("🔍 拉取全量涨跌幅排名...")
    df = _call_ak(ak.fund_open_fund_rank_em, symbol="全部")
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
    """全量申购限额数据（原 enrich_data.py + refresh_purchase.py 各调一次）

    日累计限定金额的单位是「元」。东方财富对「开放申购/不限额」返回哨兵值
    100000000000（1e11），此处归一化为 None，避免把「不限额」当成 ¥1000 亿
    写入数据、参与排序与历史追踪。
    """
    print("🔍 拉取全量申购状态/限额...")
    df = _call_ak(ak.fund_purchase_em)
    print(f"  ✅ {len(df)} 条")
    purchase_map = {}
    for _, row in df.iterrows():
        code = str(row["基金代码"]).strip()
        limit = to_float(row.get("日累计限定金额"))
        if limit is not None and limit >= 1e11:
            limit = None  # 开放申购哨兵值（不限额）
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
        df = ak.fund_etf_spot_em()  # signal-based timeout not applicable in try/except context
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
        df = _call_ak(ak.fund_open_fund_info_em, symbol=code, indicator="累计收益率走势")
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
        df = _call_ak(ak.fund_open_fund_info_em, symbol=code, indicator="累计收益率走势")
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
    df = _call_ak(ak.fund_name_em)
    print(f"✅ 全部基金: {len(df)} 只")
    return df


# 持仓表格列位置映射（东方财富 GB2312 响应中列名为乱码，按位置取）
_HOLDINGS_COL_POS = {
    0: "序号",
    1: "股票代码",
    2: "股票名称",
    4: "占净值比例",
    5: "持股数",
    6: "持仓市值",
}


def _fetch_holdings_page(symbol: str, year: str, page: int):
    """
    调用东方财富持仓 API，返回 (quarters, dfs) 元组。
    修复 AKShare v1.18.64 不带 pi 参数导致默认返回第二页 (rank 11-20) 的 bug。
    """
    import random
    import re
    import urllib.request
    import urllib.error
    import io
    import pandas as pd
    from core.constants import HTTP_TIMEOUT

    url = (
        f"http://fundf10.eastmoney.com/FundArchivesDatas.aspx"
        f"?type=jjcc&code={symbol}&topline=10&year={year}&month=&pi={page}"
        f"&rt={random.uniform(0.01, 0.99):.16f}"
    )
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "Referer": f"http://fundf10.eastmoney.com/ccmx_{symbol}.html",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=HTTP_TIMEOUT)
        raw_bytes = resp.read()
        raw = raw_bytes.decode("utf-8")
    except (urllib.error.URLError, ValueError) as e:
        print(f"  ⚠️ 持仓API请求失败 page={page}: {e}")
        return None, []

    # 提取 content 中的 HTML
    content_match = re.search(r'content:\s*"(.*?)"\s*[,}]', raw, re.DOTALL)
    if not content_match:
        print(f"  ⚠️ 持仓API 无法提取 content page={page}")
        return None, []
    html = content_match.group(1)
    html = html.replace("\\'", "'").replace('\\"', '"').replace("\\\\", "\\")

    try:
        dfs = pd.read_html(io.StringIO(f"<html><body>{html}</body></html>"))
    except Exception as e:
        print(f"  ⚠️ 持仓HTML解析失败 page={page}: {e}")
        return None, []

    if not dfs:
        return None, []

    # 提取季度标签（HTML 中格式为 "2026年2季度"）
    quarters = re.findall(r'(\d{4})年(\d)季度', html)
    if not quarters:
        quarters = re.findall(r'(\d{4})[\u4e00-\u9fff](\d)[\u4e00-\u9fff]{1,2}', html)
    quarter_labels = [f"{y}Q{q}" for y, q in quarters]
    if not quarter_labels:
        # 兜底：按 table 数量推算（每季度2表：持仓+分类明细）
        n_tables = len(dfs)
        n_quarters = n_tables // 2
        for qi in range(n_quarters):
            q_num = 4 - qi
            quarter_labels.extend([f"{year}Q{q_num}"] * 2)

    # 每张表应用位置映射
    # GB2312 编码下列名为乱码，用列数 + 位置智能检测
    result_dfs = []
    for df in dfs:
        n_cols = len(df.columns)
        if n_cols < 5:
            continue
        # 6列: 序号|代码|名称|占净值比例|持股数|持仓市值
        # 7列: 序号|代码|名称|相关资讯|占净值比例|持股数|持仓市值
        if n_cols == 6:
            pos_map = {0: "序号", 1: "股票代码", 2: "股票名称", 3: "占净值比例", 4: "持股数", 5: "持仓市值"}
        elif n_cols == 7:
            pos_map = {0: "序号", 1: "股票代码", 2: "股票名称", 4: "占净值比例", 5: "持股数", 6: "持仓市值"}
        else:
            pos_map = {0: "序号", 1: "股票代码", 2: "股票名称", n_cols-3: "占净值比例", n_cols-2: "持股数", n_cols-1: "持仓市值"}

        mapped = {}
        for pos, name in pos_map.items():
            if pos < n_cols:
                mapped[name] = df.iloc[:, pos]
        if "序号" in mapped and "占净值比例" in mapped:
            result_dfs.append(pd.DataFrame(mapped))

    return quarter_labels, result_dfs


def fetch_holdings(code: str, year: str = None):
    """
    抓取单只基金的持仓数据。
    修复：原 AKShare fund_portfolio_hold_em 不带 pi 参数 → 返回第二页 (11-20)。
    现改用直连东方财富 API &pi=1 + &pi=2 合并，确保 rank 1-10 在前。
    """
    from core.utils import beijing_now_iso, beijing_year
    if year is None:
        year = str(beijing_year())

    try:
        # 直连东方财富 API page=1（返回全年的所有季度 Top10）
        all_quarters = {}
        q_labels, dfs = _fetch_holdings_page(code, year, 1)
        if dfs:
            for qi, df in enumerate(dfs):
                q = q_labels[qi] if qi < len(q_labels) else f"{year}Q?"
                all_quarters[q] = []
                for _, row in df.iterrows():
                    rank_raw = row.get("序号")
                    try:
                        rank = int(float(str(rank_raw).replace(",", "")))
                    except (ValueError, TypeError):
                        rank = None
                    all_quarters[q].append({
                        "rank": rank,
                        "stock_code": str(row.get("股票代码", "")).strip(),
                        "stock_name": str(row.get("股票名称", "")).strip(),
                        "weight": to_float(row.get("占净值比例")),
                        "shares": to_float(row.get("持股数")),
                        "market_value": to_float(row.get("持仓市值")),
                    })

        if not all_quarters:
            # fallback 到 AKShare
            try:
                df_ak = _call_ak(ak.fund_portfolio_hold_em, symbol=code, date=year)
                if df_ak is not None and len(df_ak) > 0:
                    return _fallback_akshare_holdings(code, year, df_ak)
            except Exception:
                pass
            return None

        # 按 rank 排序各季度持仓
        for q in all_quarters:
            all_quarters[q].sort(key=lambda h: h["rank"] if h["rank"] is not None else 999)

        # 取最新季度
        quarters_sorted = sorted(all_quarters.keys(), reverse=True)
        latest_q = quarters_sorted[0] if quarters_sorted else None
        latest_holdings = all_quarters.get(latest_q, [])
        # 东方财富 API 偶返 11-12 条（如谷歌-A/谷歌-C 分开展示），截断为 Top10
        latest_holdings = latest_holdings[:10]

        total_weight = sum(h["weight"] or 0 for h in latest_holdings)
        heavy_count = sum(1 for h in latest_holdings if (h["weight"] or 0) > 5)

        return {
            "code": code,
            "latest_quarter": latest_q,
            "holdings_count": len(latest_holdings),
            "total_weight": round(total_weight, 2),
            "heavy_count": heavy_count,
            "holdings": latest_holdings,
            "all_quarters": all_quarters,
            "fetched_at": beijing_now_iso(),
        }
    except Exception as e:
        return {"error": str(e)[:200], "code": code}


def _fallback_akshare_holdings(code: str, year: str, df):
    """AKShare 兜底：字段名与原逻辑一致"""
    from core.utils import beijing_now_iso

    by_quarter = {}
    for _, row in df.iterrows():
        quarter = str(row.get("季度", ""))
        item = {
            "rank": int(row.get("序号", 0)) if row.get("序号") else None,
            "stock_code": str(row.get("股票代码", "")).strip(),
            "stock_name": str(row.get("股票名称", "")).strip(),
            "weight": to_float(row.get("占净值比例")),
            "shares": to_float(row.get("持股数")),
            "market_value": to_float(row.get("持仓市值")),
        }
        by_quarter.setdefault(quarter, []).append(item)

    quarters_sorted = sorted(by_quarter.keys(), reverse=True)
    latest_q = quarters_sorted[0] if quarters_sorted else None
    latest_holdings = by_quarter.get(latest_q, [])
    latest_holdings.sort(key=lambda h: h["rank"] if h["rank"] is not None else 999)

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
