// ============================================================================
// save-image.js — 长图分享辅助：把 DOM 节点导出为 PNG
// ============================================================================
// 复用 html-to-image（与 screenshot.js 同一实现），懒加载 CDN 脚本。
// ============================================================================

let _htmlToImage = null;

function loadHtmlToImage() {
  if (_htmlToImage) return Promise.resolve(_htmlToImage);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js';
    s.onload = () => { _htmlToImage = window.htmlToImage; resolve(_htmlToImage); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function fallbackBackground(node) {
  const bg = getComputedStyle(node).backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
  return document.documentElement.classList.contains('dark') ? '#1C1A27' : '#f8fafc';
}

export async function saveNodeAsPng(node, filename, backgroundColor) {
  if (!node) return;
  const hti = await loadHtmlToImage();
  const dataUrl = await hti.toPng(node, {
    pixelRatio: 2,
    backgroundColor: backgroundColor || fallbackBackground(node),
    cacheBust: true,
  });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function previewAndDownload(node, filename) {
  if (!node) return;
  const hti = await loadHtmlToImage();
  const dataUrl = await hti.toPng(node, {
    pixelRatio: 2,
    backgroundColor: fallbackBackground(node),
    cacheBust: true,
  });
  const modal = document.getElementById('chart-poster-modal');
  const img = document.getElementById('chart-poster-img');
  const btn = document.getElementById('chart-poster-download');
  if (!modal || !img) return;
  img.src = dataUrl;
  modal.classList.remove('hidden');
  if (btn) {
    btn.onclick = () => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
  }
}

export function closeChartPoster() {
  const modal = document.getElementById('chart-poster-modal');
  if (modal) modal.classList.add('hidden');
}

export function pngFilename(prefix) {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}-${mm}-${dd}.png`;
}

window.closeChartPoster = closeChartPoster;
