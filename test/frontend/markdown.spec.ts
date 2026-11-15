import { describe, expect, it } from 'vitest'
import { parseMarkdown, parseMarkdownInline } from '@/shared/lib/markdown'

describe('safe Markdown rendering model', () => {
  it('parses headings, lists, and safe external links', () => {
    const blocks = parseMarkdown('## 外部资料\n\n- [纳斯达克](https://www.nasdaq.com/)\n- https://example.com')
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 2 })
    expect(blocks[1]).toMatchObject({ type: 'list' })
    expect(blocks[1].type === 'list' && blocks[1].items[0][0]).toMatchObject({
      type: 'link',
      href: 'https://www.nasdaq.com/',
    })
  })

  it('keeps unsafe protocols as text', () => {
    expect(parseMarkdownInline('[危险](javascript:alert(1))')).toEqual([
      { type: 'text', text: '[危险](javascript:alert(1))' },
    ])
  })

  it('renders bold metadata without raw Markdown markers', () => {
    expect(parseMarkdownInline('**记录日期**：2026-11-15')).toEqual([
      { type: 'strong', text: '记录日期' },
      { type: 'text', text: '：2026-11-15' },
    ])
  })
})
