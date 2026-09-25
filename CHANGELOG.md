# Changelog

All notable changes to this extension are documented here.

## [0.6.0] - 2026-09-25

A security and reliability release after a full review against the current
VS Code preview (1.139). Every fix below was reproduced first in a harness
that mirrors VS Code's preview runtime: async preview scripts, content
injected after load, morphdom updates, and its own code copy buttons.

### Security
- **Mermaid 10.9.1 → 11.17.2.** 10.9.1 is affected by nine published
  advisories: a high-severity prototype pollution in its bundled DOMPurify
  (GHSA-m4gq-x24j-jpmf), sequence-diagram label XSS (GHSA-7rqq-prvp-x9jh),
  state-diagram HTML injection (GHSA-ghcm-xqfw-q4vr), several CSS injection
  issues, and infinite-loop DoS in Gantt and XY charts. v11 also renders the
  newer diagram types (architecture, packet, kanban, radar, treemap, …).
  The 0.3.0 note saying v11 lacks a usable `mermaid` global was wrong: its
  `dist/mermaid.min.js` still defines one.
- highlight.js 11.9.0 → 11.12.0 (grammar fixes; same languages and API).

### Added
- `<body data-claude-theme="light|dark">` reflects the theme actually shown,
  which gives user stylesheets (`markdown.styles`) a reliable hook for
  overriding the `--md-*` tokens. The README's Customization section now
  documents this. The `--claude-orange` variables it used to recommend were
  never used by the stylesheet, so editing them changed nothing.

### Fixed
- **Endless render loop.** A code block in any language whose first word was
  a Mermaid keyword, such as Python `graph = build_graph()`, was treated as a
  diagram and nested a new error box about every 60 ms for as long as the
  preview stayed open. Only ```` ```mermaid ```` fences are rendered now,
  plus unlabeled fences whose first line is a Mermaid header and that parse.
- **Text deleted next to inline images.** "Click the ![gear](…) icon" lost
  its sentence, which was replaced by a captioned figure.
- **Linked images** (badges, logos) opened the lightbox instead of the link.
- **`[!NOTE]` marker still visible** in admonitions that span several lines,
  and a stray blank line when `markdown.preview.breaks` is on.
- **Enhancements vanished after edits.** VS Code updates the preview in place
  and then fires `vscode.markdown.updateContent`. Everything is now
  re-applied synchronously in that event, so heading anchors, admonitions,
  code chrome and diagrams never flash or disappear while you type.
  Diagrams are restored from a cache instead of being re-rendered.
- **Open `<details>` collapsed on every edit**, and embedded media restarted.
  Enhancements are now applied inside the elements VS Code renders rather
  than by wrapping or replacing them, so VS Code can match them in place.
  This also makes edits on long documents about 2.8× faster (127 → 46 ms on a
  2,700-line test document).
- **High Contrast Light** used the dark palette and dark diagrams.
- **Diagrams didn't follow VS Code theme changes** in Auto mode (only the
  toggle re-themed them).
- **Cmd/Ctrl `+` / `-` / `0` zoomed the whole VS Code window too**, or moved
  focus to the side bar, because the webview forwards every keydown.
- **The zoom badge had no theme colors** (bare black text on dark themes).
- **Inline diagram zoom clipped the diagram**. The card now grows and
  scrolls. Fullscreen pan and zoom stay accurate under page zoom.
- **Duplicate copy buttons**: VS Code (since mid-2026) adds its own hover
  copy button to code blocks. It's hidden where the chrome bar has one.
- **Late script loads**: highlighting and diagrams no longer depend on
  `highlight.min.js` / `mermaid.min.js` finishing before the other scripts,
  which VS Code doesn't guarantee (they load `async`). Mermaid waits for its
  script instead of giving up after 2 s.
- Front matter keys (VS Code's new front-matter table) are no longer
  uppercased; syntax tokens for symbols, bullets and links got their missing
  color; the heading ¶ link copies `#section` (usable in markdown) instead of
  the webview's internal URL.

### Changed
- Respects VS Code's own **Reduce Motion** setting as well as the OS one.
- Closed TOC, hidden zoom badge and overlays are keyboard- and
  screen-reader-friendly (hidden panels leave the tab order; overlays are
  dialogs that take and return focus).
- Trackpad pinch zoom is proportional (smooth) instead of 10% per event.
- Print ignores the on-screen page zoom and prints High Contrast themes on
  white.
- Internal class names changed: `.md-code-wrap` → `pre.md-code`; diagram
  cards and errors are `pre.md-mermaid` / `pre.md-mermaid-error`.
- Release workflow: Node 24 (Node 20 left GitHub runners on 2026-09-16), the
  current action majors, and pinned vsce 4.0.0 / ovsx 1.2.0. The optional
  Marketplace / Open VSX publish steps could never run and now work when
  their secrets are set.

