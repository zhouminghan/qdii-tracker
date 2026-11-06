// Service Worker：静态资源缓存优先，数据 JSON 网络优先（保证看到最新净值）。
const CACHE = 'qdii-tracker-v2';
const SHELL = [
  './',
  './index.html',
  './css/tailwind.css',
  './css/app.css',
  './js/config.js',
  './js/utils.js',
  './js/main.js',
  './js/render-trend.js',
  './js/render-modal.js',
  './js/screenshot.js',
  './js/market-indices.js',
  './js/market-trend.js',
  './js/etf-premium.js',
  './js/offshore-live-nav.js',
  './js/theme.js',
  './manifest.json',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // 数据 JSON：网络优先，失败回退缓存
  if (url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request)),
    );
    return;
  }

  // 静态资源：缓存优先，后台更新
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
