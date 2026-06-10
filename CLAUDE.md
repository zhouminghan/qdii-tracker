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
python3 fundctl.py check      # 一致性校验
cd ../web && python3 -m http.server 8080
```

---

## Critical Rules

1. **scan 后必须接 enrich + fill**，否则覆盖式写入会丢失已有 enriched 数据
2. **nav_date 永不回退，绝不造日期**：lsjz 失败保留旧值，不用 `datetime.now()` 推算交易日（历史血泪教训）
3. **不删 `web/data/holdings/` 下的 JSON**：即使"未引用"也不是孤儿，保留无成本
4. **不改 A 股红涨绿跌配色**
5. **不在 `web/` 下创建新文件**（除 `data/*.json`、`js/*.js`、`.nojekyll`），不引入构建工具
6. **改 `web/js/*.js` 后必须 bump `index.html` 中的版本戳**：否则 GitHub Pages 强缓存导致用户看到旧版
7. **主动基红色警告禁止移除/弱化**
