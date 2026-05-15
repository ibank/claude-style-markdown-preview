(function () {
  const STORAGE_KEY = 'claude-md-theme-mode';
  const MODES = ['auto', 'light', 'dark'];
  const ICONS = { auto: '◐', light: '☀', dark: '☾' };
  const LABELS = { auto: 'Auto', light: 'Light', dark: 'Dark' };

  function getMode() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (MODES.indexOf(saved) >= 0) return saved;
    } catch (_) {}
    return 'auto';
  }

  function applyMode(mode) {
    const body = document.body;
    if (!body) return;
    body.classList.remove('claude-force-light', 'claude-force-dark');
    if (mode === 'light') body.classList.add('claude-force-light');
    if (mode === 'dark') body.classList.add('claude-force-dark');
    updateButton();
    try {
      document.dispatchEvent(new CustomEvent('claude-theme-change', {
        detail: { mode: mode, effective: getEffectiveTheme() }
      }));
    } catch (_) {}
  }

  function setMode(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (_) {}
    applyMode(mode);
  }

  function getEffectiveTheme() {
    const body = document.body;
    if (body.classList.contains('claude-force-dark')) return 'dark';
    if (body.classList.contains('claude-force-light')) return 'light';
    if (body.classList.contains('vscode-light')) return 'light';
    return 'dark';
  }

  function updateButton() {
    const btn = document.getElementById('claude-theme-toggle');
    if (!btn) return;
    const mode = getMode();
    btn.textContent = ICONS[mode] + '  ' + LABELS[mode];
    btn.setAttribute('data-mode', mode);
    btn.title = 'Theme: ' + LABELS[mode] + ' — click to cycle (Auto / Light / Dark)';
  }

  function cycle() {
    const cur = getMode();
    const next = MODES[(MODES.indexOf(cur) + 1) % MODES.length];
    setMode(next);
  }

  function createButton() {
    if (document.getElementById('claude-theme-toggle')) return;
    if (!document.body) return;
    const btn = document.createElement('button');
    btn.id = 'claude-theme-toggle';
    btn.className = 'claude-theme-toggle';
    btn.type = 'button';
    btn.addEventListener('click', cycle);
    document.body.appendChild(btn);
    updateButton();
  }

  function ready() {
    applyMode(getMode());
    createButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }

  // VS Code re-renders body on edits — keep button & forced class alive
  const observer = new MutationObserver(() => {
    if (!document.body) return;
    const mode = getMode();
    const body = document.body;
    const needsLight = mode === 'light' && !body.classList.contains('claude-force-light');
    const needsDark = mode === 'dark' && !body.classList.contains('claude-force-dark');
    const needsClear = mode === 'auto' && (body.classList.contains('claude-force-light') || body.classList.contains('claude-force-dark'));
    if (needsLight || needsDark || needsClear) applyMode(mode);
    if (!document.getElementById('claude-theme-toggle')) createButton();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.claudeMdTheme = { getMode: getMode, setMode: setMode, getEffectiveTheme: getEffectiveTheme };
})();
