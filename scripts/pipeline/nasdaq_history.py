"""
scripts/pipeline/nasdaq_history.py — 生成「纳指 40 年历史图谱」数据

从公开数据源抓取纳斯达克综合指数（^IXIC）的月线收盘价，计算四组图谱数据，
写入 web/data/nasdaq-history.json，供前端「纳指图谱」Tab 渲染：

  - annual：逐年收盘价、年度收益、年内最大回撤、峰/谷月份（1986 至今）
  - heatmap：逐年 x 12 个月月度收益热力矩阵（1997 至今）
  - ranking：近 5 年 / 近 10 年 / 全长（2001 至今）三组月份排行榜
  - drawdown_histogram：年内谷值月份分布直方图
  - summary：自动生成的「一眼看结论」

纯计算函数（annual_stats / monthly_returns / build_heatmap / rank_months /
build_summary）可单测；网络抓取在 sync / nasdaq / CI 增量时执行。
"""
import time
from datetime import datetime, timezone

import requests

from core.constants import DATA_DIR
from core.utils import beijing_now_iso, beijing_year, read_json, write_json

# ============================================================
# 可配置：标的与输出
# ============================================================
SYMBOL = "^NDX"
INDEX_NAME = "纳斯达克 100 指数"
INDEX_CURRENCY = "USD"

# 图谱的统计口径（与产品白皮书对齐）
DRAWDOWN_START_YEAR = 1986
HEATMAP_START_YEAR = 1997
RANKING_FULL_START_YEAR = 2001

# 数据源至少需要这么多个月线点，否则视为数据不足
MIN_MONTHS = 200

OUTPUT_FP = DATA_DIR / "nasdaq-history.json"

MONTH_CN = ["1月", "2月", "3月", "4月", "5月", "6月",
            "7月", "8月", "9月", "10月", "11月", "12月"]

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}


# ============================================================
# 纯计算（可单测）
# ============================================================
def _to_float(v):
    try:
        f = float(v)
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def _dedupe_points(points):
    """把 [(year, month, close)] 按年月去重（后值覆盖），返回升序列表。"""
    seen = {}
    for y, m, c in points:
        if c is not None:
            seen[(int(y), int(m))] = c
    return [(y, m, c) for (y, m), c in sorted(seen.items())]


def monthly_returns(monthly):
    """逐月收益率：close(当月) / close(上月) - 1，返回 {(year, month): pct}。"""
    closes = {(y, m): c for y, m, c in monthly}
    returns = {}
    for (y, m), c in closes.items():
        prev = closes.get((y - 1, 12)) if m == 1 else closes.get((y, m - 1))
        if prev and prev > 0:
            returns[(y, m)] = (c / prev - 1.0) * 100.0
    return returns


def _max_drawdown_in_year(month_closes):
    """month_closes: [(month, close)] 升序。返回 (max_dd_pct, peak_month, trough_month)。"""
    peak = month_closes[0][1]
    peak_month = month_closes[0][0]
    max_dd = 0.0
    best_peak = peak_month
    best_trough = peak_month
    for m, c in month_closes:
        if c > peak:
            peak = c
            peak_month = m
        dd = c / peak - 1.0
        if dd < max_dd:
            max_dd = dd
            best_peak = peak_month
            best_trough = m
    return max_dd * 100.0, best_peak, best_trough


def annual_stats(monthly, start_year=DRAWDOWN_START_YEAR):
    """逐年统计：收盘、年度收益、年内最大回撤、峰/谷月份。"""
    closes = {(y, m): c for y, m, c in monthly}
    years = sorted({y for y, _, _ in monthly if y >= start_year})
    year_end = {}
    for y, m, c in monthly:
        year_end[y] = c  # monthly 已升序，覆盖到最后一个月 = 年末收盘

    out = []
    for y in years:
        mc = [(m, c) for yy, m, c in monthly if yy == y]
        if len(mc) < 2:
            continue
        dd_pct, peak_month, trough_month = _max_drawdown_in_year(mc)
        ret = None
        if y - 1 in year_end and year_end[y - 1]:
            ret = (year_end[y] / year_end[y - 1] - 1.0) * 100.0
        out.append({
            "year": y,
            "close": round(year_end[y], 2),
            "return_pct": round(ret, 2) if ret is not None else None,
            "max_drawdown_pct": round(dd_pct, 2),
            "peak_month": peak_month,
            "trough_month": trough_month,
        })
    return out


