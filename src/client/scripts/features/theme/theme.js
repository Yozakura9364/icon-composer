function renderThemeToggleIcon(theme) {
  const icon = document.getElementById('themeToggleIcon');
  if (!icon) return;
  icon.src = theme === 'dark' ? appPath('/assets/icons/sun.svg') : appPath('/assets/icons/moon.svg');
}

function applyThemeFromStorage() {
  let t = localStorage.getItem(THEME_KEY);
  if (t !== 'light' && t !== 'dark') {
    t = 'light';
  }
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('themeToggleBtn');
  renderThemeToggleIcon(t);
  if (btn) {
    btn.title = t === 'dark' ? '切换为浅色' : '切换为深色';
    btn.setAttribute('aria-label', btn.title);
  }
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyThemeFromStorage();
  schedulePersistComposerConfig();
}
