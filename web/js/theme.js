const STORAGE_KEY = 'qdii-theme';

function toggleTheme() {
  const dark = document.documentElement.classList.toggle('dark');
  try { localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light'); } catch {}
}

function start() {
  var btn = document.getElementById('themeToggle');
  if (btn) btn.addEventListener('click', toggleTheme);
  try {
    var mql = window.matchMedia('(prefers-color-scheme: dark)');
    var handler = function() {
      if (!localStorage.getItem(STORAGE_KEY)) {
        document.documentElement.classList.toggle('dark', mql.matches);
      }
    };
    if (mql.addEventListener) mql.addEventListener('change', handler);
  } catch (e) {}
}

window.toggleTheme = toggleTheme;
export { start, toggleTheme };
