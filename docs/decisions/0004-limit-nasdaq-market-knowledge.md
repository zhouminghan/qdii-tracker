# ADR 0004：基金限购治理、纳指口径与 Market 知识层

> 日期：2026-11-17  
> 范围：Funds 每日限购、Nasdaq-100 历史/PE/市场温度、Market 指标知识抽屉

## 背景

本轮需要同时解决三个容易混淆的业务问题：

1. 基金的 A/C 份额可能共享额度，也可能各自拥有额度。仅凭同系列、同名或金额相同
   不能确认共享关系。
2. 页面历史图谱曾经存在“标题写纳斯达克 100、实际抓取纳斯达克综合指数”的身份风险。
3. Market 页面的 VIX、TTM PE、DXY、内部市场温度等指标缺少与真实口径绑定的解释。

## 决策

### 基金限购

- 保留 `daily_limit` 原始数值；新增独立治理字段 `limit_scope`、`limit_group_id`、
  `limit_currency`、来源、生效日、核验日与置信度。
- 人工核验记录放在 `config/limit-scopes.json`，`public_catalog.py` 只消费记录，
  不从名称/代码/金额自动推断共同额度。
- 核验记录支持 `limit_expires_at`；过期或因新公告被替代时降级为
  `limit_scope=unknown`、`limit_status=expired`，保留原始证据并等待复核。
- 新增 `limit_notices.py`：扫描东方财富/天天基金公开公告列表，优先读取公告正文 API，
  缺失时回退公开 PDF；只有正文明确出现“多份额合计”或“合并计算”才写入共用额度组。
- 公告扫出的 `limit_channels` 进入 catalog；人工核验配置优先于自动结果。当前首批确认
  5 组：银华海外数字经济、华夏海外聚享人民币/美元两组、华泰柏瑞纳斯达克100ETF联接、
  华泰柏瑞中韩半导体ETF联接。明确写“不同份额单独计算”的公告会被排除。
- 没有核验记录的多份额系列标记 `unknown`；单份额且有有效额度的系列标记 `share`。
- 恢复老版单列“申购”：徽标直接显示“限 ¥金额”，悬浮提示补充共用份额；点击“申购”即按每日限购排序。收藏始终置顶；金额只与同币种比较；缺失、暂停和开放置底。
- 系列父行明确使用默认份额口径；详情份额表逐份额展示。共享额度只展示一次含义，
  不做 A 类金额 + C 类金额求和。

### 纳指身份与统计

- 历史图谱固定为 Nasdaq-100：Yahoo `^NDX`，备用新浪 `.NDX`。不使用 `^IXIC`
  或 `.IXIC` 替换，也不拼接两个指数。
- 当前年份标记 YTD；当前月份标记“进行中”。季节性排行仅使用完整自然月。
- 排行保留 5 年、10 年、20 年，另保留 2001 年至今全长口径。页面展示均值、上涨比例
  和真实样本数；样本少于 3 时标“样本不足”。
- 年内最大回撤优先使用日线收盘；某年没有日线时回退月线并在 `max_drawdown_basis`
  明确标记。当前口径不是盘中回撤。
- 新抓取数据的 `as_of` 早于旧快照时拒绝覆盖，保留最后一次有效数据。

### PE 与市场温度

- 当前 PE 固定标注为“纳斯达克 100 TTM PE”，来源 Siblis Research，免费档为月末
  快照；`date` 是统计日，不拿 `generated_at` 冒充。
- Forward PE 和 CAPE 只作为知识说明，不进入当前 PE 数字或 DCA 计算。
- 市场温度继续使用纳指 100 相对 200 日均线 40%、VIX 20%、10 年期美债 20%、
  DXY 20% 的现有业务权重。缺失数据时输出 `coverage.degraded`，页面显示降级；
  不修改没有充分依据的阈值。

### Market 知识层

- 统一配置位于 `frontend/src/features/market/metricKnowledge.ts`。
- 每个条目包含名称、一句话解释、公式（适用时）、用途、解读、误区、实际来源和
  项目口径。详情使用可折叠的 `details` 和统一抽屉，支持 Escape、焦点圈闭以及
  Light/Dark 主题。
- 指数、VIX、Fear & Greed、内部市场温度、PE 三口径、美债、DXY、XAU/USD 和
  汇率均可从 Market 页面打开说明。

## 未完成与风险

- 当前没有可验证的基金公司公告证据，因此没有把任何 A/C 份额自动标成
  `series_shared`。现有数据中的多份额限购仍为 `unknown`，等待人工核验。
- Siblis 免费快照可能滞后；页面按月度新鲜度阈值显示“月度/延迟/陈旧”，不把它包装成实时 PE。
- Russell 2000 当前只有知识条目，Market 页没有独立行情；说明中已明确这一边界。

## 验证

- Python：`test/test_nasdaq_history.py`、`test/test_ndx_pe.py`、
  `test/test_public_catalog.py`、`test/test_market_temperature.py`。
- Frontend：`test/frontend/funds.spec.ts`、`test/frontend/metric-knowledge.spec.ts`。
- Chromium：Funds 限购排序、Market 知识抽屉、YTD/样本/日线回撤、axe、桌面与移动视口。
