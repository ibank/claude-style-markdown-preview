#!/usr/bin/env python3
"""Render the marketplace icon PNG from the picked SVG concept.

Concepts live in `assets/`:
  - icon-a-terminal.svg  (Terminal Window)
  - icon-b-sigil.svg     (Bold # Sigil)
  - icon-c-paper.svg     (Light/Paper)
  - icon-d-glyph.svg     (M Glyph)  ← shipped

Outputs (project root):
  - icon.png       256x256, used by `package.json` for the marketplace
  - icon-128.png   128x128, kept for documentation/reference

Switch the shipped icon by changing PICK below and re-running:
    python3 scripts/generate_icon.py

Requires `rsvg-convert` on PATH (`brew install librsvg`). Falls back to
ImageMagick (`magick` or `convert`) if rsvg-convert is missing — but
ImageMagick's built-in SVG renderer mishandles gradients, so the result
will look broken for Option D.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

# Pick which concept ships as the marketplace icon.
PICK = "icon-d-glyph.svg"

OUTPUTS = [
    ("icon.png", 256),
    ("icon-128.png", 128),
]


def find_renderer() -> tuple[str, list[str]] | None:
    """Return (kind, command_prefix) for the best available SVG rasteriser."""
    if shutil.which("rsvg-convert"):
        return ("rsvg", ["rsvg-convert"])
    if shutil.which("magick"):
        return ("magick", ["magick"])
    if shutil.which("convert"):
        return ("magick", ["convert"])
    return None


def render(svg: Path, png: Path, size: int, kind: str, cmd_prefix: list[str]) -> None:
    if kind == "rsvg":
        cmd = cmd_prefix + ["-w", str(size), "-h", str(size), "-o", str(png), str(svg)]
    else:  # ImageMagick
        cmd = cmd_prefix + [
            "-background", "none",
            "-density", "600",
            str(svg),
            "-resize", f"{size}x{size}",
            str(png),
        ]
    subprocess.run(cmd, check=True)
    print(f"  {png.relative_to(ROOT)}  ({size}x{size})")


def main() -> int:
    svg = ASSETS / PICK
    if not svg.exists():
        print(f"error: missing {svg}", file=sys.stderr)
        return 1

    found = find_renderer()
    if found is None:
        print(
            "error: no SVG renderer found.\n"
            "       install librsvg (recommended): brew install librsvg\n"
            "       or ImageMagick:                brew install imagemagick",
            file=sys.stderr,
        )
        return 1

    kind, cmd_prefix = found
    print(f"rendering {PICK} via {kind}")
    for name, size in OUTPUTS:
        render(svg, ROOT / name, size, kind, cmd_prefix)
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
