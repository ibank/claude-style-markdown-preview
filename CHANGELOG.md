# Changelog

All notable changes to this extension are documented here.

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
