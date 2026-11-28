# ADR 0006：跨栈业务规则的单一权威来源

## 状态

已接受（2026-11-28）

## 背景

仓库存在两类业务规则，历史上都曾在 Python 与前端各存一份「前后端一致」的实现：

- 黄金折算：XAU/USD × USD/CNH ÷ 31.1034768 → 国内元/克，及国内溢价。
- DCA 阶梯：CNN 恐慌贪婪(0-100) + VIX + 纳指 PE → 定投阶梯与操作建议。

治理过程中已删除 `core/gold.py` 与 `core/dca_strategy.py` 两处平行实现，
本 ADR 固化剩余的唯一权威来源。

## 决策

按「数据派生 vs 展示决策」二分确定权威来源，且每种规则只保留一份实现：

- **黄金折算 → Python SSOT**：`pipeline/market_snapshot.py` 在离线管线中派生并写入
  `market-snapshot.json` 的 `gold.converted_cny_per_gram` / `premium_cny` /
  `premium_pct` 字段；前端只读取展示，不重复计算。
- **DCA 阶梯 → 前端 SSOT**：`frontend/src/shared/lib/dca.ts` 从三份静态 JSON 输入
  实时计算阶梯与建议；Python 只产出原始输入（恐慌贪婪/VIX/PE），不产出策略。
  `test/frontend/dca.spec.ts` 锁定阶梯边界与缺失值语义。

## 理由

- 黄金折算是离线数据派生，天然属于数据管线；前端不需要也无法改输入。
- DCA 是展示层的交互决策；把阶梯搬到 Python 生成 `dca-strategy.json` 会新增一个
  无第二消费者的管线模块与 JSON 契约，违反「极简主义」与 Deletion Test。
- 两种规则各有且仅有一份实现与契约测试，满足「Single Source of Truth」。

## 后果

- 修改黄金口径只改 `pipeline/market_snapshot.py` + `test_market_snapshot.py`。
- 修改 DCA 阶梯只改 `frontend/src/shared/lib/dca.ts` + `test/frontend/dca.spec.ts`。
- 不再允许在 Python 与前端各存一份同语义规则。
