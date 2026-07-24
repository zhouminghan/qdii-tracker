# holdings-pipeline — 基金持仓抓取

**文件**：`scripts/pipeline/holdings.py`
**上游**：`fill.py`（通常在 fill 之后运行）
**下游**：前端 `main.js` 持仓详情 Modal（读取 `holdings/{code}.json`）
**updated**：2026-07-24

## 入口
```python
from pipeline import holdings
holdings.main()          # 全量
holdings.main(['--codes', '002891,000041'])  # 仅指定基金
```
主入口：`holdings.py:main()` (line 14-72)

## 核心流程

1. **收集目标代码** (line 25-48)：
   - 遍历 `HOLDINGS_CATEGORIES`（`active`, `global_other`）→ 取每个系列的 `default_share_code`
   - 追加 `passive_override(type=active)` 的代码（如 096001 大成标普500 等权重）
2. **逐只抓取** (line 57-65)：
   - `fetch_and_save_holdings(code, holdings_dir, fetch_holdings)` → 每次 0.3s 间隔
   - 成功后打印 Top 3 重仓股

## 关键函数表

| 函数 | 行号 | 作用 |
|------|------|------|
| `main()` | 14 | 持仓抓取主流程 |
| `fetch_holdings()` | `sources/akshare_source.py:136` | 调 AKShare 获取持仓数据 |
| `fetch_and_save_holdings()` | `core/utils.py:208` | 抓取→normalize→write→log 统一链 |

## 数据依赖

| 读文件 | 写文件 | 外部 API |
|--------|--------|----------|
| `web/data/active.json` | `web/data/holdings/{code}.json` | `ak.fund_portfolio_hold_em()` |
| `web/data/global_other.json` | | |
| `config/funds.json` (passive_override) | | |

## 约束
- 仅抓 HOLDINGS_CATEGORIES（`active`, `global_other`）的 default_share_code
- `normalize_holdings_keys()` 保证 key 顺序一致
- outputs：`holdings/{code}.json` 格式见 `STANDARD_HOLDINGS_KEY_ORDER`（`core/constants.py:97-104`）
