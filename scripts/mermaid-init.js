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

      const container = document.createElement('div');
      container.className = 'mermaid-rendered';
      container.setAttribute('data-mermaid-source', code);
      container.innerHTML = svg;
      pre.replaceWith(container);
      if (typeof bind === 'function') bind(container);
    } catch (err) {
      warn('render error', err);
      cleanupOrphans(id);
      showError(pre, code, err);
    }
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
    const containers = document.querySelectorAll('.mermaid-rendered[data-mermaid-source], .mermaid-error-wrap[data-mermaid-source]');
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
