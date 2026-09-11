# 模块边界契约

> 每个模块的输入/输出文件、依赖关系。`pipeline/` = 数据生产链路，`checks/` = 质量门禁+诊断+辅助。

## pipeline/ — 数据生产链路

### 1. scan.py — 扫描分类

| 属性 | 内容 |
|------|------|
| **职责** | 从 AKShare 获取全量基金，按板块自动分类，归组成 series + shares 结构 |
| **输入文件** | `config/funds.json` (分类规则 SSOT) |
| **输出文件** | `web/data/{sp500,nasdaq_passive,active,global_index,global_other,etf}.json`、`web/data/meta.json` |
| **读已有 JSON** | 增量合并：读取已有 `{cat}.json` 保留 enrich/fill 填充的字段 |
| **依赖** | `core.constants`、`core.utils`、`core.config_loader`、`sources.akshare_source` |

### 2. enrich.py — 批量丰富

| 属性 | 内容 |
|------|------|
| **职责** | 批量拉取涨跌幅/限额/申购状态，逐只拉取规模/经理/成立时间/费率 |
| **输入文件** | `web/data/{cat}.json`（6 个分类） |
| **输出文件** | 同文件覆写 |
| **依赖** | `core.constants`、`core.utils`、`sources.akshare_source`、`sources.eastmoney_source`、`sources.xueqiu_source` |

### 3. fill.py — 补全缺失

| 属性 | 内容 |
|------|------|
| **职责** | Pass 1: lsjz+pzd 双源补净值/收益（4 线程并行）；Pass 2: F10 补规模/经理/成立/费率；Pass 2b: 补 buy_rules/sell_rules；Pass 3: 补 chg_ytd；Pass 4: 补 chg_since_inception；最后刷新申购状态 |
| **输入文件** | `web/data/{cat}.json`（6 个分类） |
| **输出文件** | 同文件覆写 + `web/data/meta.json`（bump_generated_at） |
| **依赖** | `core.constants`、`core.utils`、`sources.eastmoney_source`、`sources.akshare_source` |

### 4. holdings.py — 持仓抓取

| 属性 | 内容 |
|------|------|
| **职责** | 逐只抓取主动基金 + 全球/其他 QDII 的 Top10 重仓股 |
| **输入文件** | `web/data/{active,global_index,global_other}.json`（仅 HOLDINGS_CATEGORIES） |
| **输出文件** | `web/data/holdings/{code}.json`（每只一个文件） |
| **依赖** | `core.constants`、`core.utils`、`core.config_loader`、`sources.akshare_source` |

### 5. reclassify.py — 增量重分类

| 属性 | 内容 |
|------|------|
| **职责** | 将一只基金从一个板块移到另一个板块（增量，避免全量流水线 8-10 分钟） |
| **输入文件** | `web/data/{from_cat}.json`、`web/data/{to_cat}.json`、`config/funds.json` |
| **输出文件** | 同上文件覆写 + `web/data/meta.json` + `config/funds.json`（白名单更新） |
| **依赖** | `core.constants`、`core.utils`、`core.config_loader`、`sources.akshare_source` |

### 6. codegen.py — 前端配置生成

| 属性 | 内容 |
|------|------|
| **职责** | 从 `config/funds.json` 生成 `web/js/config.js` 中的派生常量段 |
| **输入文件** | `config/funds.json`、`web/js/config.js` |
| **输出文件** | `web/js/config.js`（替换 AUTO-GENERATED CONFIG 块） |
| **依赖** | `core.constants` |

---

## checks/ — 质量门禁 + 诊断 + 辅助

### 7. verify_data.py — 黄金样例校验

| 属性 | 内容 |
|------|------|
| **职责** | 解析 `knowledge/golden-fixtures.md` 中的 JSON fixtures，与 `web/data/*.json` 逐条核对 |
| **输入文件** | `knowledge/golden-fixtures.md`、`web/data/*.json` |
| **输出文件** | 无（返回错误列表） |
| **依赖** | 无兄弟模块依赖 |

### 8. cross_validate.py — 跨源交叉验证

| 属性 | 内容 |
|------|------|
| **职责** | 对比 lsjz（天天基金）和 pzd（pingzhongdata）的净值，偏差 > 0.5% 标记异常 |
| **输入文件** | `web/data/*.json` |
| **输出文件** | 无（返回异常列表） |
| **依赖** | 无兄弟模块依赖 |

### 9. diagnose.py — 诊断引擎

| 属性 | 内容 |
|------|------|
| **职责** | 检查 missing_nav / buy_status_anomaly / nav_regression / fee_anomalies，支持 --auto-fix |
| **输入文件** | `web/data/*.json`（除 meta.json） |
| **输出文件** | 无（只输出诊断报告；--auto-fix 时调 `fundctl.py refresh` 修复） |
| **依赖** | 无兄弟模块依赖 |

### 10. architecture_lint.py — 目录纪律校验

| 属性 | 内容 |
|------|------|
| **职责** | 校验 `web/` 目录结构符合白名单规则 |
| **输入文件** | `web/` 目录 |
| **输出文件** | 无（返回错误列表） |
| **依赖** | 无兄弟模块依赖 |

### 11. scan_scenarios.py — 改动↔场景联动

| 属性 | 内容 |
|------|------|
| **职责** | git diff 获取改动文件 → 匹配 ui_scenarios/*.yaml 的 fixed_in 字段 → 提示关联场景 |
| **输入文件** | git diff (HEAD)、`test/ui_scenarios/*.yaml` |
| **输出文件** | 无（返回映射字典，non-blocking 提示） |
| **依赖** | 无兄弟模块依赖 |

### 12. stamp_asset_version.py — 版本戳

| 属性 | 内容 |
|------|------|
| **职责** | 统一改写 `web/index.html` 中本地 JS/CSS 资源的 `?v=` 版本戳。现已兼容双引号（`<script src="...">`）和单引号（`import from '...'` ES module）两种引用格式。 |
| **输入文件** | `web/index.html` |
| **输出文件** | 同文件覆写 |
| **依赖** | `core.constants` |

### 13. verify_purchase.py — 申购状态/限额/历史一致性校验

| 属性 | 内容 |
|------|------|
| **职责** | 校验 buy_status / daily_limit / buy_status_history 语义一致性：ETF 历史必空、无 1e11 哨兵值、历史尾条与当前状态一致（防 G015/G016 复发） |
| **输入文件** | `web/data/*.json` |
| **输出文件** | 无（返回错误列表） |
| **依赖** | `core.constants` |

---

## 依赖关系图

### pipeline/ （数据生产）

```
scan.py ────────► core.constants, core.utils, core.config_loader, sources.akshare_source
enrich.py ──────► core.constants, core.utils, sources.akshare_source, sources.eastmoney_source, sources.xueqiu_source
fill.py ────────► core.constants, core.utils, sources.eastmoney_source, sources.akshare_source
holdings.py ────► core.constants, core.utils, core.config_loader, sources.akshare_source
reclassify.py ──► core.constants, core.utils, core.config_loader, sources.akshare_source
codegen.py ─────► core.constants
```

### checks/ （质量门禁）

```
verify_data.py ──────► (独立)
cross_validate.py ───► (独立)
diagnose.py ─────────► (独立)
architecture_lint.py ─► (独立)
scan_scenarios.py ───► (独立)
stamp_asset_version.py ► core.constants
verify_purchase.py ───► core.constants
```

> 注：`checks/` 模块通过 `fundctl.py` 统一调用，无兄弟模块依赖，各自独立。
