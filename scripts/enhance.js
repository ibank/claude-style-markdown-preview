// Claude Style Markdown Preview — DOM enhancements
// Runs in the VS Code markdown preview webview.
//
// Adds: heading anchor links · code-block chrome (language pill + copy
//       button) with Claude-themed syntax highlighting · admonitions
//       (GitHub-flavored [!NOTE] etc.) · reading progress bar ·
//       click-to-zoom images and captioned figures · floating TOC sidebar.
//
// VS Code patches the rendered markdown in place (morphdom) on every edit,
// which strips these enhancements from any element it touches, and then
// fires `vscode.markdown.updateContent`. Everything is re-applied
// synchronously in that event — before the next paint — so edits never flash
// un-enhanced content. A MutationObserver covers the initial load. Every
// enhancement is idempotent.

(function () {
  const PROCESSED = 'data-claude-enhanced';
  const SCRIPT_DIR = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '');

  function contentRoot() {
    return document.querySelector('.markdown-body') || document.body;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Heading anchors — ¶ icon on hover, click to copy the #fragment
  // ─────────────────────────────────────────────────────────────────────

  function slugify(text) {
    return String(text)
      .toLowerCase()
      .trim()
      .replace(/[\s ]+/g, '-')
      .replace(/[^\p{Letter}\p{Number}\-_]+/gu, '')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'section';
  }

  function ensureUniqueId(base, used) {
    if (!used.has(base)) { used.add(base); return base; }
    let n = 2;
    while (used.has(base + '-' + n)) n++;
    const id = base + '-' + n;
    used.add(id);
    return id;
  }

  function headingText(h) {
    const clone = h.cloneNode(true);
    clone.querySelectorAll('.md-anchor').forEach((a) => a.remove());
    return (clone.textContent || '').trim();
  }

  function enhanceHeadings(root) {
    const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .filter((h) => !h.closest('.md-mermaid'));
    const used = new Set(headings.filter((h) => h.id).map((h) => h.id));

    headings.forEach((h) => {
      if (h.hasAttribute(PROCESSED)) return;
      h.setAttribute(PROCESSED, 'h');
      // VS Code assigns GitHub-style ids; this only covers raw-HTML headings.
      if (!h.id) h.id = ensureUniqueId(slugify(headingText(h)), used);

      const a = document.createElement('a');
      a.className = 'md-anchor';
      a.href = '#' + h.id;
      a.title = 'Copy link to this section';
      a.setAttribute('aria-label', 'Copy link to section: ' + headingText(h));
      a.textContent = '¶';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        // The webview's own URL is meaningless outside the preview; the
        // fragment is what a markdown link needs: [text](#section).
        copyText('#' + h.id).then((ok) => { if (ok) flash(a, 'is-copied'); });
      });
      h.appendChild(a);
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Code blocks — chrome with language pill + copy button, highlighting
  // ─────────────────────────────────────────────────────────────────────

  const COPY_ICON = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="3" y="3" width="6.5" height="6.5" rx="1"/><path d="M3 7.5V2.5A.5.5 0 0 1 3.5 2h5"/></svg>';
  const HL_CACHE_MAX = 200;
  const hlCache = new Map(); // language + '\n' + source -> highlighted HTML

  function detectLanguage(code) {
    for (const cls of code.classList) {
      const m = /^language-(\S+)$/.exec(cls);
      if (m) return m[1];
    }
    return code.getAttribute('data-language') || '';
  }

  // Highlight with the bundled highlight.js, but only when the fence names a
  // language it knows. No auto-detection: highlightAuto misfires on plain
  // text / ASCII diagrams. Re-highlighting from textContent keeps the output
  // consistent (and themed by --md-hl-*) whether or not VS Code highlighted.
  // Results are cached because VS Code re-creates blocks on every edit.
  function highlightCode(code) {
    if (code.hasAttribute('data-claude-hl') || typeof hljs === 'undefined') return;
    const lang = detectLanguage(code);
    if (!lang || !hljs.getLanguage(lang)) return;
    const raw = code.textContent || '';
    const key = lang + '\n' + raw;
    let html = hlCache.get(key);
    if (html === undefined) {
      try {
        html = hljs.highlight(raw, { language: lang, ignoreIllegals: true }).value;
      } catch (_) {
        return; // leave as-is
      }
      if (hlCache.size >= HL_CACHE_MAX) hlCache.delete(hlCache.keys().next().value);
      hlCache.set(key, html);
    }
    code.innerHTML = html;
    code.classList.add('hljs');
    code.setAttribute('data-claude-hl', '1');
  }

  // The chrome bar goes *inside* the <pre> (which becomes the card) rather
  // than in a wrapper: VS Code's morphdom update can then match the <pre>
  // one-to-one, instead of rebuilding everything after the first wrapped
  // block on every edit (which also collapsed open <details>, restarted
  // media, and cost ~50 ms per edit on long documents).
  function enhanceCodeBlocks(root) {
    root.querySelectorAll('pre > code').forEach((code) => {
      const pre = code.parentElement;
      // mermaid-init.js owns ```mermaid fences and turns them into cards.
      if (code.classList.contains('language-mermaid') || pre.matches('.md-mermaid, .md-mermaid-error')) return;
      if (!pre.hasAttribute(PROCESSED)) {
        pre.setAttribute(PROCESSED, 'pre');
        pre.classList.add('md-code');
        pre.insertBefore(buildChrome(pre, code), pre.firstChild);
      }
      highlightCode(code); // no-op once done; retried after highlight.js loads
    });
  }

  function buildChrome(pre, code) {
    const chrome = document.createElement('div');
    chrome.className = 'md-code-chrome';

    const pill = document.createElement('span');
    pill.className = 'md-code-lang-pill';
    pill.textContent = pre.classList.contains('frontmatter') ? 'front matter' : (detectLanguage(code) || 'plain');

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'md-code-copy';
    copyBtn.title = 'Copy code';
    copyBtn.innerHTML = COPY_ICON + '<span>Copy</span>';
    const copyLabel = copyBtn.querySelector('span');
    copyBtn.addEventListener('click', () => {
      copyText(code.textContent || '').then((ok) => {
        if (!ok) return;
        copyLabel.textContent = 'Copied';
        flash(copyBtn, 'is-copied', () => { copyLabel.textContent = 'Copy'; });
      });
    });

    chrome.append(pill, copyBtn);
    return chrome;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Admonitions — GitHub-flavored: > [!NOTE] / [!TIP] / [!IMPORTANT] /
  //                                 [!WARNING] / [!CAUTION] / [!DANGER]
  // ─────────────────────────────────────────────────────────────────────

  const ADMON_TYPES = {
    NOTE:      { cls: 'md-admon-note',      icon: 'i', label: 'Note' },
    TIP:       { cls: 'md-admon-tip',       icon: '✓', label: 'Tip' },
    IMPORTANT: { cls: 'md-admon-important', icon: '!', label: 'Important' },
    WARNING:   { cls: 'md-admon-warning',   icon: '⚠', label: 'Warning' },
    CAUTION:   { cls: 'md-admon-caution',   icon: '⚠', label: 'Caution' },
    DANGER:    { cls: 'md-admon-danger',    icon: '×', label: 'Danger' },
  };
  const ADMON_RE = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER)\](?=\s|$)/i;

  function enhanceAdmonitions(root) {
    root.querySelectorAll('blockquote').forEach((bq) => {
      if (bq.hasAttribute(PROCESSED)) return;
      const first = bq.firstElementChild;
      if (!first || first.tagName !== 'P') return;
      const m = ADMON_RE.exec(first.textContent || '');
      if (!m) return;
      const meta = ADMON_TYPES[m[1].toUpperCase()];

      bq.setAttribute(PROCESSED, 'admon');
      bq.classList.add('md-admon', meta.cls);
      stripMarker(first);

      const title = document.createElement('div');
      title.className = 'md-admon-title';
      const icon = document.createElement('span');
      icon.className = 'md-admon-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = meta.icon;
      const label = document.createElement('span');
      label.textContent = meta.label;
      title.append(icon, label);
      bq.insertBefore(title, bq.firstChild);
    });
  }

  // Remove the `[!TYPE]` marker and the line break after it from the start
  // of the paragraph — a newline in the text, or a <br> when
  // markdown.preview.breaks is on — and drop the paragraph if nothing is left.
  function stripMarker(p) {
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && !node.nodeValue.trim()) node = walker.nextNode();
    if (node) {
      node.nodeValue = node.nodeValue.replace(/^\s*\[![A-Za-z]+\][^\S\r\n]*(\r?\n)?/, '');
      if (!node.nodeValue.trim()) {
        let next = node.nextSibling;
        while (next && next.nodeType === Node.TEXT_NODE && !next.nodeValue.trim()) next = next.nextSibling;
        if (next && next.nodeName === 'BR') next.remove();
        node.remove();
      }
    }
    if (!p.textContent.trim() && !p.querySelector(':not(br)')) p.remove();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Images — click to zoom, captioned figures
  // ─────────────────────────────────────────────────────────────────────

  function hasOwnText(el) {
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE && n.nodeValue.trim()) return true;
    }
    return false;
  }

  function enhanceImages(root) {
    root.querySelectorAll('img').forEach((img) => {
      if (img.hasAttribute(PROCESSED) || img.closest('.md-mermaid, .md-img-overlay')) return;
      img.setAttribute(PROCESSED, 'img');
      if (img.closest('a[href]')) return; // linked images (badges, logos) keep their link
      img.classList.add('md-zoomable');
      img.addEventListener('click', (e) => {
        e.preventDefault();
        showImageOverlay(img);
      });
    });

    // An image alone in its paragraph is a block image; with alt text the
    // paragraph becomes a captioned figure. It stays a <p> (see
    // enhanceCodeBlocks for why). Images inline with text stay inline.
    root.querySelectorAll('p > img:only-child').forEach((img) => {
      const p = img.parentElement;
      if (hasOwnText(p)) return;
      const alt = (img.getAttribute('alt') || '').trim();
      if (!alt) {
        img.classList.add('md-block-img');
        return;
      }
      p.classList.add('md-figure');
      const cap = document.createElement('span');
      cap.className = 'md-figcaption';
      cap.setAttribute('aria-hidden', 'true'); // repeats the alt text
      cap.textContent = alt;
      p.appendChild(cap);
    });
  }

  function showImageOverlay(img) {
    if (document.querySelector('.md-img-overlay')) return;
    const previousFocus = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'md-img-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', img.alt ? 'Image: ' + img.alt : 'Image');
    overlay.tabIndex = -1;
    const big = document.createElement('img');
    big.src = img.currentSrc || img.src;
    big.alt = img.alt || '';
    overlay.appendChild(big);

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      // Keep VS Code (which receives every webview keydown) out of it.
      e.preventDefault();
      e.stopPropagation();
      close();
    }
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    overlay.focus({ preventScroll: true });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Floating TOC — built from h2–h4, with active-section tracking
  // ─────────────────────────────────────────────────────────────────────

  let tocPanel = null;
  let tocToggleBtn = null;
  let tocLinks = [];
  let tocSignature = '';
  let tocActive = null;

  function setTocOpen(open) {
    tocPanel.classList.toggle('is-open', open);
    tocToggleBtn.classList.toggle('is-active', open);
    tocToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function buildToc(root) {
    const headings = Array.from(root.querySelectorAll('h2[id], h3[id], h4[id]'))
      .filter((h) => !h.closest('.md-mermaid'));

    // Not worth a TOC for short documents.
    if (headings.length < 2) {
      if (tocPanel) { tocPanel.remove(); tocPanel = null; }
      if (tocToggleBtn) { tocToggleBtn.remove(); tocToggleBtn = null; }
      tocLinks = [];
      tocSignature = '';
      tocActive = null;
      return;
    }

    if (!tocPanel || !tocPanel.isConnected) {
      tocPanel = document.createElement('nav');
      tocPanel.className = 'md-toc';
      tocPanel.id = 'md-toc-panel';
      tocPanel.setAttribute('aria-label', 'Table of contents');
      document.body.appendChild(tocPanel);
      tocSignature = '';
    }
    if (!tocToggleBtn || !tocToggleBtn.isConnected) {
      tocToggleBtn = document.createElement('button');
      tocToggleBtn.type = 'button';
      tocToggleBtn.className = 'md-toc-toggle';
      tocToggleBtn.title = 'Toggle table of contents';
      tocToggleBtn.setAttribute('aria-label', 'Toggle table of contents');
      tocToggleBtn.setAttribute('aria-controls', 'md-toc-panel');
      tocToggleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 3.5h10M2 7h7M2 10.5h10" stroke-linecap="round"/></svg>';
      tocToggleBtn.addEventListener('click', () => {
        if (tocPanel) setTocOpen(!tocPanel.classList.contains('is-open'));
      });
      document.body.appendChild(tocToggleBtn);
    }
    setTocOpen(tocPanel.classList.contains('is-open'));

    const items = headings.map((h) => ({ h: h, level: h.tagName.charAt(1), text: headingText(h) }));
    const signature = items.map((i) => i.level + '#' + i.h.id + '\u0000' + i.text).join('\u0001');
    if (signature === tocSignature) {
      // Same outline; the heading elements themselves may have been replaced.
      items.forEach((item, i) => { tocLinks[i].h = item.h; });
      return;
    }
    tocSignature = signature;
    tocActive = null;

    const head = document.createElement('div');
    head.className = 'md-toc-head';
    head.textContent = 'On this page';

    const list = document.createElement('ul');
    list.className = 'md-toc-list';
    tocLinks = items.map((item) => {
      const li = document.createElement('li');
      li.className = 'lvl-' + item.level;
      const a = document.createElement('a');
      a.href = '#' + item.h.id;
      a.textContent = item.text;
      li.appendChild(a);
      list.appendChild(li);
      return { li: li, h: item.h };
    });
    tocPanel.replaceChildren(head, list);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Reading progress bar + active TOC entry (one rAF-batched scroll pass)
  // ─────────────────────────────────────────────────────────────────────

  let progressFill = null;

  function buildProgress() {
    if (progressFill && progressFill.isConnected) return;
    let bar = document.querySelector('.md-progress');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'md-progress';
      bar.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('div');
      fill.className = 'md-progress-fill';
      bar.appendChild(fill);
      document.body.appendChild(bar);
    }
    progressFill = bar.querySelector('.md-progress-fill');
  }

  function updateScrollUI() {
    // Reads first…
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const pct = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;

    let active = null;
    if (tocLinks.length) {
      // Heading positions come from getBoundingClientRect, which is right
      // under page zoom and for headings nested in positioned blocks. The
      // threshold is 120 CSS px of the (possibly zoomed) body.
      const body = document.body;
      const scale = body.clientWidth ? body.getBoundingClientRect().width / body.clientWidth : 1;
      const threshold = 120 * scale;
      active = tocLinks[0];
      for (const item of tocLinks) {
        const r = item.h.getBoundingClientRect();
        if (!r.width && !r.height) continue; // not rendered (e.g. collapsed <details>)
        if (r.top <= threshold) active = item; else break;
      }
    }

    // …then writes.
    if (progressFill) progressFill.style.width = pct.toFixed(2) + '%';
    if (active !== tocActive) {
      if (tocActive) tocActive.li.classList.remove('is-active');
      if (active) active.li.classList.add('is-active');
      tocActive = active;
    }
  }

  let scrollQueued = false;
  function requestScrollUpdate() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      updateScrollUI();
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────

  const flashTimers = new WeakMap();
  function flash(el, cls, done) {
    clearTimeout(flashTimers.get(el));
    el.classList.add(cls);
    flashTimers.set(el, setTimeout(() => {
      el.classList.remove(cls);
      if (done) done();
    }, 1400));
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

  // previewScripts load `async`, so a sibling bundle may not be available yet.
  function onScriptLoad(file, isReady, callback) {
    if (isReady()) return;
    const script = Array.from(document.scripts)
      .find((s) => SCRIPT_DIR && s.src.split(/[?#]/)[0] === SCRIPT_DIR + file);
    if (script) {
      script.addEventListener('load', () => { if (isReady()) callback(); }, { once: true });
      return;
    }
    let delay = 50, waited = 0;
    (function poll() {
      if (isReady()) { callback(); return; }
      if (waited >= 30000) return;
      waited += delay;
      setTimeout(poll, delay);
      delay = Math.min(delay * 2, 1000);
    })();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Master enhancement pass
  // ─────────────────────────────────────────────────────────────────────

  const RELEVANT = 'h1, h2, h3, h4, h5, h6, pre, blockquote, img';

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.addedNodes) {
        if (node.nodeType === 1 && (node.matches(RELEVANT) || node.querySelector(RELEVANT))) {
          enhanceAll();
          return;
        }
      }
    }
  });

  function enhanceAll() {
    if (!document.body) return;
    const root = contentRoot();
    enhanceHeadings(root);
    enhanceCodeBlocks(root);
    enhanceAdmonitions(root);
    enhanceImages(root);
    buildProgress();
    buildToc(root);
    requestScrollUpdate();
    // Our own DOM changes don't need another pass.
    observer.takeRecords();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceAll);
  } else {
    enhanceAll();
  }
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });

  // Fired by VS Code right after it morphs the preview for an edit.
  window.addEventListener('vscode.markdown.updateContent', enhanceAll);
  window.addEventListener('scroll', requestScrollUpdate, { passive: true });
  window.addEventListener('resize', requestScrollUpdate);
  onScriptLoad('highlight.min.js', () => typeof hljs !== 'undefined', enhanceAll);
})();