def trough_histogram(annual):
    """年内谷值月份分布：统计每年 trough_month 落在各月的次数。"""
    counts = [0] * 12
    for a in annual:
        m = a.get("trough_month")
        if m and 1 <= m <= 12:
            counts[m - 1] += 1
    return [{"month": m, "count": counts[m - 1]} for m in range(1, 13)]


def build_heatmap(returns, start_year=HEATMAP_START_YEAR):
    """生成逐月收益热力矩阵（年份升序，行内按 1~12 月）。"""
    years = sorted({y for y, _ in returns if y >= start_year})
    rows = []
    for y in years:
        row = []
        for m in range(1, 13):
            v = returns.get((y, m))
            row.append(round(v, 2) if v is not None else None)
        rows.append(row)
    return {"years": years, "rows": rows}


def rank_months(returns, years):
    """按指定年份集合统计 1~12 月的平均收益与上涨占比，降序返回。"""
    sums = {m: [] for m in range(1, 13)}
    for (y, m), v in returns.items():
        if y in years:
            sums[m].append(v)
    ranking = []
    for m in range(1, 13):
        vals = sums[m]
        if not vals:
            ranking.append({"month": m, "avg_pct": None, "positive_ratio": None, "n": 0})
            continue
        avg = sum(vals) / len(vals)
        positive = sum(1 for v in vals if v > 0) / len(vals) * 100.0
        ranking.append({
            "month": m,
            "avg_pct": round(avg, 2),
            "positive_ratio": round(positive, 1),
            "n": len(vals),
        })
    # 平均收益降序；无数据月份排最后
    ranking.sort(key=lambda r: (r["avg_pct"] is None, -(r["avg_pct"] or 0.0)))
    return ranking


def ranking_windows(returns):
    """近 5 年 / 近 10 年 / 全长（2001 至今）三组月份排行榜。"""
    all_years = sorted({y for y, _ in returns})
    return {
        "5y": rank_months(returns, all_years[-5:]),
        "10y": rank_months(returns, all_years[-10:]),
        "full": rank_months(returns, [y for y in all_years if y >= RANKING_FULL_START_YEAR]),
    }


def build_summary(ranking):
    """从三组排行榜自动生成「一眼看结论」。"""
    firsts, lasts = [], []
    for key in ("5y", "10y", "full"):
        rows = [x for x in ranking[key] if x["avg_pct"] is not None]
        if not rows:
            continue
        firsts.append(rows[0]["month"])
        lasts.append(rows[-1]["month"])

    parts = []
    if len(set(firsts)) == 1 and firsts:
        parts.append(f"{MONTH_CN[firsts[0] - 1]} 三组口径均最强")
    else:
        parts.append("最强月份在三组口径中并不一致")
    if len(set(lasts)) == 1 and lasts:
        parts.append(f"{MONTH_CN[lasts[0] - 1]} 三组口径均垫底")
    else:
        parts.append("垫底月份在三组口径中并不一致")

    return {
        "best_month": firsts[0] if firsts else None,
        "worst_month": lasts[0] if lasts else None,
        "text": "；".join(parts) + "。",
    }


# ============================================================
# 数据抓取（多源降级，返回 [(year, month, close)]）
# ============================================================
def _monthly_from_daily(points):
    """把 [(year, month, day, close)] 升序日线聚合为月末收盘月线。"""
    out = {}
    for y, m, _d, c in points:
        out[(y, m)] = c  # 日线升序，最后一条 = 当月最后一个交易日收盘
    return [(y, m, c) for (y, m), c in sorted(out.items())]


def _yahoo_daily_chunk(symbol, period1, period2, retries=3):
    """拉取一个时间窗口的日线；429 限流按指数退避重试。"""
    quoted = symbol.replace("^", "%5E")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{quoted}"
    params = {"period1": period1, "period2": period2, "interval": "1d"}
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, timeout=30, headers=UA)
            if r.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            result = r.json()["chart"]["result"][0]
            ts = result.get("timestamp") or []
            closes = (result.get("indicators", {}).get("quote") or [{}])[0].get("close") or []
            points = []
            for t, c in zip(ts, closes):
                f = _to_float(c)
                if f is None:
                    continue
                d = datetime.fromtimestamp(t, tz=timezone.utc)
                points.append((d.year, d.month, d.day, f))
            return points
        except requests.RequestException:
            if attempt == retries - 1:
                return []
            time.sleep(2 ** attempt)
    return []


