export interface KnowledgeArticle {
  id: string
  category: string
  title: string
  summary: string
  points: string[]
}

export const KNOWLEDGE_CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'structure', label: '场内与场外' },
  { key: 'share', label: '份额结构' },
  { key: 'premium', label: '溢价与套利' },
  { key: 'selection', label: '选基方法' },
  { key: 'risk', label: '额度与汇率' },
]

export const KNOWLEDGE_ARTICLES: KnowledgeArticle[] = [
  {
    id: 'onshore-offshore',
    category: 'structure',
    title: '场内 ETF 与场外基金',
    summary: '底层指数可以相同，交易方式、定价时点、费用和流动性不同。',
    points: [
      '场外按当日收盘净值成交，适合定投；QDII 赎回到账通常更慢。',
      '场内 ETF 盘中按市场价成交，流动性好，但可能显著偏离净值。',
      'ETF 联接基金是场外通道，主要资产投向对应 ETF，通常没有场内溢价风险。',
    ],
  },
  {
    id: 'share-classes',
    category: 'share',
    title: 'A、C 与互联网份额',
    summary: '同一基金的份额持有相同底层资产，差别主要在费率结构和销售渠道。',
    points: [
      'A 类通常收申购费，持有期越长越可能免赎回费，适合长期持有。',
      'C 类通常免申购费但按日计销售服务费，更适合短周期。',
      '比较份额时要把申购费、销售服务费、赎回费和实际持有期一起计算。',
    ],
  },
  {
    id: 'lof-transfer',
    category: 'premium',
    title: 'LOF 跨系统转托管',
    summary: '只有具备 LOF 上市安排的份额才可能从场外转场内，并不是所有 QDII 都能搬。',
    points: [
      '先确认基金名称、份额类别和销售机构均支持跨系统转托管。',
      '溢价空间需要扣除申购费、转托管费、佣金、时间和流动性成本。',
      '转托管期间价格与溢价可能变化，账面价差不是锁定收益。',
    ],
  },
  {
    id: 'premium-risk',
    category: 'premium',
    title: 'ETF 高溢价从哪里来',
    summary: '申购受限、额度紧张和套利通道受阻时，场内价格可能长期高于净值。',
    points: [
      '溢价率等于场内价格相对净值的偏离，不代表资产本身多赚了钱。',
      '高溢价买入后即使指数不跌，溢价回归也可能造成亏损。',
      '净值和场内价格有不同的披露时点，跨市场节假日会放大表面偏离。',
    ],
  },
  {
    id: 'selection',
    category: 'selection',
    title: 'QDII 选基的三层检查',
    summary: '先确认指数或策略，再比较跟踪质量、费率和可申购性。',
    points: [
      '同类指数基金先看跟踪误差、规模和流动性，再看费率。',
      '主动基金需要检查实际持仓是否与名称、投资目标和风险描述一致。',
      '长期限购会迫使基金保留现金，可能造成跟踪偏离。',
    ],
  },
  {
    id: 'quota',
    category: 'risk',
    title: 'QDII 额度与限购',
    summary: '外汇额度限制会影响申购状态，限购不等同于基金质量变化。',
    points: [
      '开放、限大额、暂停申购要结合每日限额和持续时间观察。',
      '额度紧张可能推高场内 ETF 溢价。',
      '把申购状态作为流动性和可执行性信息，而不是单独的买卖信号。',
    ],
  },
  {
    id: 'currency',
    category: 'risk',
    title: '汇率如何进入 QDII 净值',
    summary: '人民币份额通常已经包含汇率折算，不需要再手动叠加一次。',
    points: [
      '人民币份额的净值变化约等于底层资产变化加汇率变化。',
      '美元份额以美元计价，最终换回人民币时才体现汇率影响。',
      '跨市场交易时段不同，看到的基金净值天然存在一天或更长滞后。',
    ],
  },
  {
    id: 'index-choice',
    category: 'selection',
    title: '纳指、标普与行业指数',
    summary: '宽基和行业指数的集中度、波动与回撤特征不同，应按组合角色选择。',
    points: [
      '标普 500 行业更均衡，通常作为美股核心仓位。',
      '纳指 100 科技权重高，成长性和波动都更明显。',
      '半导体等单一行业适合作为卫星仓位，需要接受更深的周期回撤。',
    ],
  },
]
