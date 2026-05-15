(function () {
  const STORAGE_KEY = 'claude-md-theme-mode';
  const MODES = ['auto', 'light', 'dark'];
  const LABELS = { auto: 'Auto', light: 'Light', dark: 'Dark' };

  // Inline SVG icons matching the design's Auto/Light/Dark glyphs.
  const ICONS = {
    auto:  '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="6" cy="6" r="3.6"/><path d="M6 2.4v7.2"/><path d="M6 2.4a3.6 3.6 0 0 0 0 7.2" fill="currentColor"/></svg>',
    light: '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="6" cy="6" r="2.4"/><path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.5 2.5l1.1 1.1M8.4 8.4l1.1 1.1M2.5 9.5l1.1-1.1M8.4 3.6l1.1-1.1" stroke-linecap="round"/></svg>',
    dark:  '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M9.5 7.2A4 4 0 0 1 4.8 2.5a4 4 0 1 0 4.7 4.7z" fill="currentColor"/></svg>',
  };

  function getMode() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (MODES.indexOf(saved) >= 0) return saved;
    } catch (_) {}
    return 'auto';
  }

  function getEffectiveTheme() {
    const body = document.body;
    if (body.classList.contains('claude-force-dark')) return 'dark';
    if (body.classList.contains('claude-force-light')) return 'light';
    if (body.classList.contains('vscode-light')) return 'light';
    return 'dark';
  }

  function applyMode(mode) {
    const body = document.body;
    if (!body) return;
    body.classList.remove('claude-force-light', 'claude-force-dark');
    if (mode === 'light') body.classList.add('claude-force-light');
    if (mode === 'dark') body.classList.add('claude-force-dark');
    updateButtons();
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

  function updateButtons() {
    const root = document.querySelector('.md-theme-toggle');
    if (!root) return;
    const mode = getMode();
    root.querySelectorAll('.md-tt-opt').forEach((btn) => {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }

  function buildToggle() {
    if (document.querySelector('.md-theme-toggle')) return;
    if (!document.body) return;

    const root = document.createElement('div');
    root.className = 'md-theme-toggle';
    root.setAttribute('role', 'radiogroup');
    root.setAttribute('aria-label', 'Theme');

    MODES.forEach((m) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'md-tt-opt';
      btn.dataset.mode = m;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('title', 'Theme: ' + LABELS[m]);
      btn.innerHTML =
        '<span class="md-tt-icon" aria-hidden="true">' + ICONS[m] + '</span>' +
        '<span class="md-tt-label">' + LABELS[m] + '</span>';
      btn.addEventListener('click', function () { setMode(m); });
      btn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = MODES[(MODES.indexOf(m) + 1) % MODES.length];
          setMode(next);
          focusByMode(next);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = MODES[(MODES.indexOf(m) - 1 + MODES.length) % MODES.length];
          setMode(prev);
          focusByMode(prev);
        }
      });
      root.appendChild(btn);
    });

    document.body.appendChild(root);
    updateButtons();
  }

  function focusByMode(m) {
    const btn = document.querySelector('.md-theme-toggle .md-tt-opt[data-mode="' + m + '"]');
    if (btn) btn.focus();
  }

  function ready() {
    applyMode(getMode());
    buildToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }

  // VS Code rerenders body content on edits — keep state alive
  const observer = new MutationObserver(() => {
    if (!document.body) return;
    const mode = getMode();
    const body = document.body;
    const needsLight = mode === 'light' && !body.classList.contains('claude-force-light');
    const needsDark = mode === 'dark' && !body.classList.contains('claude-force-dark');
    const needsClear = mode === 'auto' && (body.classList.contains('claude-force-light') || body.classList.contains('claude-force-dark'));
    if (needsLight || needsDark || needsClear) applyMode(mode);
    if (!document.querySelector('.md-theme-toggle')) buildToggle();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.claudeMdTheme = { getMode: getMode, setMode: setMode, getEffectiveTheme: getEffectiveTheme };
})();
