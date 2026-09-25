// Claude Style Markdown Preview — Auto / Light / Dark theme toggle
// Runs in the VS Code markdown preview webview.
//
// Light / Dark force the palette with `claude-force-light` /
// `claude-force-dark` on <body> (persisted in localStorage); Auto follows the
// VS Code theme. Dispatches `claude-theme-change` on <document> whenever the
// effective theme changes — from the toggle or from a VS Code theme switch —
// so mermaid-init.js can re-theme diagrams.

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

  let lastEffective = null;

  function getMode() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (MODES.indexOf(saved) >= 0) return saved;
    } catch (_) {}
    return 'auto';
  }

  // VS Code tags High Contrast Light with both `vscode-high-contrast-light`
  // and (for backwards compatibility) `vscode-high-contrast`, so the light
  // classes have to be checked before falling back to dark.
  function getEffectiveTheme() {
    const body = document.body;
    if (!body) return 'dark';
    if (body.classList.contains('claude-force-dark')) return 'dark';
    if (body.classList.contains('claude-force-light')) return 'light';
    if (body.classList.contains('vscode-light') || body.classList.contains('vscode-high-contrast-light')) return 'light';
    return 'dark';
  }

  // Also mirrors the effective theme to <body data-claude-theme="light|dark">,
  // a stable hook for user stylesheets (markdown.styles) — the class names
  // alone are ambiguous when a forced theme differs from VS Code's.
  function notifyIfChanged() {
    const effective = getEffectiveTheme();
    if (document.body.getAttribute('data-claude-theme') !== effective) {
      document.body.setAttribute('data-claude-theme', effective);
    }
    if (effective === lastEffective) return;
    lastEffective = effective;
    try {
      document.dispatchEvent(new CustomEvent('claude-theme-change', {
        detail: { mode: getMode(), effective: effective },
      }));
    } catch (_) {}
  }

  function applyMode(mode) {
    const body = document.body;
    if (!body) return;
    body.classList.toggle('claude-force-light', mode === 'light');
    body.classList.toggle('claude-force-dark', mode === 'dark');
    updateButtons();
    notifyIfChanged();
  }

  function setMode(mode) {
    if (MODES.indexOf(mode) < 0) return;
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
    if (!document.body || document.querySelector('.md-theme-toggle')) return;

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
      btn.addEventListener('click', () => setMode(m));
      btn.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
          : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = MODES[(MODES.indexOf(m) + step + MODES.length) % MODES.length];
        setMode(next);
        focusByMode(next);
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

    // VS Code swaps the vscode-* theme classes on <body> when the color theme
    // changes (other classes are left alone): re-check the effective theme,
    // and keep the forced class and the toggle in place defensively.
    new MutationObserver(() => {
      const mode = getMode();
      const body = document.body;
      if (body.classList.contains('claude-force-light') !== (mode === 'light') ||
          body.classList.contains('claude-force-dark') !== (mode === 'dark')) {
        applyMode(mode);
      } else {
        notifyIfChanged();
      }
      if (!document.querySelector('.md-theme-toggle')) buildToggle();
    }).observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });
  }

  if (document.body) {
    ready();
  } else {
    document.addEventListener('DOMContentLoaded', ready);
  }

  window.claudeMdTheme = { getMode: getMode, setMode: setMode, getEffectiveTheme: getEffectiveTheme };
})();
