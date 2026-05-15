(function () {
  const TAG = '[claude-md-mermaid]';
  let renderCount = 0;
  let lastTheme = null;

  function log(...args) { try { console.log(TAG, ...args); } catch (_) {} }
  function warn(...args) { try { console.warn(TAG, ...args); } catch (_) {} }

  function currentTheme() {
    const body = document.body;
    if (body.classList.contains('claude-force-dark')) return 'dark';
    if (body.classList.contains('claude-force-light')) return 'default';
    if (body.classList.contains('vscode-dark') || body.classList.contains('vscode-high-contrast')) return 'dark';
    return 'default';
  }

  function ensureInit(force) {
    if (typeof mermaid === 'undefined') return false;
    const theme = currentTheme();
    if (!force && lastTheme === theme) return true;
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: theme,
        securityLevel: 'antiscript',
        fontFamily: getComputedStyle(document.body).fontFamily,
        themeVariables: { fontSize: '14px' },
        flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
        sequence: { useMaxWidth: true, wrap: true },
        gantt: { useMaxWidth: true },
      });
      lastTheme = theme;
      log('mermaid (re)initialized, theme=', theme);
      return true;
    } catch (e) {
      warn('mermaid.initialize failed:', e);
      return false;
    }
  }

  const MERMAID_KEYWORDS = /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|sankey|xychart-beta|block-beta|architecture-beta)\b/;

  function findBlocks() {
    const found = new Set();
    document.querySelectorAll('pre > code.language-mermaid:not([data-mermaid-processed])').forEach(el => found.add(el));
    document.querySelectorAll('pre > code:not([data-mermaid-processed])').forEach(el => {
      if (found.has(el)) return;
      const txt = (el.textContent || '').trim();
      if (MERMAID_KEYWORDS.test(txt)) found.add(el);
    });
    return Array.from(found);
  }

  function showError(pre, code, err) {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-mermaid-source', code);
    wrap.className = 'mermaid-error-wrap';

    const errorDiv = document.createElement('div');
    errorDiv.className = 'mermaid-error';
    errorDiv.textContent = 'Mermaid error: ' + (err && err.message ? err.message : String(err));
    wrap.appendChild(errorDiv);

    const sourcePre = document.createElement('pre');
    sourcePre.className = 'mermaid-source';
    const sourceCode = document.createElement('code');
    sourceCode.textContent = code;
    sourcePre.appendChild(sourceCode);
    wrap.appendChild(sourcePre);

    pre.replaceWith(wrap);
  }

  function cleanupOrphans(id) {
    // Mermaid v10 leaves temp render containers attached to <body> on error.
    // Remove the specific one for this id, plus any older strays.
    if (id) {
      const a = document.getElementById(id);
      if (a && a.parentElement === document.body) a.remove();
      const b = document.getElementById('d' + id);
      if (b && b.parentElement === document.body) b.remove();
    }
    document.querySelectorAll('body > svg[id^="mermaid-svg-"], body > div[id^="dmermaid-svg-"], body > div[id^="mermaid-svg-"]').forEach(el => {
      el.remove();
    });
  }

  async function renderBlock(block) {
    block.setAttribute('data-mermaid-processed', 'true');
    const code = (block.textContent || '').trim();
    const pre = block.parentElement;
    if (!pre) return;

    const id = 'mermaid-svg-' + (++renderCount) + '-' + Date.now();

    // Pre-validate. parse() failures don't pollute the DOM, render() failures do.
    if (typeof mermaid.parse === 'function') {
      try {
        await mermaid.parse(code);
      } catch (err) {
        warn('parse error', err);
        showError(pre, code, err);
        cleanupOrphans(id);
        return;
      }
    }

    try {
      const result = await mermaid.render(id, code);
      const svg = result && result.svg ? result.svg : result;
      const bind = result && result.bindFunctions;

      const container = buildMermaidContainer(svg, code);
      pre.replaceWith(container);
      const canvas = container.querySelector('.md-mermaid-canvas');
      if (typeof bind === 'function' && canvas) bind(canvas);
    } catch (err) {
      warn('render error', err);
      cleanupOrphans(id);
      showError(pre, code, err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Container with toolbar (zoom in/out/reset, copy SVG, fullscreen)
  // ─────────────────────────────────────────────────────────────────────

  const ZOOM_MIN = 0.5, ZOOM_MAX = 3, ZOOM_STEP = 0.2;

  const TOOLBAR_ICONS = {
    zoomIn:  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6" cy="6" r="4"/><path d="m9 9 4 4M4 6h4M6 4v4" stroke-linecap="round"/></svg>',
    zoomOut: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6" cy="6" r="4"/><path d="m9 9 4 4M4 6h4" stroke-linecap="round"/></svg>',
    reset:   '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M11.5 7a4.5 4.5 0 1 1-1.3-3.2" stroke-linecap="round"/><path d="M11.5 1.5v3h-3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    copy:    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4" y="4" width="7" height="7" rx="1.2"/><path d="M4 8.5V3.5A.5.5 0 0 1 4.5 3h5"/></svg>',
    full:    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 5.2V2h3.2M11.8 2H9v.2M2 8.8V11h3.2M8.8 12H12V8.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close:   '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="m3.5 3.5 7 7M10.5 3.5l-7 7" stroke-linecap="round"/></svg>',
  };

  function buildMermaidContainer(svg, code) {
    const wrap = document.createElement('div');
    wrap.className = 'md-mermaid';
    wrap.setAttribute('data-mermaid-source', code);

    const bar = document.createElement('div');
    bar.className = 'md-mermaid-bar';
    const label = document.createElement('span');
    label.className = 'md-mermaid-label';
    label.textContent = detectMermaidType(code);
    bar.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'md-mermaid-actions';

    const canvas = document.createElement('div');
    canvas.className = 'md-mermaid-canvas';
    canvas.innerHTML = svg;

    let zoom = 1;
    function applyZoom() {
      canvas.style.transform = 'scale(' + zoom.toFixed(2) + ')';
    }

    const btnZoomOut = makeBtn('Zoom out', TOOLBAR_ICONS.zoomOut, () => {
      zoom = Math.max(ZOOM_MIN, +(zoom - ZOOM_STEP).toFixed(2));
      applyZoom();
    });
    const btnZoomIn = makeBtn('Zoom in', TOOLBAR_ICONS.zoomIn, () => {
      zoom = Math.min(ZOOM_MAX, +(zoom + ZOOM_STEP).toFixed(2));
      applyZoom();
    });
    const btnReset = makeBtn('Reset zoom', TOOLBAR_ICONS.reset, () => {
      zoom = 1; applyZoom();
    });
    const btnCopy = makeBtn('Copy SVG', TOOLBAR_ICONS.copy, () => {
      copyTextSafe(svg).then(() => flashBtn(btnCopy));
    });
    const btnFull = makeBtn('Fullscreen', TOOLBAR_ICONS.full, () => {
      openFullscreen(svg, code);
    });

    actions.appendChild(btnZoomOut);
    actions.appendChild(btnZoomIn);
    actions.appendChild(btnReset);
    actions.appendChild(btnCopy);
    actions.appendChild(btnFull);
    bar.appendChild(actions);

    wrap.appendChild(bar);
    wrap.appendChild(canvas);
    return wrap;
  }

  function makeBtn(title, iconHtml, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = iconHtml;
    b.addEventListener('click', onClick);
    return b;
  }

  function flashBtn(btn) {
    btn.style.color = 'var(--md-accent)';
    btn.style.background = 'var(--md-accent-bg)';
    setTimeout(() => { btn.style.color = ''; btn.style.background = ''; }, 1200);
  }

  function detectMermaidType(code) {
    const m = /^\s*(\w[\w-]*)/.exec(code || '');
    return m ? m[1] : 'mermaid';
  }

  function copyTextSafe(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
      return true;
    } catch (_) { return false; }
  }

  function openFullscreen(svg, code) {
    const overlay = document.createElement('div');
    overlay.className = 'md-mermaid-overlay';

    const bar = document.createElement('div');
    bar.className = 'md-mermaid-bar';
    const label = document.createElement('span');
    label.className = 'md-mermaid-label';
    label.textContent = detectMermaidType(code) + ' · fullscreen';
    bar.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'md-mermaid-actions';
    const closeBtn = makeBtn('Close (Esc)', TOOLBAR_ICONS.close, () => overlay.remove());
    actions.appendChild(closeBtn);
    bar.appendChild(actions);

    const canvas = document.createElement('div');
    canvas.className = 'md-mermaid-canvas';
    canvas.innerHTML = svg;

    overlay.appendChild(bar);
    overlay.appendChild(canvas);
    document.body.appendChild(overlay);

    function onKey(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
      }
    }
    document.addEventListener('keydown', onKey);
  }

  async function renderAll() {
    if (!ensureInit(false)) return;
    cleanupOrphans();
    const blocks = findBlocks();
    if (blocks.length === 0) return;
    log('rendering', blocks.length, 'block(s)');
    for (const block of blocks) await renderBlock(block);
    cleanupOrphans();
  }

  async function rerenderAll() {
    if (!ensureInit(true)) return;
    const containers = document.querySelectorAll('.md-mermaid[data-mermaid-source], .mermaid-rendered[data-mermaid-source], .mermaid-error-wrap[data-mermaid-source]');
    if (containers.length === 0) {
      renderAll();
      return;
    }
    log('re-rendering', containers.length, 'block(s) for theme change');
    containers.forEach((el) => {
      const code = el.getAttribute('data-mermaid-source') || '';
      const pre = document.createElement('pre');
      const codeEl = document.createElement('code');
      codeEl.className = 'language-mermaid';
      codeEl.textContent = code;
      pre.appendChild(codeEl);
      el.replaceWith(pre);
    });
    cleanupOrphans();
    await renderAll();
  }

  function schedule() {
    if (schedule._pending) return;
    schedule._pending = true;
    setTimeout(() => { schedule._pending = false; renderAll(); }, 60);
  }

  function waitForMermaidThenRender(retries) {
    if (typeof mermaid !== 'undefined') { renderAll(); return; }
    if (retries <= 0) { warn('mermaid did not load'); return; }
    setTimeout(() => waitForMermaidThenRender(retries - 1), 50);
  }

  log('init script loaded, readyState=', document.readyState);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => waitForMermaidThenRender(40));
  } else {
    waitForMermaidThenRender(40);
  }

  document.addEventListener('claude-theme-change', () => {
    log('theme change detected');
    rerenderAll();
  });

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches('pre, code')) { schedule(); return; }
        if (node.querySelector && node.querySelector('pre code')) { schedule(); return; }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
