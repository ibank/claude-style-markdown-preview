// Claude Style Markdown Preview — whole-page zoom
// Runs in the VS Code markdown preview webview.
//
// Cmd/Ctrl + (+ / - / 0) and Cmd/Ctrl + mouse wheel (incl. macOS trackpad
// pinch, which arrives as a ctrlKey wheel event) zoom the entire preview.
// Implemented with the CSS `zoom` property on <body> so layout reflows like a
// native browser zoom. The level persists in localStorage.

(function () {
  const STORAGE_KEY = 'claude-md-page-zoom';
  const MIN = 0.5, MAX = 3, STEP = 0.1;

  let zoom = 1;
  let badge = null;
  let hideTimer = null;

  function clamp(z) {
    return Math.min(MAX, Math.max(MIN, z));
  }

  // `zoom` keeps full precision so tiny pinch steps accumulate; CSS gets 0.1%
  // resolution, which survives style serialization unchanged.
  function cssZoom() { return Math.round(zoom * 1000) / 1000; }

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
    if (document.body) document.body.style.zoom = String(cssZoom());
    // The badge sits inside <body> so it inherits the theme tokens; cancel the
    // page zoom on it so it stays a constant size.
    if (badge) badge.style.zoom = String(1 / cssZoom());
  }

  function ensureBadge() {
    if (badge && badge.isConnected) return badge;
    badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'md-zoom-badge';
    badge.title = 'Reset zoom (⌘/Ctrl + 0)';
    badge.setAttribute('aria-label', 'Reset page zoom');
    badge.addEventListener('click', reset);
    document.body.appendChild(badge);
    applyZoom();
    return badge;
  }

  // Wheel/pinch zoom is continuous, so "100%" means rounds to 100%.
  function isDefault() { return Math.round(zoom * 100) === 100; }

  function refreshBadge(flash) {
    if (!document.body) return;
    const b = ensureBadge();
    b.textContent = Math.round(zoom * 100) + '%';
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (isDefault() && !flash) { b.classList.remove('is-visible'); return; }
    b.classList.add('is-visible');
    // At 100% the badge is just transient feedback; otherwise it stays up so
    // the user can see (and click to clear) the active zoom.
    if (isDefault()) {
      hideTimer = setTimeout(() => b.classList.remove('is-visible'), 1200);
    }
  }

  function setZoom(z, flash) {
    const next = clamp(z);
    if (next !== zoom) { zoom = next; persist(); }
    applyZoom();
    refreshBadge(flash !== false);
  }

  // Keyboard steps land on whole 10% increments.
  function zoomIn() { setZoom(Math.round((zoom + STEP) * 10) / 10); }
  function zoomOut() { setZoom(Math.round((zoom - STEP) * 10) / 10); }
  function reset() { setZoom(1); }

  function onKey(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (e.key === '=' || e.key === '+') zoomIn();
    else if (e.key === '-' || e.key === '_') zoomOut();
    else if (e.key === '0') reset();
    else return;
    // The webview host forwards every keydown to VS Code, which would also
    // zoom the whole window (Cmd/Ctrl +/-) or focus the side bar (Cmd/Ctrl 0).
    e.preventDefault();
    e.stopPropagation();
  }

  function onWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    // Let the Mermaid/image overlays handle their own wheel zoom.
    if (e.target && e.target.closest && e.target.closest('.md-mermaid-overlay, .md-img-overlay')) return;
    e.preventDefault();
    // Proportional to the delta: a mouse notch is ~10%, while a trackpad
    // pinch (many small events) zooms smoothly.
    const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    setZoom(zoom * Math.exp(-px / 1000));
  }

  function init() {
    zoom = load();
    applyZoom();
    if (!isDefault()) refreshBadge(false);

    // Re-assert the zoom if anything ever clears <body>'s inline style.
    new MutationObserver(() => {
      if (Math.abs((parseFloat(document.body.style.zoom) || 1) - cssZoom()) > 1e-6) applyZoom();
    }).observe(document.body, { attributes: true, attributeFilter: ['style'] });
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

  // Capture phase on window: runs before anything else sees the keydown.
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('wheel', onWheel, { passive: false });

  window.claudeMdZoom = {
    get: () => zoom,
    setZoom: setZoom,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
    reset: reset,
  };
})();