## [0.5.1] - 2026-05-24

### Fixed
- **No more language auto-detection** ([#1](https://github.com/ibank/claude-style-markdown-preview/issues/1))
  — 0.5.0 ran `highlightAuto` on fences without a language, which misfired on
  plain-text / ASCII-diagram blocks (e.g. tagging them as SCSS and coloring
  them). Code is now highlighted only when the fence specifies a language
  highlight.js recognizes; unlabeled blocks stay plain text.

## [0.5.0] - 2026-05-24

### Added
- **Syntax highlighting** ([#1](https://github.com/ibank/claude-style-markdown-preview/issues/1))
  — code blocks are now highlighted with a Claude-themed palette (warm tones for
  dark, deep earthy tones for light) instead of relying on VS Code's built-in
  highlighting, which doesn't reliably produce tokens in the preview. Bundles
  highlight.js v11.9.0 (common languages, BSD-3-Clause) and re-highlights each
  block in `enhance.js`; unlabeled blocks get an auto-detected language shown in
  the chrome pill. Colors follow the active theme via `--md-hl-*` tokens.

## [0.4.1] - 2026-05-24

### Fixed
- **Packaging hygiene** — `.gstack/` and `.harness/` (local dev/debug scratch
  dirs) are now excluded via `.vscodeignore`, so they no longer get bundled into
  the published `.vsix`. 0.4.0 accidentally shipped ~5 KB of harmless browse
  debug logs.

### Docs
- README publish step uses `npx @vscode/vsce` (the maintained package) instead
  of the deprecated `npx vsce`.

## [0.4.0] - 2026-05-24

Interactive zoom: zoom the whole preview like a browser, and pan/zoom Mermaid
diagrams in fullscreen.

### Added
- **Whole-page zoom** — `Cmd/Ctrl` + `+` / `-` / `0` and `Cmd/Ctrl` + mouse
  wheel (including macOS trackpad pinch) zoom the entire preview. Level is
  clamped to 50%–300%, persists across edits/reopens, and a bottom-center pill
  shows the current level (click it to reset). New `scripts/page-zoom.js`.
- **Pan & zoom in the Mermaid fullscreen view** — mouse-wheel zoom anchored to
  the cursor, click-drag panning, and zoom-in / zoom-out / reset buttons in the
  toolbar (zoom clamped to 0.4×–6×). The inline diagram toolbar already had
  button zoom; fullscreen now matches and adds wheel + drag.

### Fixed
- **Google Fonts `@import` was being ignored since 0.3.0** — it sat after the
  bundled-Pretendard `@font-face`, but the CSS spec requires `@import` to
  precede all other rules, so Source Sans 3 / Source Serif 4 / JetBrains Mono
  silently fell back to system fonts. Moved the `@import` ahead of `@font-face`.

## [0.3.0] - 2026-05-19

A maintenance + reliability release after a fresh review against current best
practices. No visual changes; payload trimmed and edge cases tightened.

### Added
- **Pretendard Variable bundled locally** (`fonts/PretendardVariable.woff2`,
  ~2.0 MB woff2) — Hangul rendering now works offline and is immune to
  webview CSP / `markdown.preview.security` settings that block CDN fetches.
  Source Sans / Source Serif / JetBrains Mono still come from Google Fonts via
  `@import` with `display: swap` and have system-font fallbacks in the stack.
- `@media (prefers-reduced-motion: reduce)` — disables every CSS transition
  and animation when the user has opted in to OS-level motion reduction.
- `print-color-adjust: exact` on `@media print` — preserves admonition,
  syntax-highlight, and accent colors when saving to PDF.

### Fixed
- **`keydown` listener leak** in the image lightbox and Mermaid fullscreen
  overlays. Closing via click (not `Esc`) was leaving the listener attached;
  opening N times accumulated N handlers. Both overlays now share a single
  `close()` that removes the listener regardless of close path.

### Changed
- `engines.vscode` bumped `^1.74.0` → `^1.95.0` (Nov 2022 → Oct 2024).
  The contribution points used (`markdown.previewStyles`,
  `markdown.previewScripts`) have been stable across this range — the bump
  just signals that we don't claim compatibility with ancient VS Code.
- `@vscode/vsce` devDep bumped `^3.2.0` → `^3.6.0`.
- `.vscodeignore` now excludes `.github/`, `assets/` (icon exploration SVGs),
  and the dev-only icon source — trims the published `.vsix` of ~8 KB of
  unreferenced files.

### Investigated, intentionally not done
- **Mermaid v10.9.1 → v11.x**: v11 (currently 11.15.0) no longer ships a
  UMD bundle with a `mermaid` global. The published `dist/mermaid.min.js`
  stores its API in an internal `__esbuild_esm_mermaid_nm` registry that
  is not part of the documented surface. The only stable v11 distribution
  is the ESM build, which VS Code's `markdown.previewScripts` contribution
  point cannot load (no `type="module"` support). Staying on v10.9.1 until
  Mermaid restores a stable global export or VS Code supports module
  scripts in preview contributions.

## [0.2.1] - 2026-05-15

### Changed
- **Marketplace icon** replaced with the "Glyph" concept (Option D from the icon exploration): solid Claude-orange gradient tile with a single rounded `M` glyph and a terminal underscore cursor. Better legibility at marketplace thumbnail sizes (32 / 24 px) and stronger brand presence next to typical blue/grey extension icons.
- Icon generator (`scripts/generate_icon.py`) rewritten to rasterise from SVG via `rsvg-convert` (with ImageMagick fallback). Source SVGs for all four explored concepts are kept in `assets/` so the shipped icon can be swapped by changing one constant and re-running the script.

## [0.2.0] - 2026-05-15

A major UX overhaul based on the "Refined Claude" design direction — hybrid
typography, six new in-preview features, and Korean-first font fallback.

### Added
- **Hybrid typography**: serif headings (Source Serif 4) + sans body (Source Sans 3) + monospace code (JetBrains Mono), matching the Claude.ai web aesthetic.
- **Hangul fallback**: Pretendard Variable kicks in per-glyph for Korean text across all stacks (sans / serif / mono).
- **Heading anchors**: `¶` icon appears on heading hover; click copies the deep-link URL to clipboard.
- **Code-block chrome**: every fenced block gets a chrome bar with a language pill and a Copy button (with success state).
- **GitHub-flavored admonitions**: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`, `> [!DANGER]` blockquotes render as colored callouts with title + icon.
- **Reading progress bar**: thin orange-glow line at the top of the viewport tracks scroll position.
- **Floating TOC**: auto-built from `h2`–`h4` headings, slide-in panel with active-section highlighting; toggle button in the top-right.
- **Image zoom**: click any image to open a darkened lightbox; click anywhere or press `Esc` to close. Images with alt text auto-render as captioned `<figure>`.
- **Mermaid toolbar**: zoom in/out/reset, copy SVG, and fullscreen actions on every diagram.
- **Print styles**: dedicated `@media print` rules — hides chrome (toggle/TOC/progress/copy buttons), inlines link targets, and respects page breaks.

### Changed
- **Theme toggle redesigned** as a segmented Auto/Light/Dark pill with SVG icons and ARIA `radiogroup` semantics (keyboard arrows navigate). Replaces the cycling text button.
- **Color tokens expanded**: separate variables for elevated surfaces, hover states, accent glow, link underline, code chrome background, plus tone-specific palettes for note/tip/warn/danger admonitions.
- **Typography refined**: tightened heading line-height and letter-spacing; improved spacing between blocks.
- **Tables**: rounded corners, subtle row hover, uppercase-tracked headers in muted text.

### Internal
- New `scripts/enhance.js` consolidates the six DOM enhancements (anchors, code chrome, admonitions, progress, image zoom, TOC).
- `mermaid-init.js` now wraps each diagram in `.md-mermaid` with a `.md-mermaid-bar` toolbar.
- `theme-toggle.js` builds segmented pill markup with proper ARIA and keyboard navigation.

## [0.1.1] - 2026-05-15

### Security
- Mermaid `securityLevel` changed from `'loose'` to `'antiscript'` — strips `<script>` tags and inline event handlers from diagram labels, preventing XSS via crafted markdown.

### Changed
- Categories changed from `["Themes", "Other"]` to `["Other", "Visualization"]` (this is not a color theme).
- Primary README is now in English; Korean version moved to `README.ko.md`.

### Added
- `THIRD_PARTY_NOTICES.md` documenting the bundled Mermaid v10.9.1 (MIT) attribution.
- Security section in README.

## [0.1.0] - 2026-05-15

### Added
- Light/Dark theme toggle button (Auto / Light / Dark) in the preview's top-right corner
- Theme preference persisted via `localStorage`
- Mermaid diagram support (v10.9.1, bundled locally)
- Forced theme classes (`claude-force-light` / `claude-force-dark`) override VS Code theme
- Mermaid auto re-render on theme change
- `mermaid.parse()` pre-validation to prevent stray error SVGs in the DOM
- Cleanup of orphan mermaid render containers

### Changed
- Renamed extension to **Claude Style Markdown Preview**

## [0.0.1] - 2026-05-15

### Added
- Initial release: Claude Code-inspired monospace markdown preview styling
- Dark/light theme adaptive CSS (follows VS Code theme)
- Custom styles for headings, code blocks, blockquotes, tables, lists, kbd, and more
- Warm orange accent color (`#d97757`) matching Claude branding
