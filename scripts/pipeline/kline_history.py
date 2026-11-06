"""
scripts/pipeline/kline_history.py — 生成指数 / 场内 ETF 的历史日 K

数据源：东财 push2his 日 K（klt=101，fqt=0 不复权）。
输出：
  web/data/index-kline/{card_symbol}.json  （8 个指数）
  web/data/etf-kline/{code}.json            （场内 ETF）

扁平数组格式：dates / open / high / low / close / volume。
- 全量（默认）：从 1990 年起抓完整日 K
- 增量（--incremental）：读现有文件，只追加比最后日期更新的点

只存日 K；周 K / 月 K 由前端按日 K 聚合，避免重复存储。
"""
import argparse
import math

from core.constants import DATA_DIR, HEADERS_EASTMONEY
from core.utils import beijing_now_iso, read_json, requests_get, write_json

INDEX_DIR = DATA_DIR / "index-kline"
ETF_DIR = DATA_DIR / "etf-kline"
FX_DIR = DATA_DIR / "fx-kline"
FULL_BEG = "19900101"
KLINE_HOSTS = [
    "push2his.eastmoney.com",
    "push2.eastmoney.com",
]

# (前端卡片 data-symbol, 东财 secid)
INDEX_TARGETS = [
    ("100.DJIA", "100.DJIA"),     # 道琼斯
    ("100.SPX", "100.SPX"),       # 标普 500
    ("100.NDX", "100.NDX"),       # 纳斯达克综合
    ("100.NDX100", "100.NDX100"), # 纳斯达克 100
    ("251.SOX", "251.SOX"),       # 费城半导体
    ("sh000001", "1.000001"),     # 上证指数（腾讯实时符号 vs 东财 K 线 secid）
    ("sh000300", "1.000300"),     # 沪深 300
    ("sh000688", "1.000688"),     # 科创 50
    ("100.N225", "100.N225"),     # 日经 225
    ("100.HSI", "100.HSI"),       # 恒生指数
    ("124.HSTECH", "124.HSTECH"), # 恒生科技
    ("100.KS11", "100.KS11"),     # 韩国 KOSPI
]

# Sina / akshare 回退映射：key -> (symbol, kind)
SINA_INDEX = {
    "100.DJIA": (".DJI", "us"),
    "100.SPX": (".INX", "us"),
    "100.NDX": (".IXIC", "us"),   # 纳斯达克综合
    "100.NDX100": (".NDX", "us"), # 纳斯达克 100
    "251.SOX": (".SOX", "us"),
    "100.N225": ("日经225指数", "global"),
    "100.HSI": ("HSI", "hk"),
}

# (前端卡片 data-symbol, 东财 secid, 汇率对)
FX_TARGETS = [
    ("fxUSDCNY", "133.USDCNH", "USDCNY"),     # 美元/人民币
    ("fxUSDHKD", "133.USDHKD", "USDHKD"),     # 美元/港元
    ("fxUSDJPY", "119.USDJPY", "USDJPY"),     # 美元/日元
    ("fxHKDCNY", "133.HKDCNY", "HKDCNY"),     # 港元/人民币
    ("fxEURUSD", "119.EURUSD", "EURUSD"),     # 欧元/美元
    ("fxGBPUSD", "119.GBPUSD", "GBPUSD"),     # 英镑/美元
]

_BOC_CACHE = {}


def etf_secid(code):
    """场内 ETF 代码 → 东财 secid（沪市 1.*，深市 0.*）。"""
    code = str(code)
    return f"1.{code}" if code[:1] in ("5", "6") else f"0.{code}"


def collect_etf_codes():
    fp = DATA_DIR / "etf.json"
    if not fp.exists():
        return []
    data = read_json(fp)
    return sorted({str(sh.get("code")) for s in data.get("series", [])
                   for sh in s.get("shares", []) if sh.get("code")})


def fetch_kline_em(secid, beg=FULL_BEG):
    """抓东财日 K，返回 [{date, open, high, low, close, volume}, ...] 升序。"""
    for host in KLINE_HOSTS:
        url = (
            f"https://{host}/api/qt/stock/kline/get"
            f"?secid={secid}&klt=101&fqt=0&beg={beg}&end=20500101"
            "&fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56"
        )
        r = requests_get(url, headers=HEADERS_EASTMONEY)
        if r is None:
            continue
        try:
            data = r.json()
        except ValueError:
            continue
        klines = (data.get("data") or {}).get("klines") or []
        out = []
        for line in klines:
            p = line.split(",")
            if len(p) < 6:
                continue
            try:
                out.append({
                    "date": p[0],
                    "open": float(p[1]),
                    "close": float(p[2]),
                    "high": float(p[3]),
                    "low": float(p[4]),
                    "volume": float(p[5]),
                })
            except ValueError:
                continue
        if out:
            return out
    return None


