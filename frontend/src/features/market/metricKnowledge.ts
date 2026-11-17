export interface MetricKnowledge {
  id: string
  name: string
  oneLiner: string
  formula?: string
  purpose: string
  interpretation: string[]
  pitfalls: string[]
  source: string
  methodology: string
}

export const MARKET_INDEX_KNOWLEDGE_IDS = [
  'nasdaq-composite',
  'nasdaq-100',
  'sp500',
  'dow-jones',
  'russell-2000',
] as const

export const MARKET_MACRO_KNOWLEDGE_IDS = ['treasury-10y', 'dxy'] as const

export const MARKET_METRIC_KNOWLEDGE: Record<string, MetricKnowledge> = {
  'nasdaq-composite': {
    id: 'nasdaq-composite',
    name: '纳斯达克综合指数',
    oneLiner: '覆盖纳斯达克交易所大多数上市公司的综合指数，不等同于纳斯达克 100。',
    purpose: '观察纳斯达克整体市场的广度、成长股风险偏好和科技行业景气度。',
    interpretation: [
      '成分范围更广，包含大型、中型和小型纳斯达克上市公司。',
      '比纳斯达克 100 更分散，但仍受大型科技公司影响。',
      '适合判断“纳斯达克整体”而非只看最大的 100 家公司。',
    ],
    pitfalls: [
      '不能把纳斯达克综合指数的涨跌直接当成纳斯达克 100 的涨跌。',
      '指数覆盖广不代表风险更低，成长股集中时仍可能大幅回撤。',
    ],
    source: '市场行情使用东方财富 / 腾讯指数报价；历史图谱不使用该指数替代纳斯达克 100。',
    methodology: '本页将它标记为“纳指综合”，与“纳斯达克 100”分开维护数据源和图表。',
  },
  'nasdaq-100': {
    id: 'nasdaq-100',
    name: '纳斯达克 100 指数',
    oneLiner: '由纳斯达克市值最大的约 100 家非金融公司组成，科技和成长风格更集中。',
    purpose: '观察美国大型成长股和科技龙头的整体表现，也是 QQQ 等 ETF 跟踪的常见基准。',
    interpretation: [
      '成分股数量约 100 家，大型科技公司权重通常较高。',
      '与纳斯达克综合指数相比，覆盖面更窄、集中度更高。',
      '指数本身不能直接交易，ETF 会有费率、跟踪误差和折溢价。',
    ],
    pitfalls: [
      '指数收益不等于某只 ETF 的实际收益，二者可能因费率和溢价不同而偏离。',
      '高集中度会放大少数龙头公司的波动。',
    ],
    source: '行情使用东方财富 K 线与腾讯实时报价；历史使用 Yahoo Finance ^NDX，备用新浪 .NDX；PE 使用 Siblis Research 的 NDX TTM 数据。',
    methodology: '主源与备用源都保持 ^NDX / .NDX 身份；当前可用历史区间以实际数据为准，不把综合指数拼接进来。',
  },
  'sp500': {
    id: 'sp500',
    name: '标普 500 指数',
    oneLiner: '覆盖美国约 500 家大型上市公司，行业分布通常比纳斯达克 100 更均衡。',
    purpose: '作为美国大盘股的核心基准，观察美国大型企业的整体盈利和估值环境。',
    interpretation: [
      '行业覆盖较广，包含科技、金融、医疗、消费、工业等。',
      '常被用作主动基金和宽基指数的业绩比较基准。',
      '与纳斯达克 100 相比，科技集中度通常更低。',
    ],
    pitfalls: [
      '标普 500 仍是市值加权指数，大公司对指数影响更大。',
      '指数包含大型公司，不代表覆盖美国全部上市公司。',
    ],
    source: '行情使用东方财富 / 腾讯指数报价；基金产品数据另见 Funds 页面。',
    methodology: '页面中的标普 500 指数与标普 500 基金是两层数据：指数是市场基准，基金还有费率、跟踪误差和限购。',
  },
  'dow-jones': {
    id: 'dow-jones',
    name: '道琼斯工业平均指数',
    oneLiner: '由 30 家美国大型公司组成，采用价格加权而不是市值加权。',
    purpose: '观察美国大型成熟企业的价格表现，具有长期市场象征意义。',
    interpretation: [
      '只有 30 家成分股，覆盖面远小于标普 500。',
      '价格加权意味着高价股对指数影响更大，与市值加权逻辑不同。',
      '适合作为市场情绪参考，不宜单独代表美国股市全貌。',
    ],
    pitfalls: [
      '价格加权会让股价高低影响权重，而不是公司市值。',
      '30 家公司的行业分布有限，不能替代宽基指数。',
    ],
    source: '行情使用东方财富 / 腾讯指数报价。',
    methodology: '本页只展示指数行情，不将其与市值加权指数混为一谈。',
  },
  'russell-2000': {
    id: 'russell-2000',
    name: '罗素 2000 指数',
    oneLiner: '代表美国小盘股，常用于观察小盘股风险偏好和经济周期敏感度。',
    purpose: '作为美国小盘股基准，与大型科技股指数形成风格对照。',
    interpretation: [
      '小盘公司对融资环境、利率和经济周期通常更敏感。',
      '与标普 500、纳斯达克 100 的行业和风险特征不同。',
      '适合作为风格和风险偏好的辅助观察，不是本页当前的核心持仓指数。',
    ],
    pitfalls: [
      '小盘股流动性和盈利稳定性通常弱于大型公司。',
      '本页当前没有单独展示罗素 2000 行情，此条目仅作知识参考。',
    ],
    source: '知识参考条目；当前 Market 页未单独接入罗素 2000 行情。',
    methodology: '未展示的数据不伪造行情。若后续接入，需要新增独立数据源和 K 线身份校验。',
  },
  pe: {
    id: 'pe',
    name: '市盈率 PE',
    oneLiner: '股价相对每股收益的倍数，表示市场愿意为每一元盈利支付多少价格。',
    formula: 'PE = 股价 ÷ 每股收益（EPS）',
    purpose: '比较盈利估值水平，辅助判断市场或公司当前定价处于什么区间。',
    interpretation: [
      'PE 高可能来自高增长预期，也可能来自盈利下滑或估值泡沫。',
      'PE 低可能代表便宜，也可能代表盈利周期见顶或存在风险。',
      '不同行业、不同盈利周期适用不同的估值区间。',
    ],
    pitfalls: [
      '高 PE 不一定高估，低 PE 不一定低估。',
      'PE 受一次性收益、亏损和会计口径影响，不能单独作为买卖信号。',
    ],
    source: '本页当前展示的是纳斯达克 100 TTM PE，来源 Siblis Research。',
    methodology: '页面明确区分 TTM PE、Forward PE 和 CAPE，不把不同口径混成一个“纳指 PE”。',
  },
  'ttm-pe': {
    id: 'ttm-pe',
    name: 'TTM 市盈率',
    oneLiner: '使用过去 12 个月已经发生的盈利计算 PE，反映历史盈利下的估值。',
    formula: 'TTM PE = 当前价格 ÷ 过去 12 个月每股收益',
    purpose: '观察当前价格相对最近一年实际盈利的水平，适合做历史估值对比。',
    interpretation: [
      '使用实际盈利，不依赖未来预测。',
      '盈利周期变化会明显影响 TTM PE。',
      '适合和历史区间比较，不适合单独预测短期涨跌。',
    ],
    pitfalls: [
      '过去 12 个月盈利不代表未来盈利。',
      '指数成分股变化和亏损公司处理方式会影响口径。',
    ],
    source: 'Siblis Research 纳斯达克 100 TTM PE；免费档为月末快照。',
    methodology: '当前页面显示的是 TTM 口径，不是 Forward PE，也不是 CAPE；数据日期按月末统计日展示。',
  },
  'forward-pe': {
    id: 'forward-pe',
    name: 'Forward PE / 预期市盈率',
    oneLiner: '使用未来预期盈利计算 PE，反映市场对下一阶段盈利的定价。',
    formula: 'Forward PE = 当前价格 ÷ 未来 12 个月预期每股收益',
    purpose: '观察市场对未来盈利的预期是否乐观，常用于成长股估值讨论。',
    interpretation: [
      '分母是分析师预测，不是已经实现的盈利。',
      '预期上调或下调会改变 Forward PE。',
      '与 TTM PE 的差异可以反映市场对盈利增长的预期。',
    ],
    pitfalls: [
      '预测可能变化或落空，Forward PE 不是确定值。',
      '不同数据源的覆盖范围和预测口径可能不同。',
    ],
    source: '当前页面未展示 Forward PE；此条目用于解释与 TTM PE 的区别。',
    methodology: '若未来接入 Forward PE，必须单独标注数据源、预测窗口和更新频率，不能与 TTM 混用。',
  },
  cape: {
    id: 'cape',
    name: 'CAPE / 周期调整市盈率',
    oneLiner: '用经过通胀调整的多年平均盈利计算 PE，更适合观察长期估值。',
    formula: 'CAPE = 当前价格 ÷ 经通胀调整的多年平均每股收益',
    purpose: '平滑经济周期对单年盈利的影响，用于长期估值观察。',
    interpretation: [
      '适合十年以上的长期估值比较。',
      '不适合直接作为短期择时信号。',
      '长期均值和利率环境变化都会影响合理区间。',
    ],
    pitfalls: [
      'CAPE 对数据窗口和通胀调整方法敏感。',
      '高 CAPE 可能持续很久，不能单独预测回撤时点。',
    ],
    source: '当前页面未展示 CAPE；此条目用于解释估值口径差异。',
    methodology: '当前 PE 卡片明确为 TTM，不把 CAPE 或 Forward PE 混入同一数字。',
  },
  vix: {
    id: 'vix',
    name: 'VIX 波动率指数',
    oneLiner: '反映市场对未来约 30 天标普 500 波动率的预期，不预测涨跌方向。',
    purpose: '观察市场恐慌或波动预期，辅助判断风险偏好和仓位环境。',
    interpretation: [
      'VIX 上升通常表示市场预期未来波动增大。',
      'VIX 下降表示波动预期回落，但不代表市场一定上涨。',
      '极端高 VIX 常伴随恐慌，极端低 VIX 常伴随自满。',
    ],
    pitfalls: [
      'VIX 不是涨跌方向指标，也不是直接可交易的价格。',
      '低 VIX 不代表没有风险，高 VIX 也不等于马上见底。',
    ],
    source: 'CBOE VIX；本站通过 Yahoo Finance 获取收盘值，失败时回退 FRED VIXCLS。',
    methodology: 'VIX 只用于市场温度和波动状态说明，不把它描述成方向预测或买入信号。',
  },
  'fear-greed': {
    id: 'fear-greed',
    name: 'CNN Fear & Greed Index',
    oneLiner: '用多项市场指标合成的情绪指数，反映恐惧与贪婪的相对状态。',
    purpose: '观察市场情绪温度，辅助理解风险偏好和情绪极端。',
    interpretation: [
      '情绪极度恐惧时，市场可能已经反映较多坏消息，但不代表立刻反转。',
      '情绪极度贪婪时，风险偏好较高，但不代表马上下跌。',
      '情绪指标适合做背景判断，不适合单独择时。',
    ],
    pitfalls: [
      '恐惧不等于买入信号，贪婪也不等于卖出信号。',
      'CNN Fear & Greed 与本项目内部“市场温度”不是同一个指标。',
    ],
    source: 'CNN dataviz 接口；失败时保留旧快照。',
    methodology: '该指数用于情绪面板；本项目市场温度是另一套内部加权评分，两者不互相替代。',
  },
  'market-temperature': {
    id: 'market-temperature',
    name: '市场温度（项目内部指标）',
    oneLiner: '本项目基于四项公开指标构建的 0-100 分内部参考，不是官方指数。',
    formula: '综合分 = 纳指趋势 × 40% + VIX × 20% + 10 年期美债 × 20% + 美元指数 × 20%',
    purpose: '把趋势、波动、利率和美元环境放在一个仪表盘里，帮助形成风险背景。',
    interpretation: [
      '分数越高表示对美股 QDII 持有环境越友好，越低表示越偏防守。',
      '绿灯 71-100、黄灯 40-70、红灯 0-39 是项目内部区间。',
      '任何单项缺失时，页面标记数据降级，不把缺失当成正常中性值。',
    ],
    pitfalls: [
      '它是项目内部评分，不是官方指数，也不是投资建议。',
      '权重和阈值是人为设定，不能保证预测未来。',
      '四项指标更新周期不同，看到分数时要同时看数据日期和降级状态。',
    ],
    source: '纳指 100 趋势、VIX、美国 10 年期国债、美元指数；具体来源见各指标说明。',
    methodology: '权重为纳指趋势 40%、VIX 20%、10 年期美债 20%、DXY 20%；缺失指标会显示降级提示。',
  },
  'treasury-10y': {
    id: 'treasury-10y',
    name: '美国 10 年期国债收益率',
    oneLiner: '美国长期无风险利率的重要参考，影响资金成本和成长股估值折现。',
    purpose: '观察长期利率环境及其对高估值资产、美元和全球资金流向的潜在影响。',
    interpretation: [
      '收益率上升会增加折现率，理论上对高估值成长股形成压力。',
      '收益率下降可能降低折现压力，但不保证股票一定上涨。',
      '还要结合通胀预期、经济增长和期限溢价理解。',
    ],
    pitfalls: [
      '收益率上升不等于股票一定下跌，市场可能同时上调盈利预期。',
      '单看 10 年期不够，2 年和 30 年期可以提供曲线形态信息。',
    ],
    source: '优先美国财政部官方日度收益率曲线；失败回退 FRED DGS10/DGS2/DGS30，再回退东方财富。',
    methodology: '页面展示原始收益率与日期；不把不同期限的收益率混成一个数字。',
  },
  dxy: {
    id: 'dxy',
    name: '美元指数 DXY',
    oneLiner: '衡量美元相对一篮子主要货币的强弱，不是美元兑人民币汇率。',
    purpose: '观察美元强弱对海外资产、汇率换算和全球流动性的潜在影响。',
    interpretation: [
      '美元走强时，非美元投资者的海外资产换算可能承压。',
      '美元走弱时，美元资产的汇兑换算可能受益。',
      'DXY 与 USD/CNY 相关但不同，后者还受人民币自身因素影响。',
    ],
    pitfalls: [
      'DXY 不是 USD/CNY，不能直接用 DXY 代替人民币汇率。',
      'DXY 只反映一篮子货币，不覆盖所有贸易伙伴和双边因素。',
    ],
    source: '东方财富美元指数；当前没有把它替换成其他指数或人民币汇率。',
    methodology: '页面把 DXY 与 FX 条中的 USD/CNY、USD/CNH 分开显示，避免混淆。',
  },
  'xau-usd': {
    id: 'xau-usd',
    name: '伦敦金 XAU/USD',
    oneLiner: '以美元/盎司计价的国际黄金现货参考，和人民币金价不是同一报价。',
    purpose: '观察国际黄金价格，并与上海金和人民币汇率一起理解国内溢价。',
    interpretation: [
      'XAU/USD 上涨表示美元计价黄金走强。',
      '折合国内价 = XAU/USD × USD/CNH ÷ 31.1034768。',
      '国内溢价 = 上海金 Au9999 - 折合国内价；溢价受汇率、供需和交易时间影响。',
    ],
    pitfalls: [
      'XAU/USD 不是上海金，不能用它直接替代国内金价。',
      '折算价依赖 USD/CNH，汇率变化会改变人民币折算结果。',
      '没有独立 XAU 来源时，不能把反推值包装成独立国际黄金报价。',
    ],
    source: '优先新浪财经 hf_XAU 伦敦金现货；上海金使用金投网 Au9999；汇率使用新浪 USD/CNH。',
    methodology: '当前页面优先展示独立 XAU；没有独立来源时才回退上海金反推，并明确标记为折算参考。',
  },
  fx: {
    id: 'fx',
    name: '美元兑人民币与汇率',
    oneLiner: 'USD/CNY 是在岸人民币报价，USD/CNH 是离岸人民币报价，两者相关但不完全相同。',
    purpose: '理解 QDII 人民币份额的汇兑影响，以及黄金折算和跨币种额度。',
    interpretation: [
      '人民币贬值时，同样的美元资产换回人民币通常增加。',
      '人民币升值时，汇兑可能抵消部分美元资产收益。',
      'USD/CNY、USD/CNH、USD/JPY、CNY/HKD 是不同货币对，不能混用。',
    ],
    pitfalls: [
      '不要把美元指数 DXY 当成美元兑人民币汇率。',
      '不同币种份额的限购额度不能直接按数字大小比较。',
    ],
    source: '新浪财经即期外汇报价；本页使用 USD/CNY、USD/CNH、USD/JPY、USD/HKD、CNY/HKD。',
    methodology: '页面按货币对分别展示日期、涨跌和新鲜度；额度排序只在同币种内比较。',
  },
}

export function metricKnowledge(id: string): MetricKnowledge | null {
  return MARKET_METRIC_KNOWLEDGE[id] ?? null
}
