import type { ResearchNote } from '@/types/local'

export const DEFAULT_RESEARCH_NOTES: ResearchNote[] = [
  {
    id: 'southbound-2026-11-15-83004',
    title: '跨境理财通南向通：标普500、纳指100与日经225渠道记录',
    fundCode: '83004',
    tags: ['南向通', '香港银行', '标普500', '纳斯达克100', '日经225', '建行亚洲', '83004'],
    createdAt: '2026-11-15T15:30:00+08:00',
    updatedAt: '2026-11-15T20:00:00+08:00',
    body: `# 跨境理财通南向通记录

- **记录日期**：2026-11-15
- **购买渠道**：香港众安银行 ZA Bank、招商永隆银行、中国建设银行（亚洲）
- **标普500美元渠道码**：83004（需在银行 APP 当日核验）
- **额度**：符合资格的个人最高 300 万元；同时使用银行和券商渠道时，银行、券商各 150 万元
- **核验日期**：2026-11-15

![南向通渠道资料截图](https://images.weserv.nl/?url=pbs.twimg.com/media/HXJIJHnaIAAkxNN%3Fformat%3Djpg%26name%3Dlarge)

## 官方核验结果

易方达香港官方产品页确认以下份额；建行亚洲公开筛选器确认对应银行渠道码。

### 标普500

- HKD：EHSPAHK HK / HK0001050324
- RMB：EHSPAAR HK / HK0001050266
- USD：EHSPACU HK / HK0001050308 / 渠道码 83004（渠道待核验）
- 近一年收益（2026-10-31）：HKD +11.8%、RMB +3.5%、USD +10.6%

### 纳斯达克100

- HKD：EFHNAAH HK / HK0001027009 / 建行亚洲 EF13
- RMB：EFHNAAR HK / HK0001026944 / 建行亚洲 EF14
- USD：EFHNAAU HK / HK0001026985 / 建行亚洲 EF12
- 近一年收益（2026-09-30）：HKD +22.4%、RMB +14.2%、USD +21.3%

### 日经225

- HKD：EIONIAH HK / HK0001027348 / 建行亚洲 EF25
- JPY：EHKNKAJ HK / HK0001027389 / 建行亚洲 EF23
- RMB：EHKNARM HK / HK0001027264 / 建行亚洲 EF26
- USD：EIFNIAA HK / HK0001027306 / 建行亚洲 EF24
- 近一年收益（2026-10-31）：HKD +19.5%、RMB +10.5%、USD +18.3%

### 恒生标普500指数ETF非上市类别

- HKD：建行亚洲 HM01
- RMB 对冲：建行亚洲 HM02
- USD：建行亚洲 HM03
- 非上市类别无公开 ISIN，买入卖出按基金未知价成交

## 其他南向通基金

- 建行亚洲公开筛选器的“理财通合资格基金”共 344 个份额。
- 仅易方达香港就有 21 个合资格份额，包括指数、债券和货币市场基金。
- 南向通名单按销售银行动态变化，不存在单一固定全市场清单。
- [查看建行亚洲完整合资格名单](https://online.asia.ccb.com/PersonalHKWeb/pubmutualfund/webForm/PMF_FundSearchController.jpf?lang=chinese&linkFrom=pubmutualfund)

## 核心优势

- 监管认可的跨境投资渠道。
- 不需要参与内地 QDII 每日申购额度抢购。
- 不承担场内 ETF 的二级市场高溢价风险。
- 支持人民币闭环跨境汇款。

## 来源

- [易方达香港标普500官方页](https://www.efunds.com.hk/products/40/info/)
- [易方达香港纳斯达克100官方页](https://www.efunds.com.hk/products/38/info/)
- [易方达香港日经225官方页](https://www.efunds.com.hk/products/39/info/)
- [建行亚洲南向通基金筛选器](https://online.asia.ccb.com/PersonalHKWeb/pubmutualfund/webForm/PMF_FundSearchController.jpf?lang=chinese&linkFrom=pubmutualfund)

## 使用前必须核对

- 仅限符合南向通资格的投资者。
- 产品是否在银行 APP 当天的可购买名单内。
- 申购费、管理费、托管费、平台费和赎回安排。
- 美元份额的汇率成本、换汇时间和人民币闭环汇划成本。
- 300 万元是个人总额度，不代表必须一次性使用。

## 风险与边界

- 近一年收益不代表未来收益。
- 海外指数仍会经历市场回撤、汇率波动和交易时差。
- 银行展示的产品名称、代码和额度可能随渠道调整，以 APP 实际页面为准。
- 本文是渠道研究记录，不构成投资建议。

## 待核验

- [ ] 在 ZA Bank 与招商永隆 APP 核对 83004 的当前可购状态。
- [ ] 记录实际申购费、管理费和汇率点差。
- [ ] 核对恒生标普500非上市类别的最新销售文件与交易日安排。
- [ ] 对比内地 QDII、场内 ETF 和南向通三种渠道的综合成本。`,
  },
]
