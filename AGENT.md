# QDII Tracker

> 仅记录代码无法推断的约束与决策。架构 + 功能 + 命令见 README。

## Commands

```bash
cd scripts && python3 fundctl.py sync    # 完整流水线（scan→enrich→fill→holdings）
cd scripts && python3 fundctl.py refresh  # 增量更新（fill）
cd scripts && python3 fundctl.py add --code 008888 --to active --keyword "基金名"
cd scripts && python3 fundctl.py check    # 一致性校验
cd ../web && python3 -m http.server 8765  # 本地开发
```

## Critical Rules

### 数据流水线
1. **scan 后必须接 enrich + fill**，否则覆盖丢失已有数据
2. **数据文件不写时间戳**：仅 `meta.json` 保留 `generated_at`
3. **写盘前 normalize**：`{cat}.json` → `normalize_share_keys()`；模板在 `core/constants.py`
4. **nav_date 永不回退**：lsjz 失败保留旧值，禁用 `datetime.now()` 推算
5. **force_include 不继承子类**：A/C/美元逐一加入；跨分类挪动：(a) 全量子类加 → (b) scan 后检查残留 → (c) enrich+fill
6. **LOF chg_ytd 兜底**：取同系列兄弟份额（A/C 差异 <1%）
7. **ETF 无申购历史**：`_update_history()` 跳过 `"场内"` 状态

### 部署
8. **禁止 CI 内嵌部署**：仅 commit+push → `gh workflow run deploy-pages.yml --ref main`
9. **不改既有 UI**：红涨绿跌、主动基红色警告 —— 别动配色
10. **版本戳**：`deploy-pages.yml` 自动 bump，新增 JS/CSS 写 `?v=placeholder`
11. **目录纪律**：`web/` 仅 `data/*.json`、`js/*.js`、`css/*.css`、`.nojekyll`

### 截图分享
12. **screenshot.js**：IIFE，`html-to-image` CDN 懒加载；CSS 独立 `app.css`
13. **7 风格 × 3 布局**：CSS class `ss-style-*` / `ss-layout-*`；始终手机格式（360px 锁定）
14. **iOS**：截前移除 `backdrop-filter`，`navigator.share()` 存相册
15. **申购历史**：`_update_history()` → `buy_status_history[]`；同状态只刷日期，变化 push 新条目
16. **calcLimit()** 按分组分别求和；**flattenByGroup()** 取默认份额，不展开 A/C

### 实时轮询
17. **idle-scheduler**：页面隐藏/空闲自动暂停，恢复 catch-up；所有轮询模块共用
18. **offshore-live-nav**：lsjz → pingzhongdata 兜底；settled 90min 静默；失败 15/30/60min 退避
19. **etf-premium**：盘中 60s / 午休 120s / settled 24h 静默
20. **market-indices**：盘中 60s / 盘后 5min / 周末 30min
