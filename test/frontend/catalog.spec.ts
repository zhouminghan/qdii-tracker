import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CatalogEnvelope } from '@/types/data'

describe('public catalog contract', () => {
  const catalog = JSON.parse(
    readFileSync('web/data/catalog.json', 'utf8'),
  ) as CatalogEnvelope

  it('contains the required envelope fields', () => {
    expect(catalog.schema_version).toBe(1)
    expect(catalog.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(catalog.source).toContain('web/data/')
    expect(['ok', 'degraded', 'error']).toContain(catalog.status)
    expect(catalog.quality.warnings).toBeInstanceOf(Array)
    expect(catalog.quality.errors).toBeInstanceOf(Array)
  })

  it('contains all six categories and valid default shares', () => {
    const categories = Object.keys(catalog.data.categories)
    expect(categories).toHaveLength(6)
    for (const category of Object.values(catalog.data.categories)) {
      for (const series of category.series) {
        expect(series.shares.some((share) => share.code === series.default_share_code)).toBe(true)
      }
    }
  })

  it('reports counts that agree with the actual series', () => {
    const actual = Object.values(catalog.data.categories)
      .reduce((sum, category) => sum + category.series.length, 0)
    expect(catalog.data.summary.series_count).toBe(actual)
  })
})
