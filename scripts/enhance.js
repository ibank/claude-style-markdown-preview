// Claude Style Markdown Preview — DOM enhancements
// Runs in the VS Code markdown preview webview after VS Code renders the body.
//
// Adds: heading anchor links · code-block chrome (lang pill + copy button) ·
//       admonitions (GitHub-flavored [!NOTE] etc.) · reading progress bar ·
//       click-to-zoom images · floating TOC sidebar.
//
// Defensive against VS Code's body re-renders on every edit:
// MutationObserver re-applies enhancements idempotently to new content.

(function () {
  const PROCESSED = 'data-claude-enhanced';
  let scheduled = false;

  // ─────────────────────────────────────────────────────────────────────
  // Heading anchors — ¶ icon on hover, click to copy #id
  // ─────────────────────────────────────────────────────────────────────

  function slugify(text) {
    return String(text)
      .toLowerCase()
      .trim()
      .replace(/[\s ]+/g, '-')
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

  function enhanceHeadings() {
    const used = new Set();
    document.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]').forEach(h => used.add(h.id));

    document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
      if (h.hasAttribute(PROCESSED)) return;
      h.setAttribute(PROCESSED, 'h');

      if (!h.id) {
        const text = (h.textContent || '').trim();
        h.id = ensureUniqueId(slugify(text), used);
      } else {
        used.add(h.id);
      }

      const a = document.createElement('a');
      a.className = 'md-anchor';
      a.href = '#' + h.id;
      a.setAttribute('aria-label', 'Copy link to ' + (h.textContent || '').trim());
      a.title = 'Click to copy link';
      a.textContent = '¶';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        const url = location.href.split('#')[0] + '#' + h.id;
        copyText(url).then(function () {
          a.classList.add('is-copied');
          setTimeout(function () { a.classList.remove('is-copied'); }, 1400);
        });
        if (history.replaceState) history.replaceState(null, '', '#' + h.id);
      });
      h.appendChild(a);
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Code blocks — wrap in chrome with language pill + copy button
  // ─────────────────────────────────────────────────────────────────────

  // Skip mermaid (handled by mermaid-init.js) and already-wrapped blocks.
  function isMermaidBlock(code) {
    if (code.classList.contains('language-mermaid')) return true;
    if (code.hasAttribute('data-mermaid-processed')) return true;
    const txt = (code.textContent || '').trim();
    return /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|sankey|xychart-beta|block-beta)\b/.test(txt);
  }

  function detectLanguage(code) {
    for (const cls of code.classList) {
      const m = /^language-(\S+)$/.exec(cls);
      if (m) return m[1];
    }
    const dl = code.getAttribute('data-language');
    if (dl) return dl;
    return '';
  }

  function enhanceCodeBlocks() {
    document.querySelectorAll('pre > code').forEach((code) => {
      const pre = code.parentElement;
      if (!pre || pre.hasAttribute(PROCESSED)) return;
      if (pre.parentElement && pre.parentElement.classList.contains('md-code-wrap')) {
        pre.setAttribute(PROCESSED, 'pre');
        return;
      }
      if (isMermaidBlock(code)) return;
      pre.setAttribute(PROCESSED, 'pre');

      const lang = detectLanguage(code);

      const wrap = document.createElement('div');
      wrap.className = 'md-code-wrap';

      const chrome = document.createElement('div');
      chrome.className = 'md-code-chrome';

      const pill = document.createElement('span');
      pill.className = 'md-code-lang-pill';
      pill.textContent = lang || 'plain';
      chrome.appendChild(pill);

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'md-code-copy';
      copyBtn.title = 'Copy code';
      copyBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3" width="6.5" height="6.5" rx="1"/><path d="M3 7.5V2.5A.5.5 0 0 1 3.5 2h5"/></svg><span>Copy</span>';
      copyBtn.addEventListener('click', function () {
        copyText(code.textContent || '').then(function () {
          copyBtn.classList.add('is-copied');
          copyBtn.querySelector('span').textContent = 'Copied';
          setTimeout(function () {
            copyBtn.classList.remove('is-copied');
            copyBtn.querySelector('span').textContent = 'Copy';
          }, 1400);
        });
      });
      chrome.appendChild(copyBtn);

      // Insert: <wrap><chrome/><pre/></wrap>
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(chrome);
      wrap.appendChild(pre);
    });
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
  const ADMON_RE = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER)\]\s*(.*)$/i;

  function enhanceAdmonitions() {
    document.querySelectorAll('blockquote').forEach((bq) => {
      if (bq.hasAttribute(PROCESSED)) return;
      const firstP = bq.querySelector(':scope > p');
      if (!firstP) return;

      // The marker can be the entire firstChild text node or split by <br>.
      const firstText = (firstP.textContent || '').split('\n')[0];
      const m = ADMON_RE.exec(firstText);
      if (!m) return;

      const type = m[1].toUpperCase();
      const meta = ADMON_TYPES[type];
      if (!meta) return;

      bq.setAttribute(PROCESSED, 'admon');
      bq.classList.add('md-admon', meta.cls);

      // Strip the marker token from the first paragraph.
      // Walk the first paragraph's child nodes and remove the marker text.
      const childNodes = Array.from(firstP.childNodes);
      let stripped = false;
      for (const node of childNodes) {
        if (stripped) break;
        if (node.nodeType === Node.TEXT_NODE) {
          const newText = node.textContent.replace(ADMON_RE, '$2');
          if (newText !== node.textContent) {
            node.textContent = newText;
            stripped = true;
          }
        }
      }
      // If marker took the whole first paragraph and nothing else follows on that
      // line, remove the now-empty paragraph entirely.
      if (firstP.textContent.trim() === '') firstP.remove();

      // Build the title row.
      const title = document.createElement('div');
      title.className = 'md-admon-title';
      const icon = document.createElement('span');
      icon.className = 'md-admon-icon';
      icon.textContent = meta.icon;
      title.appendChild(icon);
      const label = document.createElement('span');
      label.textContent = meta.label;
      title.appendChild(label);
      bq.insertBefore(title, bq.firstChild);
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Reading progress bar
  // ─────────────────────────────────────────────────────────────────────

  let progressEl = null;
  let progressFill = null;

  function buildProgress() {
    if (document.querySelector('.md-progress')) {
      progressEl = document.querySelector('.md-progress');
      progressFill = progressEl.querySelector('.md-progress-fill');
      return;
    }
    progressEl = document.createElement('div');
    progressEl.className = 'md-progress';
    progressFill = document.createElement('div');
    progressFill.className = 'md-progress-fill';
    progressEl.appendChild(progressFill);
    document.body.appendChild(progressEl);
    updateProgress();
  }

  function updateProgress() {
    if (!progressFill) return;
    const doc = document.documentElement;
    const scrolled = window.scrollY || doc.scrollTop;
    const max = (doc.scrollHeight - doc.clientHeight) || 1;
    const pct = Math.min(100, Math.max(0, (scrolled / max) * 100));
    progressFill.style.width = pct.toFixed(2) + '%';
  }

  // ─────────────────────────────────────────────────────────────────────
  // Image zoom — click any inline image for a lightbox
  // ─────────────────────────────────────────────────────────────────────

  function enhanceImages() {
    document.querySelectorAll('img').forEach((img) => {
      if (img.hasAttribute(PROCESSED)) return;
      // Don't zoom the toggle/TOC button icons
      if (img.closest('.md-theme-toggle, .md-toc, .md-toc-toggle, .md-progress, .md-mermaid-bar')) return;
      img.setAttribute(PROCESSED, 'img');
      img.addEventListener('click', function (e) {
        e.preventDefault();
        showImageOverlay(img.src, img.alt);
      });
    });

    // Auto-wrap images-with-alt as <figure> with caption
    document.querySelectorAll('p > img[alt]:only-child').forEach((img) => {
      if (img.parentElement.hasAttribute(PROCESSED + '-fig')) return;
      const p = img.parentElement;
      if (!img.alt || !img.alt.trim()) return;
      p.setAttribute(PROCESSED + '-fig', '1');
      const fig = document.createElement('figure');
      fig.className = 'md-figure';
      fig.appendChild(img.cloneNode(true));
      const cap = document.createElement('figcaption');
      cap.className = 'md-figcaption';
      cap.textContent = img.alt;
      fig.appendChild(cap);
      p.replaceWith(fig);
      // Re-attach zoom on the cloned img
      const newImg = fig.querySelector('img');
      newImg.setAttribute(PROCESSED, 'img');
      newImg.addEventListener('click', function (e) {
        e.preventDefault();
        showImageOverlay(newImg.src, newImg.alt);
      });
    });
  }

  function showImageOverlay(src, alt) {
    const overlay = document.createElement('div');
    overlay.className = 'md-img-overlay';
    overlay.innerHTML = '<img src="' + escapeAttr(src) + '" alt="' + escapeAttr(alt || '') + '">';
    overlay.addEventListener('click', function () { overlay.remove(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
      }
    });
    document.body.appendChild(overlay);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Floating TOC — auto-built from headings, with active-section tracking
  // ─────────────────────────────────────────────────────────────────────

  let tocPanel = null;
  let tocToggleBtn = null;
  let tocLinks = [];

  function buildToc() {
    const headings = Array.from(document.querySelectorAll('h2[id], h3[id], h4[id]'));

    // Strip existing toc and toggle if heading set is empty (e.g. README is short)
    if (headings.length < 2) {
      if (tocPanel) { tocPanel.remove(); tocPanel = null; }
      if (tocToggleBtn) { tocToggleBtn.remove(); tocToggleBtn = null; }
      tocLinks = [];
      return;
    }

    // Toggle button
    if (!tocToggleBtn) {
      tocToggleBtn = document.createElement('button');
      tocToggleBtn.type = 'button';
      tocToggleBtn.className = 'md-toc-toggle';
      tocToggleBtn.title = 'Toggle table of contents';
      tocToggleBtn.setAttribute('aria-label', 'Toggle table of contents');
      tocToggleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 3.5h10M2 7h7M2 10.5h10" stroke-linecap="round"/></svg>';
      tocToggleBtn.addEventListener('click', function () {
        if (!tocPanel) return;
        const open = tocPanel.classList.toggle('is-open');
        tocToggleBtn.classList.toggle('is-active', open);
      });
      document.body.appendChild(tocToggleBtn);
    }

    // Reposition toggle so it doesn't overlap the theme toggle (theme = top-right ~14px)
    tocToggleBtn.style.top = '58px';
    tocToggleBtn.style.right = '18px';

    // Panel
    if (!tocPanel) {
      tocPanel = document.createElement('nav');
      tocPanel.className = 'md-toc';
      tocPanel.setAttribute('aria-label', 'Table of contents');
      document.body.appendChild(tocPanel);
    }

    // Render entries
    tocPanel.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'md-toc-head';
    head.textContent = 'On this page';
    tocPanel.appendChild(head);

    const list = document.createElement('ul');
    list.className = 'md-toc-list';
    tocLinks = [];
    headings.forEach((h) => {
      const li = document.createElement('li');
      li.className = 'lvl-' + h.tagName.charAt(1);
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.dataset.targetId = h.id;
      // Use the heading text minus any anchor link char
      const text = (h.cloneNode(true));
      const anchorInClone = text.querySelector('.md-anchor');
      if (anchorInClone) anchorInClone.remove();
      a.textContent = (text.textContent || '').trim();
      li.appendChild(a);
      list.appendChild(li);
      tocLinks.push({ a: a, li: li, h: h });
    });
    tocPanel.appendChild(list);
  }

  function updateTocActive() {
    if (tocLinks.length === 0) return;
    const yLine = window.scrollY + 120;
    let active = tocLinks[0];
    for (const item of tocLinks) {
      if (item.h.offsetTop <= yLine) active = item;
      else break;
    }
    tocLinks.forEach(function (item) {
      item.li.classList.toggle('is-active', item === active);
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch (_) { return false; }
  }

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Master enhancement pass
  // ─────────────────────────────────────────────────────────────────────

  function enhanceAll() {
    if (!document.body) return;
    enhanceHeadings();
    enhanceCodeBlocks();
    enhanceAdmonitions();
    enhanceImages();
    buildProgress();
    buildToc();
    updateProgress();
    updateTocActive();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; enhanceAll(); }, 60);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceAll);
  } else {
    enhanceAll();
  }

  // VS Code re-renders body on edits
  const observer = new MutationObserver(function (mutations) {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        // Skip our own added nodes to avoid loops
        if (node.classList && (
          node.classList.contains('md-anchor') ||
          node.classList.contains('md-code-wrap') ||
          node.classList.contains('md-progress') ||
          node.classList.contains('md-toc') ||
          node.classList.contains('md-toc-toggle') ||
          node.classList.contains('md-theme-toggle') ||
          node.classList.contains('md-img-overlay') ||
          node.classList.contains('md-admon-title') ||
          node.classList.contains('md-figure') ||
          node.classList.contains('md-mermaid')
        )) continue;
        if (node.matches && node.matches('h1, h2, h3, h4, h5, h6, pre, blockquote, img')) {
          schedule();
          return;
        }
        if (node.querySelector && node.querySelector('h1, h2, h3, h4, h5, h6, pre, blockquote, img')) {
          schedule();
          return;
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Scroll listener for progress bar + active TOC entry
  window.addEventListener('scroll', function () {
    updateProgress();
    updateTocActive();
  }, { passive: true });
})();
