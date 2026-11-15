import { describe, expect, it } from 'vitest'
import { performanceDisplay } from '@/shared/lib/performance'

describe('performance display', () => {
  it('shows values, immature periods, and closed status explicitly', () => {
    expect(performanceDisplay(12.34, 'chg_1y', { established: '2020-01-01', buy_status: '开放申购' })).toBe('+12.34%')
    expect(performanceDisplay(null, 'chg_2y', { established: '2025-06-01', buy_status: '限大额' })).toBe('不足2年')
    expect(performanceDisplay(null, 'chg_3y', { established: '2020-01-01', buy_status: '封闭期' })).toBe('封闭期')
    expect(performanceDisplay(null, 'chg_3y', { established: '2020-01-01', buy_status: '开放申购' })).toBe('数据不足')
  })
})
