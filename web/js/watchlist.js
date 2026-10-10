/**
 * watchlist.js — 自选关注
 *
 * 收藏状态存 localStorage：qdii-favs 存用户手动添加项，qdii-favs-hidden 存
 * 用户取消掉的默认项。默认 4 只始终点亮，除非用户手动取消。
 * 对外暴露 getFavs / isFav / toggleFav，供 main.js 渲染星标与置顶排序。
 */
(function () {
  const KEY = 'qdii-favs';
  const HIDDEN_KEY = 'qdii-favs-hidden';
  // 默认自选（default_share_code）：场外 博时标普500ETF联接 / 国泰纳斯达克100指数，
  // 场内 标普500ETF博时 / 纳指ETF国泰。默认始终点亮，用户取消后记入 hidden 不再重置。
  const DEFAULT_FAVS = ['050025', '160213', '513500', '513100'];

  function readList(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(v) ? v.map(String) : [];
    } catch (_) {
      return [];
    }
  }

  function writeList(key, list) {
    try { localStorage.setItem(key, JSON.stringify(list)); } catch (_) {}
  }

  function getFavs() {
    const explicit = readList(KEY);
    const hidden = readList(HIDDEN_KEY);
    const merged = new Set(explicit);
    for (const code of DEFAULT_FAVS) {
      if (!hidden.includes(code)) merged.add(code);
    }
    return Array.from(merged);
  }

  function isFav(code) {
    return getFavs().includes(String(code));
  }

  function toggleFav(code) {
    code = String(code);
    if (DEFAULT_FAVS.includes(code)) {
      const hidden = readList(HIDDEN_KEY);
      const idx = hidden.indexOf(code);
      if (idx >= 0) hidden.splice(idx, 1);
      else hidden.push(code);
      writeList(HIDDEN_KEY, hidden);
    } else {
      const explicit = readList(KEY);
      const idx = explicit.indexOf(code);
      if (idx >= 0) explicit.splice(idx, 1);
      else explicit.push(code);
      writeList(KEY, explicit);
    }
    if (typeof window.renderCategory === 'function') {
      window.renderCategory('offshore');
      window.renderCategory('etf');
    }
  }

  window.getFavs = getFavs;
  window.isFav = isFav;
  window.toggleFav = toggleFav;
})();