def _parse_yahoo_daily_chunks(symbol=SYMBOL, start_year=1985, chunk_years=5):
    """分段拉取日线再聚合月线，规避 Yahoo range=max 的稀疏采样。"""
    end_year = beijing_year() + 1
    points = []
    y = start_year
    while y < end_year:
        y2 = min(y + chunk_years, end_year)
        p1 = int(datetime(y, 1, 1, tzinfo=timezone.utc).timestamp())
        p2 = int(datetime(y2, 1, 1, tzinfo=timezone.utc).timestamp())
        points.extend(_yahoo_daily_chunk(symbol, p1, p2))
        y = y2
        if y < end_year:
            time.sleep(1.5)
    return _monthly_from_daily(points)


def _parse_sina_monthly(symbol=".IXIC"):
    """akshare 新浪美股指数日线 → 月末收盘（作为最后的兜底源）。"""
    import akshare as ak

    df = ak.index_us_stock_sina(symbol=symbol)
    if df is None or len(df) == 0:
        return []
    points = []
    for _, row in df.iterrows():
        date = str(row.get("date"))[:10]
        close = _to_float(row.get("close"))
        if not date or close is None:
            continue
        try:
            y, m, _d = date.split("-")
            points.append((int(y), int(m), close))
        except ValueError:
            continue
    # 日线按月聚合取月末（每月最后一条）收盘价
    by_month = {}
    for y, m, c in points:
        by_month[(y, m)] = c
    return [(y, m, c) for (y, m), c in sorted(by_month.items())]


FETCHERS = [
    ("Yahoo Finance", _parse_yahoo_daily_chunks),
    ("新浪", _parse_sina_monthly),
]


def fetch_monthly():
    """依次尝试数据源，取第一个够长的月线序列；返回 (source, monthly)。"""
    longest = []
    longest_source = None
    for source, fn in FETCHERS:
        try:
            points = _dedupe_points(fn())
        except Exception as e:  # noqa: BLE001
            print(f"  ⚠ 纳指历史[{source}] 抓取失败: {e}")
            points = []
        if len(points) > len(longest):
            longest = points
            longest_source = source
        if len(points) >= MIN_MONTHS:
            return source, points
    return longest_source, longest


# ============================================================
# 组装与写盘
# ============================================================
def build():
    """抓取 + 计算，返回 payload；数据不足且无历史快照返回 None。"""
    source, monthly = fetch_monthly()
    if not monthly or len(monthly) < 24:
        prev = read_json(OUTPUT_FP) if OUTPUT_FP.exists() else {}
        if prev.get("annual"):
            print("  ⚠ 纳指历史：数据源失败，保留历史快照")
            return prev
        return None

    returns = monthly_returns(monthly)
    annual = annual_stats(monthly)
    ranking = ranking_windows(returns)
    range_years = sorted({a["year"] for a in annual})
    return {
        "generated_at": beijing_now_iso(),
        "schema_version": 1,
        "index": {"symbol": SYMBOL, "name": INDEX_NAME, "currency": INDEX_CURRENCY},
        "source": source,
        "range": {"first_year": range_years[0], "last_year": range_years[-1]},
        "annual": annual,
        "drawdown_histogram": trough_histogram(annual),
        "heatmap": build_heatmap(returns),
        "ranking": ranking,
        "summary": build_summary(ranking),
        "disclaimer": "历史数据与模型策略不代表未来收益，不构成具体买卖建议。",
    }


def main():
    payload = build()
    if payload is None:
        print("❌ 纳指历史：全部数据源失败且无历史快照，跳过写入")
        raise SystemExit(1)
    write_json(OUTPUT_FP, payload)
    rng = payload["range"]
    print(
        f"✅ 纳指历史：{rng['first_year']}-{rng['last_year']} "
        f"共 {len(payload['annual'])} 年（{payload['source']}）· {payload['summary']['text']}"
    )


if __name__ == "__main__":
    main()
