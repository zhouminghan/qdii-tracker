# QDII Tracker

> 仅记录代码无法推断的约束与决策。

## Commands

```bash
cd scripts
python3 fundctl.py sync      # 完整流水线
python3 fundctl.py refresh    # 增量更新（fill→refresh）
python3 fundctl.py add --code 008888 --to active --keyword "某某基金"
python3 fundctl.py move --keyword "关键词" --from 分类 --to 分类
python3 fundctl.py check      # 一致性校验
cd ../web && python3 -m http.server 8765
```

## Critical Rules

1. **scan 后必须接 enrich + fill**，否则覆盖写入丢失已有数据
2. **禁止在 `update-data.yml` 中部署 Pages**：仅 commit/push + `gh workflow run deploy-pages.yml --ref main`。GITHUB_TOKEN push 不触发其他 workflow（官方防递归），须 `gh workflow run` 显式调度
3. **数据文件不写时间戳**：仅 `meta.json` 保留 `generated_at`，`bump_generated_at()` 只更新 meta
4. **写盘前 normalize**：`{cat}.json` → `normalize_share_keys()`；`holdings/{code}.json` → `normalize_holdings_keys()`。模板在 `core/constants.py`。fill.py `ThreadPoolExecutor(max_workers=4)` + `BoundedSemaphore`，worker 仅 I/O，主线 apply + normalize
5. **nav_date 永不回退、不造日期**：lsjz 失败保留旧值，禁用 `datetime.now()` 推算
6. **`force_include` 不继承子类**：A/C/美元逐一加入。跨分类挪动：(a) 全量子类加 force_include → (b) scan 后检查源文件残留并合并 → (c) 补跑 enrich+fill+refresh；(b) 易遗漏
7. **LOF 基金 chg_ytd 兜底**：akshare 对部分 LOF 返回空，取同系列兄弟份额值写入（A/C 差异 <1%）
8. **表头日期用分组众数，非全 Tab 最大值**：混合表不同分组 nav_date 不同。用 `pickGroupHeaderDate`（众数）；`applyChipFilter` 切组须重算 + 同步 `.nav-date-sub` + 行内日期显隐
9. **不改既有 UI 决策**：红涨绿跌配色、主动基红色警告——别「优化」
10. **`web/` 目录纪律**：仅 `data/*.json`、`js/*.js`、`css/*.css`、`.nojekyll`；不引入构建工具；Tailwind 预编译产物直接提交
11. **版本戳**：`deploy-pages.yml` 自动注入，本地无需手动 bump；新增 JS 模块写 `?v=placeholder`
12. **关服务用 PID**：禁 `lsof -ti:PORT | xargs kill`
