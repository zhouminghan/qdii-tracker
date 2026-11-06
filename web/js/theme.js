const STORAGE_KEY = 'qdii-theme';
const COLOR_KEY = 'qdii-color';

function toggleTheme() {
  const dark = document.documentElement.classList.toggle('dark');
  try { sessionStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light'); } catch {}
}

function toggleColor() {
  const intl = document.documentElement.classList.toggle('intl-color');
  try { sessionStorage.setItem(COLOR_KEY, intl ? 'intl' : 'cn'); } catch {}
  updateColorLabel();
}

function updateColorLabel() {
  const btn = document.getElementById('colorToggle');
  if (!btn) return;
  const intl = document.documentElement.classList.contains('intl-color');
  btn.setAttribute('title', intl ? '切换为红涨绿跌' : '切换为绿涨红跌');
  btn.setAttribute('aria-label', intl ? '切换为红涨绿跌' : '切换为绿涨红跌');
  const label = btn.querySelector('.color-toggle-label');
  if (label) label.textContent = intl ? '绿涨' : '红涨';
}

function start() {
  var btn = document.getElementById('themeToggle');
  if (btn) btn.addEventListener('click', toggleTheme);
  var colorBtn = document.getElementById('colorToggle');
  if (colorBtn) colorBtn.addEventListener('click', toggleColor);
  try {
    if (sessionStorage.getItem(COLOR_KEY) === 'intl') {
      document.documentElement.classList.add('intl-color');
    }
  } catch (e) {}
  updateColorLabel();
  try {
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var handler = function() {
      if (!sessionStorage.getItem(STORAGE_KEY)) {
        document.documentElement.classList.toggle('dark', mql.matches);
      }
    };
    if (mql.addEventListener) mql.addEventListener('change', handler);
  } catch (e) {}
}

window.toggleTheme = toggleTheme;
window.toggleColor = toggleColor;
export { start, toggleTheme, toggleColor };
