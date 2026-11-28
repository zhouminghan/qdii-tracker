import { describe, expect, it } from 'vitest'
import { DEFAULT_RESEARCH_NOTES, parseResearchNoteFile } from '@/features/research/default-notes'

describe('Markdown research notes', () => {
  it('loads one note per Markdown file with unique ids', () => {
    expect(DEFAULT_RESEARCH_NOTES).toHaveLength(14)
    expect(new Set(DEFAULT_RESEARCH_NOTES.map((note) => note.id)).size).toBe(14)

    const note = DEFAULT_RESEARCH_NOTES.find((item) => item.id === 'dca-us-broad-index-2026-11-21')
    expect(note?.tags).toEqual(['定投', '美股宽基', '长期持有', '市场波动'])
    expect(note?.body).toContain('真正难的从来不是“买什么”，而是“忍住不卖”。')
    expect(note?.body).toContain('![定投美股宽基指数](https://pbs.twimg.com/media/HXoiL7gbMAALzgr?format=jpg&name=large)')
  })

  it('keeps the Nasdaq drawdown note as a standalone Markdown file', () => {
    const note = DEFAULT_RESEARCH_NOTES.find((item) => item.id === 'nasdaq-20-drawdown-recovery-2026-11-21')
    expect(note?.tags).toEqual(['纳指100', '回撤', '回本', '定投', '熊市'])
    expect(note?.body).toContain('跌20%，需要涨25%才能回本')
    expect(note?.body).toContain('2000年最惨，暴跌82.9%，足足等了15年7个月！')
    expect(note?.body).toContain('![纳指回撤与回本时间](https://pbs.twimg.com/media/HXnVneRbwAEYeWs?format=jpg&name=large)')
    expect(note?.body).not.toContain('x.com')
  })

  it('keeps the US stocks note as a standalone Markdown file', () => {
    const note = DEFAULT_RESEARCH_NOTES.find((item) => item.id === 'why-us-stocks-2026-11-22')
    expect(note?.tags).toEqual(['美股', '投资选择'])
    expect(note?.body).toContain('为什么要选择美股，这是我见过最好的答案。')
    expect(note?.body).toContain('看着不舒服，但是道理确实正确的。')
    expect(note?.body).toContain('![为什么要选择美股](https://pbs.twimg.com/media/HXsks22aAAArHQy?format=jpg&name=large)')
    expect(note?.body).not.toContain('x.com')
  })

  it('keeps the fund premium post, images and comment summary in one Markdown file', () => {
    const note = DEFAULT_RESEARCH_NOTES.find((item) => item.id === 'fund-premium-discussion-2026-11-23')
    expect(note?.tags).toEqual(['场内基金', '溢价', '散户', '风险'])
    expect(note?.body).toContain('卧槽尼玛，真特么绝了！溢价46%！！！')
    expect(note?.body).toContain('![场内基金溢价截图 1](https://pbs.twimg.com/media/HXxq8rAaoAAOD68?format=jpg&name=large)')
    expect(note?.body).toContain('![场内基金溢价截图 2](https://pbs.twimg.com/media/HXxftipaUAEPTa3?format=jpg&name=large)')
    expect(note?.body).toContain('## 评论总结')
    expect(note?.body).toContain('溢价从 46% 回到约 40%，仍然很高，风险没有解除。')
    expect(note?.body).not.toContain('## 引用帖子')
    expect(note?.body).not.toContain('\n## 评论\n')
    expect(note?.body).not.toContain('## 主帖')
    expect(note?.body).not.toContain('x.com')
    expect(note?.body).not.toContain('入笔记')
  })

  it('keeps the Nasdaq fee comparison as a standalone Markdown file', () => {
    const note = DEFAULT_RESEARCH_NOTES.find((item) => item.id === 'nasdaq-fee-comparison-2026-11-23')
    expect(note?.fundCode).toBe('006479')
    expect(note?.tags).toEqual(['纳指100', 'QQQM', 'QDII', '费率', '复利'])
    expect(note?.body).toContain('QQQM：0.15%')
    expect(note?.body).toContain('广发纳指C：1.20%')
    expect(note?.body).toContain('两者相差约24.55万元。')
    expect(note?.body).toContain('分红预扣税、换汇点差、出入金成本和 QDII 限购')
    expect(note?.body).not.toContain('蓝天云VPN')
    expect(note?.body).not.toContain('x.com')
  })

  it('keeps the Nasdaq channel comparison as a standalone Markdown file', () => {
    const note = DEFAULT_RESEARCH_NOTES.find((item) => item.id === 'nasdaq-channel-comparison-2026-11-23')
    expect(note?.tags).toEqual(['纳指100', 'QDII', '南向通', '场内ETF', '合规渠道'])
    expect(note?.body).toContain('几万块小定投 👉 走场外 QDII')
    expect(note?.body).toContain('几十万～300万大资金 👉 走南向通（大湾区）')
    expect(note?.body).toContain('顶着 15%～20% 溢价往里冲')
    expect(note?.body).toContain('#纳指100 #QDII')
    expect(note?.body).not.toContain('x.com')
    expect(note?.body).not.toContain('analytics')
  })

  it('keeps the Hong Kong Nasdaq currency note as a standalone Markdown file', () => {
    const note = DEFAULT_RESEARCH_NOTES.find((item) => item.id === 'hk-nasdaq-currency-2026-11-24')
    expect(note?.tags).toEqual(['纳指100', '南向通', '币种', '跨境理财', '汇率'])
    expect(note?.body).toContain('港元 +3.39% ｜ 美元 +2.67% ｜ 人民币 -3.73%')
    expect(note?.body).toContain('基金公司内部换汇')
    expect(note?.body).toContain('选 USD 和选 RMB 到底哪个最终到手更多？')
    expect(note?.body).toContain('![币种对比截图 1](https://pbs.twimg.com/media/HX39pWibAAAAZmM?format=jpg&name=large)')
    expect(note?.body).toContain('![币种对比截图 2](https://pbs.twimg.com/media/HX39p3dawAAgU0O?format=jpg&name=large)')
    expect(note?.body).toContain('![币种对比截图 3](https://pbs.twimg.com/media/HX39qToaYAEEhWV?format=jpg&name=large)')
    expect(note?.body).toContain('作者回复“没错”')
    expect(note?.body).not.toContain('x.com')
  })

  it('keeps the Hong Kong S&P 500 currency note as a standalone Markdown file', () => {
    const note = DEFAULT_RESEARCH_NOTES.find((item) => item.id === 'efunds-hk-sp500-currency-2026-11-25')
    expect(note?.tags).toEqual(['标普500', '易方达香港', '币种', '汇率', '香港基金'])
    expect(note?.body).toContain('港币份额涨 +10.33%、美元涨 +9.40%，人民币份额却只有 +2.71%')
    expect(note?.body).toContain('实际到手是 +2.91% 和 +2.92%')
    expect(note?.body).toContain('底层买的都是同一篮子股票')
    expect(note?.body).toContain('看钱从哪来、回哪去')
    expect(note?.body).toContain('![三种币种份额收益对比](https://pbs.twimg.com/media/HX9hO5kbcAEJO5e?format=jpg&name=large)')
    expect(note?.body).not.toContain('x.com')
    expect(note?.body).not.toContain('analytics')
  })

  it('keeps the dividend ETF comparison as a standalone Markdown file', () => {
    const note = DEFAULT_RESEARCH_NOTES.find((item) => item.id === 'dividend-etf-comparison-2026-11-26')
    expect(note?.fundCode).toBe('510880 / 512890 / 515450')
    expect(note?.tags).toEqual(['红利ETF', '510880', '512890', '515450', '高股息'])
    expect(note?.body).toContain('华泰红利ETF（510880）')
    expect(note?.body).toContain('华泰红利低波ETF（512890）')
    expect(note?.body).toContain('南方标普红利低波50ETF（515450）')
    expect(note?.body).toContain('近5年年化 11.19% ｜ 近1年回撤 -10.36%')
    expect(note?.body).toContain('高股息不等于低风险')
    expect(note?.body).toContain('![三只红利ETF对比](https://pbs.twimg.com/media/HX_0zXyboAA2Vds?format=jpg&name=large)')
    expect(note?.body).not.toContain('x.com')
    expect(note?.body).not.toContain('analytics')
  })

  it('keeps the overseas income and CRS note as a standalone Markdown file', () => {
    const note = DEFAULT_RESEARCH_NOTES.find((item) => item.id === 'overseas-income-crs-2026-11-26')
    expect(note?.tags).toEqual(['美股', 'CRS', '境外所得', '税务', '港卡'])
    expect(note?.body).toContain('没有 CRS 交换，不等于不知道。')
    expect(note?.body).toContain('## 一、美股：香港券商、美国券商、交易所，差在哪')
    expect(note?.body).toContain('## 三、几个流传最广的误解')
    expect(note?.body).toContain('以上是我 2026 年 10 月 25 号整理的')
    expect(note?.body.match(/https:\/\/pbs\.twimg\.com\/media\//g)).toHaveLength(7)
    expect(note?.body).not.toContain('x.com')
    expect(note?.body).not.toContain('analytics')
  })

  it('keeps the USD deposit and FX quota note as a standalone Markdown file', () => {
    const note = DEFAULT_RESEARCH_NOTES.find((item) => item.id === 'usd-deposit-and-fx-quota-2026-11-27')
    expect(note?.tags).toEqual(['美元理财', '换汇', '5万美元额度', '银行理财', '汇率'])
    expect(note?.body).toContain('2026年度5万美元便利换汇额度即将清零')
    expect(note?.body).toContain('年化在3.2%左右')
    expect(note?.body).toContain('它是非保本，也不保证收益的')
    expect(note?.body).toContain('（我不具备金融执业资格，非投资建议）')
    expect(note?.body).toContain('## 补充')
    expect(note?.body.match(/https:\/\/pbs\.twimg\.com\/media\//g)).toHaveLength(4)
    expect(note?.body).not.toContain('x.com')
  })

  it('parses frontmatter and keeps the Markdown body intact', () => {
    const note = parseResearchNoteFile(`---
id: sample
title: 示例笔记
fundCode: 270042
tags: 纳指, 限购
createdAt: 2026-11-21T00:00:00+08:00
updatedAt: 2026-11-21T01:00:00+08:00
---

# 示例

正文`)

    expect(note).toEqual({
      id: 'sample',
      title: '示例笔记',
      fundCode: '270042',
      tags: ['纳指', '限购'],
      createdAt: '2026-11-21T00:00:00+08:00',
      updatedAt: '2026-11-21T01:00:00+08:00',
      body: '# 示例\n\n正文',
    })
  })

  it('rejects notes without required frontmatter fields', () => {
    expect(() => parseResearchNoteFile(`---
id: sample
---

正文`)).toThrow('title')
  })
})
