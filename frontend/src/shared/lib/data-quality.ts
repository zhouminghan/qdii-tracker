export function qualityStatusLabel(status?: string | null): string {
  return {
    ok: '正常',
    degraded: '降级',
    error: '异常',
  }[status ?? ''] ?? status ?? '未知'
}

export function qualityWarningText(warning: string): string {
  return warning
    .replace(/nasdaq_passive/g, '纳指被动分类')
    .replace(/sp500/g, '标普 500 分类')
    .replace(/global_index/g, '全球指数分类')
    .replace(/global_other/g, '全球其他分类')
}
