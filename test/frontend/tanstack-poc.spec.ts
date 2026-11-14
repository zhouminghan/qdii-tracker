import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import {
  createSortedRowModel,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
  useTable,
} from '@tanstack/vue-table'

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { basic: sortFn_basic },
})

describe('TanStack Table PoC', () => {
  it('sorts a large fund-like dataset with missing values last', () => {
    const data = Array.from({ length: 500 }, (_, index) => ({
      id: `fund-${index}`,
      scale: index % 11 === 0 ? null : index,
    }))
    const Demo = defineComponent({
      setup() {
        const table = useTable({
          features,
          data,
          columns: [{ id: 'scale', accessorKey: 'scale' }],
          state: {
            sorting: [{ id: 'scale', desc: true }],
          },
        })
        return () => h('ol', table.getRowModel().rows.map((row) =>
          h('li', { 'data-id': row.original.id }, String(row.original.scale)),
        ))
      },
    })
    const wrapper = mount(Demo)
    const values = wrapper.findAll('li').slice(0, 3).map((item) => Number(item.text()))
    expect(values).toEqual([499, 498, 497])
    expect(wrapper.findAll('li')).toHaveLength(500)
  })
})
