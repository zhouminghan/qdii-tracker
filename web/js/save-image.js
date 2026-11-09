// ============================================================================
// save-image.js — 长图分享辅助：把 DOM 节点导出为 PNG
// ============================================================================
// 复用 html-to-image（与 screenshot.js 同一实现），懒加载 CDN 脚本。
// CDN 失败会重置加载 Promise，让下一次点击可以重试；错误统一带可读文案。
// ============================================================================

const HTML_TO_IMAGE_URL = 'https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js';
const LOAD_ERROR = '图片生成组件加载失败，请检查网络后重试。';
const RENDER_ERROR = '图片生成失败，请重试。';
const PREVIEW_ERROR = '图片预览失败，请刷新页面后重试。';

let _htmlToImagePromise = null;
let _posterState = null;
let _posterScale = 'original';
let _posterBodyOverflow = '';
let _posterBodyLocked = false;
let _posterKeydown = null;
let _posterBackdropClick = null;
let _saveImageToast = null;

class SaveImageError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SaveImageError';
    this.userMessage = message;
    if (cause !== undefined) this.cause = cause;
  }
}

function toSaveImageError(err, fallback) {
  if (err instanceof SaveImageError) return err;
  return new SaveImageError(fallback, err);
}

export function saveImageErrorMessage(err) {
  return err?.userMessage || err?.message || RENDER_ERROR;
}

export function loadHtmlToImage() {
  const existing = window.htmlToImage;
  if (existing && typeof existing.toPng === 'function') {
    _htmlToImagePromise = Promise.resolve(existing);
    return _htmlToImagePromise;
  }
  if (_htmlToImagePromise) return _htmlToImagePromise;
  _htmlToImagePromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = HTML_TO_IMAGE_URL;
    s.async = true;
    const fail = () => {
      _htmlToImagePromise = null;
      s.remove();
      reject(new SaveImageError(LOAD_ERROR));
    };
    s.onload = () => {
      const lib = window.htmlToImage;
      if (!lib || typeof lib.toPng !== 'function') {
        fail();
        return;
      }
      resolve(lib);
    };
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return _htmlToImagePromise;
}

function fallbackBackground(node) {
  const bg = getComputedStyle(node).backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
  return document.documentElement.classList.contains('dark') ? '#1C1A27' : '#f8fafc';
}

async function renderNodeToPng(node, backgroundColor) {
  const hti = await loadHtmlToImage();
  try {
    const dataUrl = await hti.toPng(node, {
      pixelRatio: 2,
      backgroundColor: backgroundColor || fallbackBackground(node),
      cacheBust: true,
    });
    if (!dataUrl || !dataUrl.startsWith('data:image')) throw new Error('empty PNG data URL');
    return dataUrl;
  } catch (err) {
    throw toSaveImageError(err, RENDER_ERROR);
  }
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename || pngFilename('qdii-chart');
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function showSaveImageToast(message) {
  if (!document.body) return;
  if (_saveImageToast) _saveImageToast.remove();
  const toast = document.createElement('div');
  toast.className = 'save-image-toast';
  toast.setAttribute('role', 'alert');
  const text = document.createElement('span');
  text.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'save-image-toast-close';
  close.textContent = '×';
  close.setAttribute('aria-label', '关闭错误提示');
  close.addEventListener('click', () => {
    if (_saveImageToast === toast) _saveImageToast = null;
    toast.remove();
  });
  toast.append(text, close);
  document.body.appendChild(toast);
  _saveImageToast = toast;
  setTimeout(() => {
    if (_saveImageToast === toast) _saveImageToast = null;
    toast.remove();
  }, 8000);
}

function reportSaveImageError(error, options = {}) {
  console.error('save image error:', error.cause || error);
  if (typeof options.onError === 'function') {
    try {
      options.onError(error);
      return;
    } catch (callbackError) {
      console.error('save image error handler failed:', callbackError);
    }
  }
  showSaveImageToast(`${saveImageErrorMessage(error)} 可再次点击保存按钮重试。`);
}

export async function saveNodeAsPng(node, filename, backgroundColor, options = {}) {
  if (!node) return false;
  try {
    const dataUrl = await renderNodeToPng(node, backgroundColor);
    downloadDataUrl(dataUrl, filename);
    return true;
  } catch (err) {
    reportSaveImageError(toSaveImageError(err, RENDER_ERROR), options);
    return false;
  }
}

function posterElements() {
  return {
    modal: document.getElementById('chart-poster-modal'),
    img: document.getElementById('chart-poster-img'),
    preview: document.getElementById('chart-poster-preview'),
    title: document.getElementById('chart-poster-title'),
    note: document.getElementById('chart-poster-scale-note'),
    fit: document.getElementById('chart-poster-fit'),
    original: document.getElementById('chart-poster-original'),
    close: document.getElementById('chart-poster-close'),
    download: document.getElementById('chart-poster-download'),
  };
}

function updatePosterScaleNote() {
  const { img, note } = posterElements();
  if (!note) return;
  const w = img?.naturalWidth || 0;
  const h = img?.naturalHeight || 0;
  const size = w && h ? `（原图 ${w} × ${h} px）` : '';
  note.textContent = _posterScale === 'fit'
    ? `适应宽度${size} · 可纵向滚动`
    : `原图 1:1${size} · 可横向/纵向滚动`;
}

function setPosterScale(mode) {
  _posterScale = mode === 'fit' ? 'fit' : 'original';
  const parts = posterElements();
  const isFit = _posterScale === 'fit';
  parts.preview?.classList.toggle('is-fit', isFit);
  parts.fit?.classList.toggle('active', isFit);
  parts.original?.classList.toggle('active', !isFit);
  parts.fit?.setAttribute('aria-pressed', String(isFit));
  parts.original?.setAttribute('aria-pressed', String(!isFit));
  if (parts.preview) {
    parts.preview.scrollTop = 0;
    parts.preview.scrollLeft = 0;
  }
  updatePosterScaleNote();
}

function lockBodyOverflow() {
  if (_posterBodyLocked) return;
  _posterBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  _posterBodyLocked = true;
}

function restoreBodyOverflow() {
  if (!_posterBodyLocked) return;
  document.body.style.overflow = _posterBodyOverflow;
  _posterBodyOverflow = '';
  _posterBodyLocked = false;
}

function unbindPosterDismiss() {
  const modal = document.getElementById('chart-poster-modal');
  if (_posterKeydown) document.removeEventListener('keydown', _posterKeydown, true);
  if (_posterBackdropClick && modal) modal.removeEventListener('click', _posterBackdropClick);
  _posterKeydown = null;
  _posterBackdropClick = null;
}

function bindPosterDismiss(modal) {
  unbindPosterDismiss();
  _posterKeydown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeChartPoster();
  };
  _posterBackdropClick = (event) => {
    if (event.target === modal) closeChartPoster();
  };
  document.addEventListener('keydown', _posterKeydown, true);
  modal.addEventListener('click', _posterBackdropClick);
}

