export interface MarkdownToken {
  type: 'text' | 'link' | 'strong'
  text: string
  href?: string
}

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; tokens: MarkdownToken[] }
  | { type: 'paragraph'; tokens: MarkdownToken[] }
  | { type: 'list'; items: MarkdownToken[][] }

function safeHref(value: string): string | null {
  try {
    const url = new URL(value)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export function parseMarkdownInline(value: string): MarkdownToken[] {
  const tokens: MarkdownToken[] = []
  const pattern = /\[([^\]]+)\]\(((?:https?|mailto):[^)\s]+)\)|(https?:\/\/[^\s<]+)|(\*\*[^*]+\*\*)/g
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > cursor) tokens.push({ type: 'text', text: value.slice(cursor, index) })
    if (match[4]) {
      tokens.push({ type: 'strong', text: match[4].slice(2, -2) })
    } else {
      const label = match[1] ?? match[3] ?? ''
      const href = safeHref(match[2] ?? match[3] ?? '')
      if (href) tokens.push({ type: 'link', text: label, href })
      else tokens.push({ type: 'text', text: match[0] })
    }
    cursor = index + match[0].length
  }
  if (cursor < value.length) tokens.push({ type: 'text', text: value.slice(cursor) })
  return tokens.length ? tokens : [{ type: 'text', text: value }]
}

export function parseMarkdown(value: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const paragraph: string[] = []
  const list: string[] = []

  function flushParagraph(): void {
    if (!paragraph.length) return
    blocks.push({ type: 'paragraph', tokens: parseMarkdownInline(paragraph.join(' ')) })
    paragraph.length = 0
  }

  function flushList(): void {
    if (!list.length) return
    blocks.push({ type: 'list', items: list.map(parseMarkdownInline) })
    list.length = 0
  }

  for (const rawLine of value.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trimEnd()
    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        tokens: parseMarkdownInline(heading[2]),
      })
      continue
    }
    const listItem = line.match(/^\s*[-*]\s+(.+)$/)
    if (listItem) {
      flushParagraph()
      list.push(listItem[1])
      continue
    }
    flushList()
    paragraph.push(line)
  }
  flushParagraph()
  flushList()
  return blocks
}
