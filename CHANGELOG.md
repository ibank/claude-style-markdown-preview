# Changelog

All notable changes to this extension are documented here.

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
