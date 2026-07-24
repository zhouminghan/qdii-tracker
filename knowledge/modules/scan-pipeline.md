# scan-pipeline — 全量扫描分类

**文件**：`scripts/pipeline/scan.py`
**上游**：`fundctl.py cmd_add()` / `fundctl.py cmd_sync()`
**下游**：`enrich.py`（必须紧随，否则 enrich 数据丢失）
**updated**：2026-07-24

## 入口
```python
from pipeline import scan
scan.main()
```
主入口：`scan.py:main()` (line 289-417)

## 核心流程

1. **加载全量基金名册** (line 293-295)：`ak.fund_name_em()` → ~20000 只基金
2. **逐只分类** (line 298-328)：`classify_fund(code, name, fund_type)` → 返回 sp500/nasdaq_passive/active/global_index/global_other/etf/exclude
3. **归组系列** (line 342-370)：按 `公司::产品名::分类` 归组 → `series_map`
4. **增量合并** (line 378-397)：`_merge_series()` 保留旧数据中 scan 不拥有的字段（nav/scale/fee 等）
5. **写盘** (line 390-397)：`normalize_share_keys()` → `{cat}.json`
6. **更新 meta** (line 399-411)：`meta.json` 含各分类系列数和基金数

### 分类优先级
`scan.py:classify_fund()` (line 82-107)：
force_exclude → force_include → 非 QDII → EXCLUDE_KEYWORDS → 标普/纳指/US关键词匹配 → exclude

### 系列识别
`scan.py:extract_company_and_series()` (line 148-163)：从基金名提取公司和产品名，标准化后归组。

## 关键函数表

| 函数 | 行号 | 作用 |
|------|------|------|
| `main()` | 289 | 全量扫描主流程 |
| `classify_fund()` | 82 | 核心分类逻辑（返回分类标签） |
| `is_qdii()` | 28 | QDII 基金判断 |
| `is_etf()` | 38 | ETF 判断（代码前缀/名称正则） |
| `extract_etf_target()` | 49 | ETF 跟踪标的分类（sp500/nasdaq100/us50/other） |
| `extract_company_and_series()` | 148 | 从基金名提取公司+产品名 |
| `extract_share_class()` | 166 | 提取份额类型（A/C/D/E/F/H/I 等） |
| `_merge_series()` | 270 | 增量合并新旧数据（保留 enrich 字段） |
| `_normalize_fund_name()` | 136 | 基金名标准化（去括号/币种/纳指统一） |

## 数据依赖

| 读文件 | 写文件 | 外部 API |
|--------|--------|----------|
| `config/funds.json` (SSOT 分类规则) | `web/data/{cat}.json` (6 个) | `ak.fund_name_em()` |
| `web/data/{cat}.json` (增量合并旧数据) | `web/data/meta.json` | — |

## 约束
- 来自 AGENT.md：「scan 后必须接 enrich + fill，否则覆盖丢失已有数据」
- `EXCLUDE_KEYWORDS` / `FORCE_INCLUDE_CODES` 来自 `config/funds.json`
- SCAN_OWNED_SHARE_KEYS (line 205) 定义了 scan 拥有的字段（只有 code/name/share_class/currency/fund_type），其余字段不覆盖
