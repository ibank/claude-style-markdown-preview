// Claude Style Markdown Preview — whole-page zoom
// Runs in the VS Code markdown preview webview.
//
// Cmd/Ctrl + (+ / - / 0) and Cmd/Ctrl + mouse wheel (incl. macOS trackpad
// pinch, which arrives as a ctrlKey wheel event) zoom the entire preview.
// Implemented with the CSS `zoom` property on <body> so layout reflows like a
// native browser zoom. The level persists in localStorage and is re-asserted
// after VS Code re-renders the body on every edit.

(function () {
  const STORAGE_KEY = 'claude-md-page-zoom';
  const MIN = 0.5, MAX = 3, STEP = 0.1, WHEEL_FACTOR = 1.1;

  let zoom = 1;
  let badge = null;
  let hideTimer = null;

  function clamp(z) {
    z = Math.round(z * 100) / 100;
    return Math.min(MAX, Math.max(MIN, z));
  }

  function load() {
    try {
      const v = parseFloat(localStorage.getItem(STORAGE_KEY));
      if (!isNaN(v)) return clamp(v);
    } catch (_) {}
    return 1;
  }

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, String(zoom)); } catch (_) {}
  }

  function applyZoom() {
    if (document.body) document.body.style.zoom = String(zoom);
  }

  // The badge lives on <html>, outside the zoomed <body>, so it stays a
  // constant size regardless of the current zoom level.
  function ensureBadge() {
    if (badge && badge.isConnected) return badge;
    badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'md-zoom-badge';
    badge.title = 'Reset zoom (⌘/Ctrl + 0)';
    badge.setAttribute('aria-label', 'Reset page zoom');
    badge.addEventListener('click', reset);
    (document.documentElement || document.body).appendChild(badge);
    return badge;
  }

  function refreshBadge(flash) {
    const b = ensureBadge();
    b.textContent = Math.round(zoom * 100) + '%';
    if (zoom === 1 && !flash) { b.classList.remove('is-visible'); return; }
    b.classList.add('is-visible');
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    // At 100% the badge is just transient feedback; otherwise it stays up so
    // the user can see (and click to clear) the active zoom.
    if (zoom === 1) {
      hideTimer = setTimeout(function () { b.classList.remove('is-visible'); }, 1200);
    }
  }

  function setZoom(z, flash) {
    const next = clamp(z);
    if (next !== zoom) { zoom = next; persist(); }
    applyZoom();
    refreshBadge(flash !== false);
  }

  function zoomIn() { setZoom(zoom + STEP); }
  function zoomOut() { setZoom(zoom - STEP); }
  function reset() { setZoom(1); }

  function onKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomOut(); }
    else if (e.key === '0') { e.preventDefault(); reset(); }
  }

  function onWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    // Let the Mermaid/image overlays handle their own wheel zoom.
    if (e.target && e.target.closest &&
        e.target.closest('.md-mermaid-overlay, .md-img-overlay')) return;
    e.preventDefault();
    setZoom(zoom * (e.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR));
  }

  function init() {
    zoom = load();
    applyZoom();
    if (zoom !== 1) refreshBadge(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('wheel', onWheel, { passive: false });

  // VS Code rewrites the body content on edits. The inline zoom style lives on
  // the <body> element (which survives), but re-assert it defensively if it
  // ever gets cleared. This must NOT touch the badge: the badge sits in the
  // observed subtree, so writing to it here would retrigger the observer in an
  // infinite loop. The guard makes the common case a cheap no-op.
  const observer = new MutationObserver(function () {
    if (zoom !== 1 && document.body && document.body.style.zoom !== String(zoom)) {
      applyZoom();
    }
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.claudeMdZoom = {
    get: function () { return zoom; },
    setZoom: setZoom,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
    reset: reset,
  };
})();
