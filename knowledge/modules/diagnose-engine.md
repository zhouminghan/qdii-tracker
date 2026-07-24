# diagnose-engine — 数据诊断引擎

**文件**：`scripts/pipeline/diagnose.py`
**上游**：`fundctl.py diagnose` CLI 命令
**下游**：`fundctl.py refresh`（auto_fix 时） / `feedback/anomalies.md`
**updated**：2026-07-24

## 入口
```bash
python3 fundctl.py diagnose              # 全量诊断
python3 fundctl.py diagnose --cat active # 按分类筛选
python3 fundctl.py diagnose --json       # JSON 输出
python3 fundctl.py diagnose --auto-fix   # 自动修复 missing_nav
```
诊断入口：`diagnose.py:diagnose_all()` (line 17-24)

## 核心流程

4 项检测（按严重程度降序）：

### 1. missing_nav (line 46-73)
- 检测：当前交易日应有的净值未拉取（nav 为空或 0）
- 跳过：入库 < 3 天的新基金
- 严重度：`warning`
- 自动修复：`fundctl.py refresh --code {code}`

### 2. buy_status_no_date (line 76-95)
- 检测：暂停申购/封闭期但没有标注日期
- 严重度：`info`
- 自动修复：否（下一次 fill 会自动补充）

### 3. nav_stale (line 98-122)
- 检测：meta 中 last_nav_date 超过 3 天未更新
- 严重度：`error`
- 自动修复：否（需人工排查 pipeline 是否正常）

### 4. missing_fee (line 125-144)
- 检测：管理费 (fee_mgmt) 为 0
- 严重度：`warning`
- 自动修复：否（需 `fundctl.py sync` 重跑完整流水线）

## 关键函数表

| 函数 | 行号 | 作用 |
|------|------|------|
| `diagnose_all()` | 17 | 汇总 4 项检测结果 |
| `_check_missing_nav()` | 46 | 净值缺失检测（跳过新基金） |
| `_check_buy_status_anomaly()` | 76 | 申购状态异常检测 |
| `_check_nav_regression()` | 98 | 净值日期回退检测 |
| `_check_fee_anomalies()` | 125 | 费率异常检测 |
| `auto_fix()` | 146 | 自动修复 missing_nav（subprocess 调 fundctl.py refresh） |
| `main()` | 169 | CLI 入口（--cat / --json / --auto-fix） |

## 数据依赖

| 读文件 | 写文件 | 外部 API |
|--------|--------|----------|
| `web/data/{cat}.json` (全部) | — | — （auto_fix 间接触发） |
| `web/data/meta.json` | | |

## 约束
- CI 修复白名单：仅数据刷新（refresh），不扫描/不重试/修复后必验证
- `auto_fix` 最多 3 轮，每轮 120s 超时
