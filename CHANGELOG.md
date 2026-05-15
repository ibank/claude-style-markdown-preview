# Changelog

All notable changes to this extension are documented here.

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
