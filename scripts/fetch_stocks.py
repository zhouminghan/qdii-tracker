"""
抓取持仓股票的实时行情（当日涨跌等）
- 从 data/holdings/*.json 里收集所有股票代码
- 一次性拉 AKShare stock_us_spot_em（约 2 分钟）
- 输出到 data/us_stocks.json，key 为股票代码
"""
import json
import time
from datetime import datetime
from pathlib import Path

import akshare as ak
import pandas as pd


def _to_float(v):
    if v is None or (isinstance(v, float) and pd.isna(v)) or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def main():
    project_root = Path(__file__).parent.parent
    data_dir = project_root / "data"
    web_data_dir = project_root / "web" / "data"
    holdings_dir = data_dir / "holdings"
    holdings_dir.mkdir(parents=True, exist_ok=True)

    # Seed：data/holdings 为空时从 web/data/holdings/ 拷贝（新克隆/CI 场景）
    if not any(holdings_dir.glob("*.json")):
        web_holdings_dir = web_data_dir / "holdings"
        if web_holdings_dir.exists():
            import shutil as _shutil
            for src in web_holdings_dir.glob("*.json"):
                _shutil.copy2(src, holdings_dir / src.name)
            print(f"🌱 seed: data/holdings/ ← web/data/holdings/（{len(list(holdings_dir.glob('*.json')))} 个）")

    # 1. 收集持仓股票代码（去重）
    stock_codes = set()
    for f in holdings_dir.glob("*.json"):
        with open(f, encoding="utf-8") as fp:
            d = json.load(fp)
        for h in d.get("holdings", []):
            sc = h.get("stock_code")
            if sc:
                stock_codes.add(sc.strip())

    print(f"📊 共收集 {len(stock_codes)} 只持仓股票（去重后）")
    print(f"  示例: {list(stock_codes)[:10]}")

    # 2. 拉美股全量（一次搞定）
    print(f"\n🔍 拉取美股全量行情（可能较慢，约 2-3 分钟）...")
    t0 = time.time()
    try:
        df_us = ak.stock_us_spot_em()
        print(f"  ✅ 美股 {len(df_us)} 条 （耗时 {time.time()-t0:.0f}s）")
    except Exception as e:
        print(f"  ❌ 美股接口失败: {e}")
        df_us = None

    # 3. 拉港股全量（持仓里有港股，如腾讯/阿里）
    print(f"\n🔍 拉取港股全量行情...")
    t0 = time.time()
    try:
        df_hk = ak.stock_hk_spot_em()
        print(f"  ✅ 港股 {len(df_hk)} 条 （耗时 {time.time()-t0:.0f}s）")
    except Exception as e:
        print(f"  ❌ 港股接口失败: {e}")
        df_hk = None

    # 4. 拉 A 股（部分持仓是 A 股）
    print(f"\n🔍 拉取 A 股全量行情...")
    t0 = time.time()
    try:
        df_a = ak.stock_zh_a_spot_em()
        print(f"  ✅ A 股 {len(df_a)} 条 （耗时 {time.time()-t0:.0f}s）")
    except Exception as e:
        print(f"  ❌ A 股接口失败: {e}")
        df_a = None

    # 5. 构建查找表
    stocks_map = {}

    def add_row(row, market):
        code_raw = str(row.get("代码", "")).strip()
        # 美股代码是 "105.NFLX" 格式，取 . 后面的部分
        if "." in code_raw and market == "US":
            code = code_raw.split(".")[-1]
        else:
            code = code_raw
        stocks_map[code] = {
            "code": code,
            "name": str(row.get("名称", "")).strip(),
            "market": market,
            "price": _to_float(row.get("最新价")),
            "change_pct": _to_float(row.get("涨跌幅")),
            "change_amt": _to_float(row.get("涨跌额")),
        }

    matched_us = matched_hk = matched_a = 0
    if df_us is not None:
        # 美股代码 = NFLX、AAPL 等，或者带 "." 前缀
        for _, row in df_us.iterrows():
            code_raw = str(row.get("代码", "")).strip()
            code = code_raw.split(".")[-1] if "." in code_raw else code_raw
            if code in stock_codes:
                add_row(row, "US")
                matched_us += 1

    if df_hk is not None:
        for _, row in df_hk.iterrows():
            code = str(row.get("代码", "")).strip()
            # 港股持仓代码可能是 "00700"，接口返回也是这个格式
            if code in stock_codes:
                add_row(row, "HK")
                matched_hk += 1

    if df_a is not None:
        for _, row in df_a.iterrows():
            code = str(row.get("代码", "")).strip()
            if code in stock_codes:
                add_row(row, "A")
                matched_a += 1

    print(f"\n📈 匹配结果: 美股 {matched_us} / 港股 {matched_hk} / A股 {matched_a}")
    print(f"  命中率: {len(stocks_map)}/{len(stock_codes)} = {len(stocks_map)/max(len(stock_codes),1)*100:.1f}%")

    # 6. 保存
    output = {
        "generated_at": datetime.now().isoformat(),
        "total_stocks": len(stocks_map),
        "stocks": stocks_map,
    }
    out_file = data_dir / "us_stocks.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\n✅ 已保存到 {out_file}")

    # 同步到 web/data/（前端消费目录）
    if web_data_dir.exists():
        import shutil as _shutil
        _shutil.copy2(out_file, web_data_dir / "us_stocks.json")
        print(f"🔄 同步到 {web_data_dir / 'us_stocks.json'}")


if __name__ == "__main__":
    main()