def df_to_points(df):
    """akshare DataFrame → 点列表（date/open/high/low/close/volume）。"""
    if df is None or len(df) == 0:
        return None
    out = []
    for _, row in df.iterrows():
        try:
            d = row.get("date")
            d = d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)[:10]
            vals = {k: float(row.get(k)) for k in ("open", "high", "low", "close", "volume")}
        except (TypeError, ValueError):
            continue
        if any(math.isnan(v) for v in vals.values()):
            continue
        out.append({"date": d, **vals})
    return out or None


def fetch_kline_sina(key):
    """akshare / Sina 回退（东财限流时使用）。"""
    spec = SINA_INDEX.get(key)
    if not spec:
        return None
    sym, kind = spec
    try:
        import akshare as ak
        if kind == "us":
            df = ak.index_us_stock_sina(symbol=sym)
        elif kind == "global":
            df = ak.index_global_hist_sina(symbol=sym)
        elif kind == "hk":
            df = ak.stock_hk_index_daily_sina(symbol=sym)
        else:
            return None
    except Exception:
        return None
    return df_to_points(df)


def fetch_kline_ashare_sina(symbol="sh000001"):
    """A 股指数完整历史（Sina，覆盖 1990 年至今）。"""
    try:
        import akshare as ak
        df = ak.stock_zh_index_daily(symbol=symbol)
    except Exception:
        return None
    return df_to_points(df)


def fetch_kline_etf_sina(sym):
    """场内 ETF 完整历史（Sina）。"""
    try:
        import akshare as ak
        df = ak.fund_etf_hist_sina(symbol=sym)
    except Exception:
        return None
    return df_to_points(df)


def boc_rates(symbol, start_date="20100101"):
    """BOC / Sina 外汇日频折算价，带进程内缓存；增量时只拉最近区间。"""
    key = (symbol, start_date)
    if key in _BOC_CACHE:
        return _BOC_CACHE[key]
    try:
        import akshare as ak
        df = ak.currency_boc_sina(symbol=symbol, start_date=start_date, end_date="20991231")
    except Exception:
        return {}
    out = {}
    for _, row in df.iterrows():
        d = row.get("日期")
        d = d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)[:10]
        mid = row.get("央行中间价")
        conv = row.get("中行折算价")
        v = mid if (mid is not None and mid == mid) else conv
        if v is None or v != v:
            continue
        out[d] = float(v)
    _BOC_CACHE[key] = out
    return out


def fetch_kline_fx_boc(pair, beg=FULL_BEG):
    """BOC 中间价推导汇率日线（无盘中 OHLC，开高低收同值）。"""
    start = "20100101" if beg == FULL_BEG else beg
    usd, hkd, jpy = boc_rates("美元", start), boc_rates("港币", start), boc_rates("日元", start)
    out = []
    for d in sorted(set(usd) | set(hkd) | set(jpy)):
        try:
            if pair == "USDCNY":
                v = usd[d] / 100
            elif pair == "CNYHKD":
                v = 100 / hkd[d]
            elif pair == "USDJPY":
                v = (usd[d] / 100) / (jpy[d] / 100)
            else:
                continue
        except (KeyError, ZeroDivisionError):
            continue
        out.append({"date": d, "open": v, "high": v, "low": v, "close": v, "volume": 0.0})
    return out or None


def fetch_kline_tencent(sym, limit=640):
    """腾讯日 K 回退（A 股指数 / 场内 ETF）。"""
    limit = min(int(limit), 640)  # 腾讯单次最多 640 根，超过会返回 param error
    url = (
        "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
        f"?param={sym},day,,,{limit},qfq"
    )
    r = requests_get(url, headers=HEADERS_EASTMONEY)
    if r is None:
        return None
    try:
        data = r.json()
    except ValueError:
        return None
    node = (data.get("data") or {}).get(sym) or {}
    rows = node.get("day") or node.get("qfqday") or []
    out = []
    for p in rows:
        if len(p) < 6:
            continue
        try:
            out.append({
                "date": p[0],
                "open": float(p[1]),
                "close": float(p[2]),
                "high": float(p[3]),
                "low": float(p[4]),
                "volume": float(p[5]),
            })
        except ValueError:
            continue
    return out or None


def fetch_kline_for_target(target, beg):
    """优先东财；失败时按标的类型回退 Sina / 腾讯。"""
    points = fetch_kline_em(target["secid"], beg=beg)
    if points:
        return points
    return fetch_kline_fallback(target, beg)


