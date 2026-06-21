# QDII Tracker

> 美股 QDII 基金追踪看板。仅记录 Claude 无法从代码推断的约束与决策。

---

## Commands

```bash
cd scripts
python3 fundctl.py sync      # 完整流水线
python3 fundctl.py refresh    # 增量更新（fill→refresh）
python3 fundctl.py add --code 008888 --to active --keyword "某某基金"
python3 fundctl.py move --keyword "关键词" --from 分类 --to 分类
python3 fundctl.py check      # 一致性校验（CI 中也会自动跑）
cd ../web && python3 -m http.server 8765
```

---

## Critical Rules

1. **scan 后必须接 enrich + fill**，否则覆盖式写入会丢失已有 enriched 数据
2. **nav_date 永不回退，绝不造日期**：lsjz 失败保留旧值，不用 `datetime.now()` 推算交易日
3. **不改既有 UI 决策**：A 股红涨绿跌配色、主动基红色警告等——不要「优化」
4. **不在 `web/` 下创建新文件**（除 `data/*.json`、`js/*.js`、`css/*.css`、`.nojekyll`），不引入构建工具；Tailwind 为预编译产物直接提交到 `web/css/`
5. **版本戳由 `deploy-pages.yml` 自动注入**，本地开发无需手动 bump；新增 JS 模块写 `?v=placeholder`
6. **关闭本地服务必须用 PID**，禁 `lsof -ti:PORT | xargs kill`（会误杀同端口其他进程）
7. **`force_include` 按代码粒度生效，不继承子类**：每只基金的 A/C/美元等子类代码必须逐一加入，否则仍被 `exclude_keywords` 拦截。跨分类挪动基金时注意：(a) 全量子类加 force_include → (b) 跑 scan 后检查源文件残留数据并合并回目标文件 → (c) 补跑 enrich+fill+refresh+codegen；(b) 步骤易遗漏，scan 会覆盖目标文件但不保证清干净源文件
8. **LOF 基金可能缺 `chg_ytd`**：akshare 累计收益率接口对部分 LOF 返回空，workaround 是取同系列兄弟份额值直接写入（A/C 差异 <1%）
