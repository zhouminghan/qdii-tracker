# QDII 数据运维

## 适用场景
- 触发数据更新（`fundctl.py sync` / `fundctl.py refresh`）
- 新增或下架基金
- 数据异常排查
- 分类规则调整

## 流程
1. `fundctl.py diagnose` — 诊断当前数据状态
2. 按异常类别执行修复
3. 修复后重跑诊断，确认清零
4. `fundctl.py check` — 跑验收
5. 提交数据变更

## 关键规则
- scan 后必接 enrich + fill，否则覆盖丢数据
- nav_date 永不回退
- force_include 不继承子类
- 持仓仅抓 active / global_other（`scripts/core/constants.py → HOLDINGS_CATEGORIES`）
- ETF 无申购历史

## 自主修复
- `missing_nav` → `fundctl.py refresh --code <code>`
- `missing_fee` → `fundctl.py sync`
- 无法自动修复的 → 追加到 `feedback/anomalies.md`

## 相关文件
- 数据：`web/data/*.json`
- 配置：`config/funds.json`
- 诊断：`scripts/pipeline/diagnose.py`
- 异常追踪：`feedback/anomalies.md`
- 状态：`feedback/.fund_add_state.json`