def fetch_kline_fallback(target, beg=FULL_BEG):
    """跳过东财，直接走 Sina / 腾讯回退（限流严重时用）。"""
    if target["kind"] == "index":
        if target["key"] in ("sh000001", "sh000300", "sh000688"):
            return fetch_kline_ashare_sina(target["key"])
        return fetch_kline_sina(target["key"])
    if target["kind"] == "etf":
        code = target["key"]
        sym = ("sh" if code[:1] in ("5", "6") else "sz") + code
        return fetch_kline_etf_sina(sym)
    if target["kind"] == "fx":
        return fetch_kline_fx_boc(target["pair"], beg)
    return None


def points_from_payload(payload):
    """扁平数组 payload → 点列表（供增量合并）。"""
    return [
        {"date": d, "open": o, "high": h, "low": l, "close": c, "volume": v}
        for d, o, h, l, c, v in zip(
            payload.get("dates") or [],
            payload.get("open") or [],
            payload.get("high") or [],
            payload.get("low") or [],
            payload.get("close") or [],
            payload.get("volume") or [],
        )
    ]


def merge_points(existing, new_points):
    """只追加日期晚于现有最后日期的点，保持升序。"""
    out = list(existing) if existing else []
    last = out[-1]["date"] if out else None
    for p in new_points or []:
        d = p.get("date")
        if not d:
            continue
        if last is not None and d <= last:
            continue
        out.append(p)
        last = d
    return out


def merge_or_replace(existing, fetched):
    """已有更长历史时保留旧数据并追加；回退源给出更完整历史时才替换。"""
    if not existing:
        return fetched
    if fetched and len(fetched) > len(existing) and fetched[-1]["date"] >= existing[-1]["date"]:
        return fetched
    return merge_points(existing, fetched)


def build_payload(code, points):
    return {
        "code": str(code),
        "updated_at": beijing_now_iso(),
        "dates": [p["date"] for p in points],
        "open": [p["open"] for p in points],
        "high": [p["high"] for p in points],
        "low": [p["low"] for p in points],
        "close": [p["close"] for p in points],
        "volume": [p["volume"] for p in points],
    }


def _write(target, points):
    target["dir"].mkdir(parents=True, exist_ok=True)
    write_json(target["dir"] / f"{target['key']}.json", build_payload(target["key"], points))


def _update(target, mode, fallback_only=False):
    fp = target["dir"] / f"{target['key']}.json"
    existing = read_json(fp) if fp.exists() else None
    beg = FULL_BEG
    if mode == "incremental" and existing and existing.get("dates"):
        beg = str(existing["dates"][-1]).replace("-", "")
    fetched = fetch_kline_fallback(target, beg) if fallback_only else fetch_kline_for_target(target, beg)
    if not fetched:
        return None
    if existing and existing.get("dates"):
        existing_points = points_from_payload(existing)
        merged = merge_or_replace(existing_points, fetched)
        if len(merged) == len(existing_points):
            return len(merged)
    else:
        merged = fetched
    _write(target, merged)
    return len(merged)


def collect_targets():
    targets = [
        {"key": key, "secid": secid, "dir": INDEX_DIR, "kind": "index"}
        for key, secid in INDEX_TARGETS
    ]
    targets += [
        {"key": code, "secid": etf_secid(code), "dir": ETF_DIR, "kind": "etf"}
        for code in collect_etf_codes()
    ]
    targets += [
        {"key": key, "secid": secid, "dir": FX_DIR, "kind": "fx", "pair": pair}
        for key, secid, pair in FX_TARGETS
    ]
    return targets


def run(mode, fallback_only=False):
    targets = collect_targets()
    label = "增量" if mode == "incremental" else "全量"
    print(f"🎯 kline({label}): {len(targets)} 个标的")
    stats = {"ok": 0, "skip": 0}

    # 串行：akshare 底层 mini-racer 不是线程安全的，且串行也避免触发数据源频控
    for i, t in enumerate(targets, 1):
        try:
            n = _update(t, mode, fallback_only)
        except Exception:
            n = None
        if n:
            stats["ok"] += 1
        else:
            stats["skip"] += 1
        if i % 20 == 0:
            print(f"  kline 进度: {i}/{len(targets)}")
    print(f"✅ kline: 成功 {stats['ok']}，跳过/失败 {stats['skip']}")


def main():
    ap = argparse.ArgumentParser(description="生成指数 / ETF 历史日 K")
    ap.add_argument("--incremental", action="store_true", help="增量模式：只追加新日期")
    ap.add_argument("--fallback-only", action="store_true", help="跳过东财，直接走 Sina/腾讯回退")
    args = ap.parse_args()
    run("incremental" if args.incremental else "full", fallback_only=args.fallback_only)


if __name__ == "__main__":
    main()
