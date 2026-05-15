"""Generate the marketplace icon for Claude Style Markdown Preview.

Outputs:
  - icon.png       (256x256, primary marketplace icon)
  - icon-128.png   (128x128, downscaled for reference)

Design language matches styles/claude.css:
  - background : warm-dark vertical gradient anchored on #1a1a1a
  - accent     : #d97757 (Claude orange) with optical gradient
  - mark       : custom-drawn "M↓" with uniform rounded strokes
                 (NOT typeface text — owns its own silhouette)
"""

from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math
import sys

ROOT = Path(__file__).resolve().parent.parent
RENDER = 2048          # render large then Lanczos-downsample
OUTPUTS = (256, 128)

# Palette (matches styles/claude.css)
BG_TOP        = (38, 32, 28)      # warm-dark top
BG_BOTTOM     = (16, 14, 13)      # near-black bottom
EDGE_LIGHT    = (255, 220, 200, 22)
EDGE_DARK     = (0, 0, 0, 90)
GLOW_ORANGE   = (217, 119, 87)
ORANGE        = (217, 119, 87)
ORANGE_HI     = (240, 160, 120)
ORANGE_LO     = (170, 78, 45)
SHADOW        = (0, 0, 0, 140)


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def squircle_mask(size, n=5.0, inset=0):
    """Soft-cornered superellipse mask — closer to iOS app-icon shape
    than a CSS border-radius. n≈5 gives the familiar Apple squircle."""
    mask = Image.new("L", (size, size), 0)
    half = (size - 1) / 2
    r = half - inset
    # Build polygon points on the superellipse |x/r|^n + |y/r|^n = 1
    pts = []
    steps = 720
    for i in range(steps):
        t = (i / steps) * 2 * math.pi
        c, s = math.cos(t), math.sin(t)
        x = math.copysign(abs(c) ** (2 / n) * r, c)
        y = math.copysign(abs(s) ** (2 / n) * r, s)
        pts.append((half + x, half + y))
    ImageDraw.Draw(mask).polygon(pts, fill=255)
    return mask


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / max(1, size - 1)
        img.putpixel((0, y), (
            int(top[0] + (bottom[0] - top[0]) * t),
            int(top[1] + (bottom[1] - top[1]) * t),
            int(top[2] + (bottom[2] - top[2]) * t),
        ))
    return img.resize((size, size))


def radial_glow(size, cx, cy, radius, color, alpha):
    """Soft radial glow centered at (cx, cy)."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    steps = 24
    for i in range(steps):
        t = i / steps
        r = int(radius * (1 - t))
        a = int(alpha * t * t)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*color, a))
    return layer.filter(ImageFilter.GaussianBlur(radius * 0.35))


# ---------------------------------------------------------------------------
# Custom stroke-based glyphs (no typeface dependency)
# ---------------------------------------------------------------------------

def draw_stroke_path(layer, points, width, fill):
    """Draw a polyline with perfectly round caps & joins by placing a disc
    at each vertex and a rectangle (drawn as a line) between vertices."""
    d = ImageDraw.Draw(layer)
    r = width / 2
    # round joins/caps
    for x, y in points:
        d.ellipse((x - r, y - r, x + r, y + r), fill=fill)
    # straight segments
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        d.line([(x1, y1), (x2, y2)], fill=fill, width=int(width))


def draw_filled_triangle(layer, cx, top_y, width, height, fill):
    """Equilateral-ish arrowhead pointing down, centered horizontally at cx."""
    d = ImageDraw.Draw(layer)
    half = width / 2
    pts = [
        (cx - half, top_y),
        (cx + half, top_y),
        (cx, top_y + height),
    ]
    d.polygon(pts, fill=fill)


def make_mark_layer(size, stroke_color):
    """Render the custom M↓ mark as a single-color silhouette layer."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Geometry — all values normalized to canvas size
    glyph_h = size * 0.52
    stroke  = glyph_h * 0.18           # uniform stroke for M and arrow stem
    m_w     = glyph_h * 1.05           # M is slightly wider than tall

    # Lay M and ↓ on a shared baseline, centered as a group.
    gap     = size * 0.04
    arrow_stem_w = stroke
    arrow_head_w = stroke * 2.40
    arrow_head_h = stroke * 1.80
    arrow_total_h = glyph_h            # match M height

    total_w = m_w + gap + arrow_head_w
    group_left = (size - total_w) / 2
    baseline = (size + glyph_h) / 2 + size * 0.015  # slight optical drop

    # ---- M ----------------------------------------------------------------
    m_left   = group_left + stroke / 2
    m_right  = group_left + m_w - stroke / 2
    m_top    = baseline - glyph_h + stroke / 2
    m_bottom = baseline - stroke / 2
    m_mid_x  = (m_left + m_right) / 2
    # V-tip sits inside the cap-height (~55% down from cap-line)
    m_v_y    = m_top + glyph_h * 0.50

    m_points = [
        (m_left,  m_bottom),
        (m_left,  m_top),
        (m_mid_x, m_v_y),
        (m_right, m_top),
        (m_right, m_bottom),
    ]
    draw_stroke_path(layer, m_points, stroke, stroke_color)

    # ---- ↓ arrow ----------------------------------------------------------
    arrow_cx = group_left + m_w + gap + arrow_head_w / 2
    arrow_top = baseline - arrow_total_h + stroke / 2
    arrow_stem_bottom = baseline - arrow_head_h + stroke * 0.15

    stem_points = [
        (arrow_cx, arrow_top),
        (arrow_cx, arrow_stem_bottom),
    ]
    draw_stroke_path(layer, stem_points, arrow_stem_w, stroke_color)
    draw_filled_triangle(
        layer,
        cx=arrow_cx,
        top_y=arrow_stem_bottom - stroke * 0.1,
        width=arrow_head_w,
        height=arrow_head_h,
        fill=stroke_color,
    )

    return layer