function releasePosterState() {
  const state = _posterState;
  _posterState = null;
  unbindPosterDismiss();
  restoreBodyOverflow();
  if (!state) return;
  if (typeof state.restoreTrigger === 'function') {
    try {
      state.restoreTrigger();
    } catch (err) {
      console.error('poster trigger restore failed:', err);
    }
  } else if (state.triggerButton) {
    state.triggerButton.disabled = Boolean(state.triggerDisabled);
    state.triggerButton.textContent = state.triggerLabel || '保存图片';
    state.triggerButton.removeAttribute('aria-busy');
  }
  if (typeof state.onClose === 'function') {
    try {
      state.onClose();
    } catch (err) {
      console.error('poster close callback failed:', err);
    }
  }
  if (state.triggerButton?.isConnected) {
    try {
      state.triggerButton.focus({ preventScroll: true });
    } catch {
      state.triggerButton.focus();
    }
  }
}

function openChartPoster(dataUrl, filename, options = {}) {
  const parts = posterElements();
  if (!parts.modal || !parts.img || !parts.preview || !parts.download) {
    throw new SaveImageError(PREVIEW_ERROR);
  }
  if (!parts.modal.classList.contains('hidden')) closeChartPoster();
  _posterState = {
    triggerButton: options.triggerButton || null,
    triggerLabel: options.triggerButton?.textContent || '保存图片',
    triggerDisabled: Boolean(options.triggerButton?.disabled),
    restoreTrigger: options.restoreTrigger,
    onClose: options.onClose,
  };
  lockBodyOverflow();
  bindPosterDismiss(parts.modal);
  if (parts.title) parts.title.textContent = options.title || '📸 海报预览';
  parts.modal.setAttribute('aria-label', options.ariaLabel || '图表海报预览');
  parts.modal.setAttribute('aria-hidden', 'false');
  parts.img.alt = `${options.ariaLabel || filename} 预览`;
  parts.img.onload = updatePosterScaleNote;
  parts.img.src = dataUrl;
  parts.download.onclick = () => downloadDataUrl(dataUrl, filename);
  parts.download.disabled = false;
  parts.download.textContent = '下载 PNG';
  parts.download.setAttribute('aria-label', `下载 PNG：${filename}`);
  if (parts.close) parts.close.onclick = closeChartPoster;
  if (parts.fit) parts.fit.onclick = () => setPosterScale('fit');
  if (parts.original) parts.original.onclick = () => setPosterScale('original');
  setPosterScale(options.scale === 'fit' ? 'fit' : 'original');
  parts.modal.classList.remove('hidden');
  requestAnimationFrame(() => parts.close?.focus({ preventScroll: true }));
  return true;
}

export async function previewAndDownload(node, filename, options = {}) {
  if (!node) return false;
  try {
    const dataUrl = await renderNodeToPng(node, options.backgroundColor);
    return openChartPoster(dataUrl, filename, options);
  } catch (err) {
    const error = toSaveImageError(err, RENDER_ERROR);
    closeChartPoster();
    reportSaveImageError(error, options);
    return false;
  }
}

export function closeChartPoster() {
  const parts = posterElements();
  if (parts.modal) {
    parts.modal.classList.add('hidden');
    parts.modal.setAttribute('aria-hidden', 'true');
  }
  if (parts.img) {
    parts.img.onload = null;
    parts.img.removeAttribute('src');
  }
  if (parts.download) parts.download.onclick = null;
  setPosterScale('original');
  releasePosterState();
}

export function pngFilename(prefix) {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${prefix}-${d.getFullYear()}-${mm}-${dd}.png`;
}

window.closeChartPoster = closeChartPoster;
