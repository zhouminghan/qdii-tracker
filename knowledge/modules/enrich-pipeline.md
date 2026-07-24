# enrich-pipeline — 丰富基金数据

**文件**：`scripts/pipeline/enrich.py`
**上游**：`scan.py`（必须在 scan 之后运行）
**下游**：`fill.py`（补全缺失字段）
**updated**：2026-07-24

## 入口
```python
from pipeline import enrich
enrich.main()          # 全量
enrich.main(['--codes', '002891,000041'])  # 仅指定基金
```
主入口：`enrich.py:main()` (line 28-140)

## 核心流程

1. **Step 1 — 批量数据** (line 38-40)：
   - `fetch_rank_data()` → 全量涨跌幅（nav/chg_1m/chg_ytd 等）
   - `fetch_purchase_data()` → 全量申购状态/限额
   - `fetch_etf_data()` → 全量 ETF 场内价/规模
2. **Step 2 — 收集代码** (line 43-53)：遍历所有分类 JSON，收集全部基金代码
3. **Step 3 — 逐只拉取** (line 58-72)：雪球 `fetch_basic_info(code)` + `fetch_fee_detail(code)`，每只 0.2s 间隔
4. **Step 4 — 合并数据** (line 75-131)：
   - 涨跌幅数据防回退：nav_date 前进才覆盖净值字段
   - 份额排序：`share_sort_key()`（币种→份额类型→代码）
   - `default_share_code` = 排序后第一个份额
   - `series_scale` = A 类人民币份额规模
   - 系列按规模降序排列

## 关键函数表

| 函数 | 行号 | 作用 |
|------|------|------|
| `main()` | 28 | 全量丰富主流程（含 --codes 参数） |
| `share_sort_key()` | 15 | 份额排序键（币种→份额类型→代码） |
| `calc_series_scale()` | `core/utils.py:107` | 系列规模计算（A类人民币份额） |

## 数据依赖

| 读文件 | 写文件 | 外部 API |
|--------|--------|----------|
| `web/data/{cat}.json` (6 个) | `web/data/{cat}.json` (6 个) | `ak.fund_open_fund_rank_em()` |
| | `web/data/meta.json` | `ak.fund_purchase_em()` |
| | | `ak.fund_etf_spot_em()` |
| | | `ak.fund_individual_basic_info_xq()` (逐只) |
| | | `ak.fund_individual_detail_info_xq()` (逐只) |
| | | `fetch_lsjz()` (ETF nav_date 回填) |

## 约束
- 逐只雪球接口需 `time.sleep(0.2)` 防止反爬
- enrich 只补空白字段，已有数据不覆盖（nav_date 有防回退保护）
- ETF 规模仅当 share.scale 为空时从 etf_map 补充
