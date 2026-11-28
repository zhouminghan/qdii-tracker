import type { ResearchNote } from '@/types/local'

const noteFiles = import.meta.glob<string>('../../../../notes/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
})

function requiredField(fields: Record<string, string>, key: string): string {
  const value = fields[key]?.trim()
  if (!value) throw new Error(`笔记文件缺少 ${key}`)
  return value
}

export function parseResearchNoteFile(source: string): ResearchNote {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n')
  if (lines[0]?.trim() !== '---') throw new Error('笔记文件缺少 frontmatter')

  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (closing < 0) throw new Error('笔记文件 frontmatter 未闭合')

  const fields: Record<string, string> = {}
  for (const line of lines.slice(1, closing)) {
    if (!line.trim()) continue
    const separator = line.indexOf(':')
    if (separator <= 0) throw new Error(`笔记文件 frontmatter 格式错误：${line}`)
    fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }

  const body = lines.slice(closing + 1).join('\n').trim()
  if (!body) throw new Error('笔记文件正文为空')

  return {
    id: requiredField(fields, 'id'),
    title: requiredField(fields, 'title'),
    fundCode: fields.fundCode?.trim() ?? '',
    tags: (fields.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
    createdAt: requiredField(fields, 'createdAt'),
    updatedAt: requiredField(fields, 'updatedAt'),
    body,
  }
}

export const DEFAULT_RESEARCH_NOTES: ResearchNote[] = Object.values(noteFiles)
  .map(parseResearchNoteFile)
  .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
