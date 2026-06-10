/**
 * theme.js — 深色/亮色主题切换 + 跟随系统
 *
 * 策略：
 *   1. 优先读 localStorage 里的用户偏好
 *   2. 若无偏好，跟随系统 prefers-color-scheme
 *   3. 手动切换时写入 localStorage 覆盖系统偏好
 *   4. 页面加载时尽早执行（防止闪烁），在 <head> 或首屏前注入
 *
 * 使用：import { start } from './js/theme.js'; start();
 */

const STORAGE_KEY = 'qdii-theme';

function getSystemPreference() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function getCurrentTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function toggleTheme() {
  const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch { /* ignore */ }
}

function start() {
  // 1. 初始化主题
  const stored = getStoredPreference();
  if (stored) {
    applyTheme(stored);
  } else {
    applyTheme(getSystemPreference());
  }

  // 2. 绑定切换按钮
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.addEventListener('click', toggleTheme);
  }

  // 3. 监听系统偏好变化（仅当用户未手动设置时跟随）
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e) => {
    if (!getStoredPreference()) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  };
  if (mql.addEventListener) {
    mql.addEventListener('change', handler);
  } else if (mql.addListener) {
    mql.addListener(handler); // Safari < 14
  }
}

// 暴露给全局（让内联 <script> 能调用 toggleTheme）
window.toggleTheme = toggleTheme;
window.getCurrentTheme = getCurrentTheme;

export { start, toggleTheme, getCurrentTheme };