def apply_vertical_gradient_to_silhouette(silhouette, top_color, bottom_color):
    """Recolor an opaque-alpha silhouette using a vertical gradient,
    preserving the existing alpha channel."""
    w, h = silhouette.size
    grad = vertical_gradient(h, top_color, bottom_color).convert("RGBA")
    out = grad.copy()
    out.putalpha(silhouette.split()[3])
    return out


# ---------------------------------------------------------------------------
# Full icon composition
# ---------------------------------------------------------------------------

def draw_icon(size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # 1. Background: warm-dark vertical gradient, masked to squircle
    bg = vertical_gradient(size, BG_TOP, BG_BOTTOM).convert("RGBA")
    mask = squircle_mask(size, n=5.0)
    bg_clipped = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg_clipped.paste(bg, (0, 0), mask)
    canvas.alpha_composite(bg_clipped)

    # 2. Warm orange ambient glow — center-right, behind the mark
    glow = radial_glow(
        size,
        cx=int(size * 0.62), cy=int(size * 0.62),
        radius=int(size * 0.55),
        color=GLOW_ORANGE, alpha=110,
    )
    glow_clipped = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_clipped.paste(glow, (0, 0), mask)
    canvas.alpha_composite(glow_clipped)

    # 3. The mark — drop shadow first, then gradient-filled silhouette
    silhouette_black = make_mark_layer(size, (0, 0, 0, 255))
    shadow_color_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_alpha = silhouette_black.split()[3].point(lambda a: int(a * 0.55))
    shadow_color_layer.paste((0, 0, 0, 255), (0, 0), shadow_alpha)
    shadow_color_layer = shadow_color_layer.filter(
        ImageFilter.GaussianBlur(size * 0.012))
    # offset shadow slightly down-right for top-left light source
    sx, sy = int(size * 0.006), int(size * 0.014)
    canvas.alpha_composite(shadow_color_layer, (sx, sy))

    silhouette = make_mark_layer(size, (255, 255, 255, 255))
    colored = apply_vertical_gradient_to_silhouette(
        silhouette, ORANGE_HI, ORANGE_LO)
    canvas.alpha_composite(colored)

    # 4. Inner highlight on the mark — 1.5% inset, top portion only
    hi_layer = make_mark_layer(size, (255, 255, 255, 255))
    hi_alpha = hi_layer.split()[3]
    # Mask the highlight to the top half only via a vertical falloff
    falloff = Image.new("L", (size, size), 0)
    fd = ImageDraw.Draw(falloff)
    for y in range(size):
        # brightest near 30% from top, fading to 0 by 65%
        t = y / size
        if t < 0.65:
            v = int(max(0, 1 - abs(t - 0.30) / 0.35) * 70)
            fd.line([(0, y), (size, y)], fill=v)
    # combine: highlight where mark exists AND top falloff is bright
    hi_combined = Image.new("L", (size, size), 0)
    hi_combined.paste(falloff, (0, 0), hi_alpha)
    hi_rgba = Image.new("RGBA", (size, size), (255, 220, 200, 0))
    hi_rgba.putalpha(hi_combined)
    canvas.alpha_composite(hi_rgba)

    # 5. Squircle edge treatment — subtle bevel
    edge = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    edge_draw = ImageDraw.Draw(edge)
    half = (size - 1) / 2
    n = 5.0
    # Top half: light ring
    pts_outer, pts_inner = [], []
    steps = 720
    inset = size * 0.004
    for i in range(steps):
        t = (i / steps) * 2 * math.pi
        c, s = math.cos(t), math.sin(t)
        x = math.copysign(abs(c) ** (2 / n) * half, c)
        y = math.copysign(abs(s) ** (2 / n) * half, s)
        pts_outer.append((half + x, half + y))
        x2 = math.copysign(abs(c) ** (2 / n) * (half - inset), c)
        y2 = math.copysign(abs(s) ** (2 / n) * (half - inset), s)
        pts_inner.append((half + x2, half + y2))
    # Draw a thin ring by stroking the outer polygon
    edge_draw.polygon(pts_outer, outline=None, fill=None)
    # Use line-by-line approach: draw outer outline, then erase inner
    edge_outline = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    eo = ImageDraw.Draw(edge_outline)
    eo.polygon(pts_outer, fill=(255, 230, 210, 30))
    eo2 = ImageDraw.Draw(edge_outline)
    eo2.polygon(pts_inner, fill=(0, 0, 0, 0))
    # That doesn't truly erase — use alpha compositing trick instead
    inner_mask = squircle_mask(size, n=5.0, inset=int(inset))
    # Keep outer ring only: outer mask minus inner mask
    outer_mask = squircle_mask(size, n=5.0)
    ring_mask = Image.new("L", (size, size), 0)
    om = outer_mask.load()
    im = inner_mask.load()
    rm = ring_mask.load()
    for y in range(size):
        for x in range(size):
            rm[x, y] = max(0, om[x, y] - im[x, y])

    # Top light ring (upper hemisphere)
    light_ring = Image.new("RGBA", (size, size), (255, 230, 210, 0))
    top_grad = Image.new("L", (size, size), 0)
    tg = ImageDraw.Draw(top_grad)
    for y in range(size):
        t = y / size
        v = int(max(0, (0.5 - t)) * 2 * 70) if t < 0.5 else 0
        tg.line([(0, y), (size, y)], fill=v)
    light_combined = Image.new("L", (size, size), 0)
    light_combined.paste(top_grad, (0, 0), ring_mask)
    light_ring.putalpha(light_combined)
    canvas.alpha_composite(light_ring)

    # Bottom dark ring (softer — was too heavy before)
    dark_ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bot_grad = Image.new("L", (size, size), 0)
    bg2 = ImageDraw.Draw(bot_grad)
    for y in range(size):
        t = y / size
        v = int(max(0, (t - 0.5)) * 2 * 45) if t > 0.5 else 0
        bg2.line([(0, y), (size, y)], fill=v)
    dark_combined = Image.new("L", (size, size), 0)
    dark_combined.paste(bot_grad, (0, 0), ring_mask)
    dark_rgba = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    dark_rgba.putalpha(dark_combined)
    canvas.alpha_composite(dark_rgba)

    # Final clip to squircle (in case any compositing leaked)
    final = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    final.paste(canvas, (0, 0), outer_mask)
    return final


def main():
    big = draw_icon(RENDER)
    for px in OUTPUTS:
        resized = big.resize((px, px), Image.LANCZOS)
        out = ROOT / ("icon.png" if px == 256 else f"icon-{px}.png")
        resized.save(out, "PNG", optimize=True)
        print(f"Wrote {out} ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    sys.exit(main())
