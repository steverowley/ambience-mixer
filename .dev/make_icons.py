#!/usr/bin/env python3
"""Render the Ambience PWA icon set with Pillow, matching icon.svg.

No SVG rasteriser is assumed to be present (no cairosvg / ImageMagick /
rsvg on the author's machine), so the same design is drawn directly: a dark
radial field, three concentric rings spreading outward from the centre, and
a glowing accent orb — the app's breathing-orb mark.

Everything is drawn at 4x and downsampled for clean edges.

Usage:  python .dev/make_icons.py
Writes icon-192.png, icon-512.png, icon-maskable-512.png,
apple-touch-icon.png, favicon-32.png and favicon.ico to the repo root.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SS = 4  # supersample factor

BG_IN = (26, 33, 51)     # #1a2133
BG_OUT = (15, 20, 32)    # #0f1420
ACCENT = (138, 180, 201) # #8ab4c9
GLOW = (169, 208, 224)   # #a9d0e0


def radial_bg(size):
    """Dark radial gradient, brighter at 50%/42% — matches the SVG."""
    img = Image.new("RGB", (size, size), BG_OUT)
    px = img.load()
    cx, cy = size * 0.50, size * 0.42
    r_max = size * 0.75
    for y in range(size):
        for x in range(size):
            d = (((x - cx) ** 2 + (y - cy) ** 2) ** 0.5) / r_max
            t = min(1.0, d)
            px[x, y] = tuple(
                round(BG_IN[i] + (BG_OUT[i] - BG_IN[i]) * t) for i in range(3)
            )
    return img


def orb_layer(size):
    """Accent orb with an off-centre highlight, plus a soft outer glow."""
    c = size // 2
    r = round(size * 0.1133)  # 58/512, as in the SVG

    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([c - r, c - r, c + r, c + r], fill=ACCENT + (190,))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.051))

    core = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(core)
    # Concentric fills approximate the SVG's radial gradient (35% 30% origin).
    steps = 48
    hx, hy = c - r * 0.30, c - r * 0.40
    for i in range(steps, 0, -1):
        t = i / steps
        rr = r * t
        col = tuple(round(GLOW[k] + (ACCENT[k] - GLOW[k]) * (1 - t)) for k in range(3))
        d.ellipse([hx - rr, hy - rr, hx + rr, hy + rr], fill=col + (255,))
    # Clip back to a true circle centred on the canvas.
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([c - r, c - r, c + r, c + r], fill=255)
    core.putalpha(
        Image.composite(core.getchannel("A"), Image.new("L", (size, size), 0), mask)
    )
    return glow, core


def build(px, maskable=False):
    size = px * SS
    img = radial_bg(size).convert("RGBA")

    # Maskable icons must keep content inside a safe zone (~80% of the
    # canvas), because launchers crop them to arbitrary shapes.
    scale = 0.78 if maskable else 1.0
    c = size // 2

    rings = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rings)
    width = max(1, round(size * 0.0137 * scale))  # 7/512
    for radius_frac, alpha in ((0.2031, 77), (0.2930, 46), (0.3828, 23)):
        rr = size * radius_frac * scale
        rd.ellipse([c - rr, c - rr, c + rr, c + rr], outline=ACCENT + (alpha,), width=width)
    img = Image.alpha_composite(img, rings)

    glow, core = orb_layer(size)
    if scale != 1.0:
        new = round(size * scale)
        off = (size - new) // 2
        g2 = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        c2 = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        g2.paste(glow.resize((new, new), Image.LANCZOS), (off, off))
        c2.paste(core.resize((new, new), Image.LANCZOS), (off, off))
        glow, core = g2, c2
    img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, core)

    return img.resize((px, px), Image.LANCZOS).convert("RGB")


def main():
    targets = [
        (192, "icon-192.png", False),
        (512, "icon-512.png", False),
        (512, "icon-maskable-512.png", True),
        (180, "apple-touch-icon.png", False),
        (32, "favicon-32.png", False),
    ]
    for px, name, mask in targets:
        build(px, mask).save(ROOT / name, optimize=True)
        print("wrote", name)

    build(64).save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("wrote favicon.ico")


if __name__ == "__main__":
    main()
