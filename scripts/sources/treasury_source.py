"""
scripts/sources/treasury_source.py — 美国国债收益率数据源适配

优先从美国财政部官方 CSV 抓取 2/10/30 年收益率；失败时回退 FRED，
再回退东方财富（akshare）。`fetch_treasury()` 返回 (treasury, source)。

`parse_fred_series` 是通用 FRED CSV（DATE,VALUE）解析器，供宏观利率与
市场温度 VIX 回退链共用。
"""
import csv
import io
from datetime import datetime, timedelta

from core.utils import beijing_now, requests_get

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}
TREASURY_URL = (
    "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
    "daily-treasury-rates.csv/{year}/all?type=daily_treasury_yield_curve"
    "&field_tdr_date_value={year}&page&_format=csv"
)
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}&cosd={start}"


def _to_float(v):
    try:
        f = float(v)
        return round(f, 2) if f == f else None
    except (TypeError, ValueError):
        return None


def _to_float_raw(v):
    """不四舍五入的安全转浮点（供 FRED CSV 解析，精度由调用方决定）。"""
    try:
        f = float(v)
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def _normalize_date(raw):
    text = str(raw or "").strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return text[:10]


def parse_treasury_csv(text):
    """解析美国财政部官方 CSV，返回最新一条 2/10/30 年均有效的记录。"""
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        return None
    for row in rows:
        y2 = _to_float(row.get("2 Yr"))
        y10 = _to_float(row.get("10 Yr"))
        y30 = _to_float(row.get("30 Yr"))
        if y2 is None or y10 is None or y30 is None:
            continue
        return {"date": _normalize_date(row.get("Date")), "y2": y2, "y10": y10, "y30": y30}
    return None


def parse_fred_series(text):
    """解析 FRED CSV（DATE,VALUE），返回 [(date, float|None), ...]。"""
    out = []
    for line in text.strip().splitlines()[1:]:
        parts = line.split(",")
        if len(parts) < 2:
            continue
        out.append((parts[0].strip(), _to_float_raw(parts[1])))
    return out


def fetch_treasury_official():
    year = beijing_now().year
    response = requests_get(TREASURY_URL.format(year=year), headers=HEADERS, timeout=30)
    if response is None:
        return None
    return parse_treasury_csv(response.text)


def _fetch_fred_series(series_id, start):
    response = requests_get(FRED_URL.format(series_id=series_id, start=start), headers=HEADERS, timeout=20)
    if response is None:
        return None
    return dict(parse_fred_series(response.text))


def fetch_treasury_fred():
    start = (beijing_now() - timedelta(days=90)).strftime("%Y-%m-%d")
    y2 = _fetch_fred_series("DGS2", start)
    y10 = _fetch_fred_series("DGS10", start)
    y30 = _fetch_fred_series("DGS30", start)
    if not y2 or not y10 or not y30:
        return None
    common = set(y2) & set(y10) & set(y30)
    for date in sorted(common, reverse=True):
        if y2[date] is not None and y10[date] is not None and y30[date] is not None:
            return {
                "date": date,
                "y2": round(y2[date], 2),
                "y10": round(y10[date], 2),
                "y30": round(y30[date], 2),
            }
    return None


def fetch_treasury_akshare():
    import akshare as ak

    df = ak.bond_zh_us_rate(start_date="20250101")
    if df is None or len(df) == 0:
        return None
    # 最新一行可能只有中国国债数据，美债列尚未披露（NaN）。
    # 取最近一条 2/10/30 年都有效的记录，避免把 null 写成当日快照。
    fields = ("美国国债收益率2年", "美国国债收益率10年", "美国国债收益率30年")
    for idx in range(len(df) - 1, -1, -1):
        row = df.iloc[idx]
        y2, y10, y30 = (_to_float(row.get(f)) for f in fields)
        if y2 is None or y10 is None or y30 is None:
            continue
        return {
            "date": str(row["日期"])[:10],
            "y2": y2,
            "y10": y10,
            "y30": y30,
        }
    return None


def fetch_treasury():
    """返回 (treasury, source)；按官方 → FRED → 东方财富回退。"""
    for fetcher, source in (
        (fetch_treasury_official, "美国财政部"),
        (fetch_treasury_fred, "FRED"),
        (fetch_treasury_akshare, "东方财富/akshare"),
    ):
        try:
            treasury = fetcher()
        except Exception as e:  # noqa: BLE001
            print(f"  ⚠ 宏观利率 {source} 抓取失败: {e}")
            treasury = None
        if treasury:
            return treasury, source
    return None, None
