// Claude Style Markdown Preview — Mermaid diagrams
// Runs in the VS Code markdown preview webview next to the bundled Mermaid
// build (scripts/mermaid.min.js, which defines the `mermaid` global).
//
// Renders ```mermaid fences into a card with a toolbar (zoom, copy SVG,
// fullscreen with pan & zoom). An unlabeled fence is rendered too when its
// first line is a Mermaid diagram header and it parses; anything else stays
// an ordinary code block.
//
// VS Code patches the preview with morphdom on every edit, which turns our
// cards back into plain <pre><code> blocks. Results are cached per theme +
// source, so the `vscode.markdown.updateContent` handler restores the cards
// synchronously (before the next paint) instead of re-rendering. Cards are
// re-themed when the effective light/dark theme changes.

(function () {
  const TAG = '[claude-md-mermaid]';
  const PROCESSED = 'data-mermaid-processed';
  const SCRIPT_DIR = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '');
  // The preview's CSP only runs scripts carrying its nonce; reuse ours.
  const NONCE = (document.currentScript && document.currentScript.nonce) || '';
  const CACHE_MAX = 64;

  const cache = new Map(); // theme + '\n' + source -> { svg } | { error }
  let initializedTheme = null;
  let renderSeq = 0;
  let busy = false;
  let again = false;
  let fontsWait = null;

  function warn(...args) { try { console.warn(TAG, ...args); } catch (_) {} }

  function mermaidReady() {
    return typeof mermaid !== 'undefined' && typeof mermaid.render === 'function';
  }

  // Mermaid (~3.5 MB) is fetched only when a document has a diagram to
  // render: most previews have none, so they skip parsing it entirely.
  let mermaidLoad = null;
  function loadMermaid() {
    if (mermaidReady()) return Promise.resolve(true);
    if (!mermaidLoad) {
      mermaidLoad = new Promise((resolve) => {
        if (!SCRIPT_DIR) { warn('cannot locate mermaid.min.js'); resolve(false); return; }
        const script = document.createElement('script');
        script.src = SCRIPT_DIR + 'mermaid.min.js';
        if (NONCE) script.nonce = NONCE;
        script.onload = () => {
          // Mermaid auto-renders every `.mermaid` element on window `load`
          // unless told not to; those belong to VS Code's built-in renderer
          // (```vscode-mermaid, `::: mermaid`). Our initialize() comes later.
          if (mermaidReady()) mermaid.startOnLoad = false;
          resolve(mermaidReady());
        };
        script.onerror = () => { warn('mermaid.min.js failed to load'); resolve(false); };
        document.head.appendChild(script);
      });
    }
    return mermaidLoad;
  }

  // Mermaid theme for the effective preview theme. VS Code tags High
  // Contrast Light with both `vscode-high-contrast-light` and (for backwards
  // compatibility) `vscode-high-contrast`, so check the light classes first.
  function currentTheme() {
    const c = document.body.classList;
    if (c.contains('claude-force-dark')) return 'dark';
    if (c.contains('claude-force-light')) return 'default';
    return c.contains('vscode-light') || c.contains('vscode-high-contrast-light') ? 'default' : 'dark';
  }

  function ensureInit(theme) {
    if (initializedTheme === theme) return;
    mermaid.initialize({
      startOnLoad: false,
      theme: theme,
      securityLevel: 'antiscript',
      // Throw instead of drawing Mermaid's own error diagram; we show errors
      // inline and this keeps temporary render nodes off <body>.
      suppressErrorRendering: true,
      fontFamily: getComputedStyle(document.body).fontFamily,
      themeVariables: { fontSize: '14px' },
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
      sequence: { useMaxWidth: true, wrap: true },
      gantt: { useMaxWidth: true },
    });
    initializedTheme = theme;
  }

  // Text is measured when a diagram is laid out, so wait (briefly) for the
  // web fonts the labels use; otherwise boxes are sized for fallback fonts.
  function fontsSettled() {
    if (!fontsWait) {
      fontsWait = document.fonts && document.fonts.ready
        ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))])
        : Promise.resolve();
    }
    return fontsWait;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Block discovery
  // ─────────────────────────────────────────────────────────────────────

  // Headers that make an unlabeled fence a Mermaid candidate. Deliberately
  // strict — the keyword alone or with its standard options — so prose or
  // code that merely starts with "graph" or "timeline" is left alone.
  const HEADER_RE = /^(?:(?:graph|flowchart)(?:\s+(?:TB|TD|BT|RL|LR))?|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie(?:\s+showData)?(?:\s+title\s.+)?|gitGraph(?:\s+(?:LR|TB|BT))?:?|mindmap|timeline|quadrantChart|requirementDiagram|C4(?:Context|Container|Component|Dynamic|Deployment)|(?:sankey|xychart|block|packet|architecture|radar|treemap)(?:-beta)?(?:\s+(?:horizontal|vertical))?|kanban)\s*;?$/;

  // First meaningful line: skips blank lines, %% comments / directives and a
  // leading `---` front-matter block.
  function headerLine(source) {
    const lines = source.split(/\r?\n/);
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    if (i < lines.length && lines[i].trim() === '---') {
      i++;
      while (i < lines.length && lines[i].trim() !== '---') i++;
      i++;
    }
    for (; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('%%')) return line;
    }
    return '';
  }

  function diagramType(source) {
    const m = /^[A-Za-z][\w-]*/.exec(headerLine(source));
    return m ? m[0] : 'mermaid';
  }

  // Whether a fence is ours to render: an explicit ```mermaid block, or an
  // unlabeled one whose first line is a diagram header. Returns null otherwise.
  function classify(code) {
    const explicit = code.classList.contains('language-mermaid');
    const source = (code.textContent || '').replace(/\s+$/, '');
    if (!explicit) {
      // Another language, VS Code's front matter block, or not a header.
      if (/(^|\s)language-/.test(code.className) || code.parentElement.classList.contains('frontmatter')) return null;
      if (!HEADER_RE.test(headerLine(source))) return null;
    }
    return { explicit, source };
  }

  function findBlocks() {
    const blocks = [];
    document.querySelectorAll('pre > code:not([' + PROCESSED + '])').forEach((code) => {
      const target = classify(code);
      if (target) blocks.push({ code, pre: code.parentElement, source: target.source, explicit: target.explicit });
    });
    return blocks;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Rendering (cached)
  // ─────────────────────────────────────────────────────────────────────

  function cacheKey(theme, source) { return theme + '\n' + source; }

  // Interaction directives (`click`, and `link` / `callback` in class
  // diagrams) get their handlers from bindFunctions, which only work for the
  // render that produced them, so those diagrams aren't cached. A statement
  // can start a line or follow a `;` (`flowchart LR; A-->B; click A ...`).
  const INTERACTIVE_RE = /(?:^|;)\s*(?:click|link|callback)\s/m;
  function isInteractive(source) { return INTERACTIVE_RE.test(source); }

  function errorMessage(err) {
    return (err && (err.message || err.str)) || String(err);
  }

  function removeOrphans(id) {
    for (const sel of ['#d' + id, '#i' + id, '#' + id]) {
      const el = document.querySelector(sel);
      if (el && el.parentElement === document.body) el.remove();
    }
  }

  async function render(source, theme) {
    const key = cacheKey(theme, source);
    const hit = cache.get(key);
    if (hit) return hit;
    ensureInit(theme);
    const id = 'claude-mermaid-' + (++renderSeq);
    let entry;
    try {
      const result = await mermaid.render(id, source);
      entry = { svg: result.svg, bind: result.bindFunctions };
    } catch (err) {
      entry = { error: errorMessage(err) };
    } finally {
      removeOrphans(id);
    }
    if (entry.error || !isInteractive(source)) {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(key, { svg: entry.svg, error: entry.error });
    }
    return entry;
  }

  // The <pre> itself becomes the card, with the source <code> kept (hidden)
  // inside it. VS Code's morphdom update can then match it one-to-one instead
  // of rebuilding the rest of the document, and scroll sync keeps working
  // (VS Code maps a fenced <code data-line> to its parent <pre>).
  function place(block, entry, theme) {
    const { pre, code } = block;
    if (!pre.isConnected || code.parentElement !== pre) return;
    if (entry.error && !block.explicit) {
      // An unlabeled fence that only looked like Mermaid: leave it as code.
      code.setAttribute(PROCESSED, 'skip');
      return;
    }
    // A sniffed fence may already carry enhance.js's code-block chrome.
    pre.querySelectorAll(':scope > .md-code-chrome').forEach((el) => el.remove());
    pre.classList.remove('md-code');
    pre.removeAttribute('data-claude-enhanced');
    code.setAttribute(PROCESSED, entry.error ? 'error' : 'card');
    fill(pre, code, entry, block.source, theme);
  }

  function retheme(pre, entry, theme) {
    const code = pre.querySelector(':scope > code');
    const source = pre.getAttribute('data-mermaid-source');
    if (!pre.isConnected || !code || source === null) return;
    fill(pre, code, entry, source, theme);
  }

  // morphdom updates a fence's <pre>/<code> in place, so by the time an async
  // render finishes the block may hold different source, a different fence
  // language (```mermaid → ```python), or have been placed meanwhile. Only a
  // block that still classifies the same way may take the result.
  function blockIsCurrent(block) {
    const { pre, code } = block;
    if (!pre.isConnected || code.parentElement !== pre || code.hasAttribute(PROCESSED)) return false;
    const target = classify(code);
    return !!target && target.explicit === block.explicit && target.source === block.source;
  }

  function cardIsCurrent(pre, source) {
    return pre.isConnected && pre.classList.contains('md-mermaid') &&
      pre.getAttribute('data-mermaid-source') === source;
  }

  function fill(pre, code, entry, source, theme) {
    pre.querySelectorAll(':scope > .md-mermaid-bar, :scope > .md-mermaid-canvas, :scope > .mermaid-error')
      .forEach((el) => el.remove());
    pre.setAttribute('data-mermaid-source', source);
    if (entry.error) {
      pre.classList.remove('md-mermaid');
      pre.classList.add('md-mermaid-error');
      pre.removeAttribute('data-mermaid-theme');
      pre.insertBefore(buildError(entry.error), code);
      return;
    }
    pre.classList.remove('md-mermaid-error');
    pre.classList.add('md-mermaid');
    pre.setAttribute('data-mermaid-theme', theme);
    pre.setAttribute('role', 'figure');
    pre.setAttribute('aria-label', diagramType(source) + ' diagram');
    const { bar, canvas } = buildCard(entry.svg, source);
    pre.insertBefore(bar, code);
    pre.insertBefore(canvas, code);
    if (entry.bind) {
      try { entry.bind(canvas); } catch (err) { warn('bindFunctions failed', err); }
    }
  }

  function staleCards(theme) {
    return Array.from(document.querySelectorAll('pre.md-mermaid[data-mermaid-source]'))
      .filter((pre) => pre.getAttribute('data-mermaid-theme') !== theme);
  }

  // Swap in everything already cached for the current theme. Synchronous, so
  // a morphdom update never gets painted with raw diagram sources.
  function syncPass() {
    if (!document.body) return;
    const theme = currentTheme();
    let pending = false;
    for (const block of findBlocks()) {
      const hit = cache.get(cacheKey(theme, block.source));
      if (hit) place(block, hit, theme); else pending = true;
    }
    for (const card of staleCards(theme)) {
      const hit = cache.get(cacheKey(theme, card.getAttribute('data-mermaid-source')));
      if (hit) retheme(card, hit, theme); else pending = true;
    }
    observer.takeRecords();
    if (pending) renderPending();
  }

  // Render whatever syncPass couldn't, one diagram at a time (Mermaid keeps
  // global state). Re-runs if new work arrives while rendering.
  async function renderPending() {
    if (busy) { again = true; return; }
    busy = true;
    try {
      if (!(await loadMermaid())) return;
      await fontsSettled();
      do {
        again = false;
        const theme = currentTheme();
        for (const block of findBlocks()) {
          const entry = await render(block.source, theme);
          if (theme !== currentTheme()) { again = true; break; }
          if (blockIsCurrent(block)) place(block, entry, theme); else again = true;
        }
        if (again) continue;
        for (const card of staleCards(theme)) {
          const source = card.getAttribute('data-mermaid-source');
          const entry = await render(source, theme);
          if (theme !== currentTheme()) { again = true; break; }
          if (cardIsCurrent(card, source)) retheme(card, entry, theme); else again = true;
        }
      } while (again);
    } catch (err) {
      warn('render pass failed', err);
    } finally {
      busy = false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Card with toolbar (zoom in/out/reset, copy SVG, fullscreen)
  // ─────────────────────────────────────────────────────────────────────

  const ZOOM_MIN = 0.5, ZOOM_MAX = 3, ZOOM_STEP = 0.25;

  const ICONS = {
    zoomIn:  '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="6" cy="6" r="4"/><path d="m9 9 4 4M4 6h4M6 4v4" stroke-linecap="round"/></svg>',
    zoomOut: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="6" cy="6" r="4"/><path d="m9 9 4 4M4 6h4" stroke-linecap="round"/></svg>',
    reset:   '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M11.5 7a4.5 4.5 0 1 1-1.3-3.2" stroke-linecap="round"/><path d="M11.5 1.5v3h-3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    copy:    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.2"/><path d="M4 8.5V3.5A.5.5 0 0 1 4.5 3h5"/></svg>',
    full:    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 5.2V2h3.2M11.8 2H9v.2M2 8.8V11h3.2M8.8 12H12V8.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close:   '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m3.5 3.5 7 7M10.5 3.5l-7 7" stroke-linecap="round"/></svg>',
  };

  function makeBtn(title, iconHtml, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = iconHtml;
    b.addEventListener('click', onClick);
    return b;
  }

  function makeBar(text) {
    const bar = document.createElement('div');
    bar.className = 'md-mermaid-bar';
    const label = document.createElement('span');
    label.className = 'md-mermaid-label';
    label.textContent = text;
    bar.appendChild(label);
    const actions = document.createElement('div');
    actions.className = 'md-mermaid-actions';
    bar.appendChild(actions);
    return { bar, actions };
  }

  // Local CSS px per viewport px. Pointer coordinates and bounding rects are
  // in viewport px, while sizes and transforms apply inside the (possibly
  // page-zoomed) body.
  function localScale(el) {
    const w = el.getBoundingClientRect().width;
    return w ? el.clientWidth / w : 1;
  }

  // Toolbar + canvas for a card (fill() puts them into the <pre>).
  function buildCard(svg, source) {
    const { bar, actions } = makeBar(diagramType(source));
    const canvas = document.createElement('div');
    canvas.className = 'md-mermaid-canvas';
    canvas.innerHTML = svg;

    // Zoom resizes the SVG itself (not a transform on the canvas), so the
    // card grows and scrolls instead of clipping the diagram.
    const svgEl = canvas.querySelector('svg');
    const originalStyle = svgEl ? svgEl.getAttribute('style') : null;
    let zoom = 1;
    let baseWidth = 0;
    function setZoom(next) {
      next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
      if (!svgEl || next === zoom) return;
      if (!baseWidth) baseWidth = svgEl.getBoundingClientRect().width * localScale(canvas);
      zoom = next;
      if (zoom === 1) {
        if (originalStyle === null) svgEl.removeAttribute('style');
        else svgEl.setAttribute('style', originalStyle);
      } else {
        svgEl.style.maxWidth = 'none';
        svgEl.style.width = Math.round(baseWidth * zoom) + 'px';
      }
    }

    const copyBtn = makeBtn('Copy SVG', ICONS.copy, () => {
      copyText(svg).then((ok) => { if (ok) flash(copyBtn); });
    });
    actions.append(
      makeBtn('Zoom out', ICONS.zoomOut, () => setZoom(zoom - ZOOM_STEP)),
      makeBtn('Zoom in', ICONS.zoomIn, () => setZoom(zoom + ZOOM_STEP)),
      makeBtn('Reset zoom', ICONS.reset, () => setZoom(1)),
      copyBtn,
      makeBtn('Fullscreen', ICONS.full, () => openFullscreen(svg, source)),
    );

    return { bar, canvas };
  }

  // Error banner shown above the (still visible) source of an invalid block.
  function buildError(message) {
    const head = document.createElement('div');
    head.className = 'mermaid-error';
    head.setAttribute('role', 'note');
    head.textContent = 'Mermaid error: ' + message;
    return head;
  }

  function flash(btn) {
    btn.classList.add('is-done');
    setTimeout(() => btn.classList.remove('is-done'), 1200);
  }

  // Resolves to whether the text reached the clipboard.
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    ta.remove();
    return ok;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Fullscreen view with wheel / pinch zoom and drag panning
  // ─────────────────────────────────────────────────────────────────────

  const FS_ZOOM_MIN = 0.4, FS_ZOOM_MAX = 6, FS_ZOOM_FACTOR = 1.2;

  function openFullscreen(svg, source) {
    if (document.querySelector('.md-mermaid-overlay')) return;
    const previousFocus = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'md-mermaid-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', diagramType(source) + ' diagram');

    const { bar, actions } = makeBar(diagramType(source) + ' · fullscreen');
    const canvas = document.createElement('div');
    canvas.className = 'md-mermaid-canvas';
    canvas.innerHTML = svg;
    const svgEl = canvas.querySelector('svg');
    if (svgEl) svgEl.style.transformOrigin = 'center center';

    // The SVG stays flex-centered; pan + zoom are a transform on top of that,
    // so the canvas center is a fixed anchor for cursor-anchored zoom.
    let zoom = 1, panX = 0, panY = 0;
    function apply() {
      if (svgEl) svgEl.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom.toFixed(3) + ')';
    }
    // Zoom toward viewport point (mx, my), keeping that point fixed.
    function zoomTo(next, mx, my) {
      next = Math.min(FS_ZOOM_MAX, Math.max(FS_ZOOM_MIN, next));
      if (next === zoom) return;
      const rect = canvas.getBoundingClientRect();
      const k = localScale(canvas);
      const dx = (mx - (rect.left + rect.width / 2)) * k;
      const dy = (my - (rect.top + rect.height / 2)) * k;
      const ratio = next / zoom;
      panX = dx - ratio * (dx - panX);
      panY = dy - ratio * (dy - panY);
      zoom = next;
      apply();
    }
    function zoomFromCenter(next) {
      const rect = canvas.getBoundingClientRect();
      zoomTo(next, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    function reset() { zoom = 1; panX = 0; panY = 0; apply(); }

    // Proportional to the wheel delta, so a trackpad pinch (a stream of
    // small ctrlKey wheel events) zooms smoothly and a mouse notch ~1.2×.
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomTo(zoom * Math.exp(-px / 550), e.clientX, e.clientY);
    }, { passive: false });

    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, panX: panX, panY: panY, k: localScale(canvas) };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('is-grabbing');
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      panX = drag.panX + (e.clientX - drag.x) * drag.k;
      panY = drag.panY + (e.clientY - drag.y) * drag.k;
      apply();
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      canvas.classList.remove('is-grabbing');
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
    }
    function onKey(e) {
      let handled = true;
      if (e.key === 'Escape') close();
      else if (e.ctrlKey || e.metaKey || e.altKey) handled = false;
      else if (e.key === '+' || e.key === '=') zoomFromCenter(zoom * FS_ZOOM_FACTOR);
      else if (e.key === '-' || e.key === '_') zoomFromCenter(zoom / FS_ZOOM_FACTOR);
      else if (e.key === '0') reset();
      else handled = false;
      if (handled) {
        // Keep VS Code (which receives every webview keydown) out of it.
        e.preventDefault();
        e.stopPropagation();
      }
    }

    const closeBtn = makeBtn('Close (Esc)', ICONS.close, close);
    actions.append(
      makeBtn('Zoom out', ICONS.zoomOut, () => zoomFromCenter(zoom / FS_ZOOM_FACTOR)),
      makeBtn('Zoom in', ICONS.zoomIn, () => zoomFromCenter(zoom * FS_ZOOM_FACTOR)),
      makeBtn('Reset zoom', ICONS.reset, reset),
      closeBtn,
    );

    overlay.append(bar, canvas);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    closeBtn.focus({ preventScroll: true });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Wiring
  // ─────────────────────────────────────────────────────────────────────

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType === 1 && (node.matches('pre, code') || node.querySelector('pre > code'))) {
          syncPass();
          return;
        }
      }
    }
  });

  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  window.addEventListener('vscode.markdown.updateContent', syncPass);
  document.addEventListener('claude-theme-change', syncPass);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncPass);
  } else {
    syncPass();
  }
})();
