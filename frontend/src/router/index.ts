import { createRouter, createWebHashHistory } from 'vue-router'
import { nextTick } from 'vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/funds' },
    {
      path: '/market',
      name: 'market',
      component: () => import('@/pages/MarketPage.vue'),
      meta: { title: 'Market' },
    },
    {
      path: '/funds',
      name: 'funds',
      component: () => import('@/pages/FundsPage.vue'),
      meta: { title: 'Funds' },
    },
    {
      path: '/portfolio',
      name: 'portfolio',
      component: () => import('@/pages/PortfolioPage.vue'),
      meta: { title: 'Portfolio' },
    },
    {
      path: '/research',
      name: 'research',
      component: () => import('@/pages/ResearchPage.vue'),
      meta: { title: 'Research' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/funds' },
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, top: 76, behavior: 'smooth' }
    return { top: 0 }
  },
})

router.afterEach(async (to, from) => {
  document.title = to.meta.title ? `${String(to.meta.title)} · QDII Tracker` : 'QDII Tracker'
  if (!from.name) return
  await nextTick()
  document.getElementById('main-content')?.focus({ preventScroll: true })
})

export default router
