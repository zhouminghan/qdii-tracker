import { afterEach } from 'vitest'
import 'fake-indexeddb/auto'

afterEach(() => {
  localStorage.clear()
})
