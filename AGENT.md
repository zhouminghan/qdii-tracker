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
# 测试
node --test scripts/tests/etf-runtime.test.mjs
python3 scripts/tests/stamp-asset-version.test.py
```

---

## Critical Rules

1. **scan 后必须接 enrich + fill**，否则覆盖式写入会丢失已有 enriched 数据
2. **nav_date 永不回退，绝不造日期**：lsjz 失败保留旧值，不用 `datetime.now()` 推算交易日（历史血泪教训）
3. **不删 `web/data/holdings/` 下的 JSON**：即使"未引用"也不是孤儿，保留无成本；例外：`force_exclude` 基金的持仓文件可删（基金已被排除，不会再被访问）
4. **不改 A 股红涨绿跌配色**
5. **不在 `web/` 下创建新文件**（除 `data/*.json`、`js/*.js`、`.nojekyll`），不引入构建工具；Tailwind 构建配置放 `scripts/frontend-build/`
6. **版本戳由 `deploy-pages.yml` 自动注入**：本地开发无需手动 bump；新增 JS 模块时在 `index.html` 写 `?v=placeholder` 即可，发布时会自动替换为构建版本号
7. **主动基红色警告禁止移除/弱化**
8. **关闭本地服务必须用 PID，禁止 `lsof -ti:PORT | xargs kill`**：后者会误杀同端口的其他进程（如微信、企业微信）；启动服务时记录 PID，关闭时 `kill <PID>`
9. **本地预览端口用 8765**，避开常用应用端口（微信 8080 等）
