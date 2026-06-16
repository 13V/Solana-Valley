#!/usr/bin/env python3
"""Procedurally generate Sprout Valley social-brand art (original pixel art).

Outputs (under ./branding):
  - sprout-valley-pfp.png      512x512  farmer avatar (square; reads in a circle)
  - sprout-valley-coin.png     512x512  $SPROUT coin/sprout icon (alt avatar)
  - sprout-valley-banner.png  1500x500  Twitter/X header

All art is original and drawn from code in the game's cozy palette (see
app/src/game/constants.ts). It deliberately does NOT use the licensed Sprout
Lands sprites, which forbid crypto/NFT use (see CREDITS.md).

Usage:  python3 scripts/branding.py
"""
from __future__ import annotations
import math
import os
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "branding")

# --- palette (game colors from constants.ts, plus brand sky/character tones) ---
GRASS       = (0x5f, 0xa6, 0x4d)
GRASS_DARK  = (0x4d, 0x8a, 0x3e)
GRASS_LIGHT = (0x79, 0xc1, 0x61)
GRASS_DEEP  = (0x3a, 0x6e, 0x30)
SOIL        = (0x7a, 0x52, 0x30)
SOIL_DARK   = (0x5e, 0x3f, 0x24)
WATER       = (0x3b, 0x82, 0xc4)

SKY_TOP     = (0x8e, 0xcd, 0xf2)
SKY_MID     = (0xbf, 0xe6, 0xfb)
SKY_LOW     = (0xe9, 0xf7, 0xff)
SUN         = (0xff, 0xe1, 0x8a)
SUN_CORE    = (0xff, 0xf3, 0xcf)
CLOUD       = (0xff, 0xff, 0xff)
CLOUD_SH    = (0xe3, 0xf1, 0xfb)

SKIN        = (0xf2, 0xc9, 0xa0)
SKIN_SH     = (0xdc, 0xa8, 0x82)
CHEEK       = (0xf0, 0xa0, 0xa0)
HAIR        = (0xf2, 0xd9, 0x8b)
HAIR_SH     = (0xd8, 0xb6, 0x5f)
HAT         = (0xe8, 0xc8, 0x7a)
HAT_DARK    = (0xc9, 0xa8, 0x5a)
HAT_BAND    = (0x4d, 0x8a, 0x3e)
SHIRT       = (0x79, 0xc1, 0x61)
SHIRT_SH    = (0x5f, 0xa6, 0x4d)
OVERALL     = (0x5a, 0x6f, 0xb0)
OVERALL_SH  = (0x46, 0x58, 0x92)
INK         = (0x33, 0x2a, 0x3a)

GOLD        = (0xf2, 0xc9, 0x4c)
GOLD_DARK   = (0xc9, 0x9a, 0x2e)
GOLD_LIGHT  = (0xff, 0xe9, 0x9c)
CREAM       = (0xfb, 0xf3, 0xd9)

OUTLINE     = (0x2b, 0x42, 0x2a)  # dark green text outline

WOOD        = (0xb0, 0x6a, 0x43)
WOOD_DARK   = (0x84, 0x4d, 0x2f)
ROOF        = (0x8a, 0x4a, 0x3a)
ROOF_DARK   = (0x6a, 0x37, 0x2b)
WINDOW      = (0xff, 0xd9, 0x6b)


# ---------------------------------------------------------------------------
# tiny pixel canvas: draw on a small base image, scale up with NEAREST (crisp)
# ---------------------------------------------------------------------------
class Canvas:
    def __init__(self, w: int, h: int, bg=None):
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w, h), (0, 0, 0, 0) if bg is None else bg)
        self.d = ImageDraw.Draw(self.img)

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.img.putpixel((int(x), int(y)), c if len(c) == 4 else (*c, 255))

    def rect(self, x, y, w, h, c):
        self.d.rectangle([x, y, x + w - 1, y + h - 1], fill=c)

    def disc(self, cx, cy, r, c):
        self.d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)

    def ellipse(self, x0, y0, x1, y1, c):
        self.d.ellipse([x0, y0, x1, y1], fill=c)

    def poly(self, pts, c):
        self.d.polygon(pts, fill=c)

    def vgrad(self, x, y, w, h, top, bot):
        """Vertical gradient block (per-scanline)."""
        for i in range(h):
            t = i / max(1, h - 1)
            c = tuple(round(top[k] + (bot[k] - top[k]) * t) for k in range(3))
            self.d.rectangle([x, y + i, x + w - 1, y + i], fill=c)

    def scale(self, factor):
        return self.img.resize((self.w * factor, self.h * factor), Image.NEAREST)


# ---------------------------------------------------------------------------
# 5x7 pixel font (uppercase, digits, $ . ! - and space)
# ---------------------------------------------------------------------------
FONT = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "J": ["00111", "00001", "00001", "00001", "10001", "10001", "01110"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10101", "10011", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    "$": ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
}
GLYPH_W, GLYPH_H = 5, 7


def text_width(s, scale=1, spacing=1):
    return len(s) * (GLYPH_W * scale + spacing * scale) - spacing * scale


def draw_text(cv: Canvas, x, y, s, color, scale=1, spacing=1, outline=None,
              shadow=None):
    """Draw a string in the pixel font at (x,y). Optional outline/shadow colors."""
    def stamp(ox, oy, col):
        cx = x + ox
        for ch in s.upper():
            g = FONT.get(ch, FONT[" "])
            for ry in range(GLYPH_H):
                for rx in range(GLYPH_W):
                    if g[ry][rx] == "1":
                        cv.rect(cx + rx * scale, y + oy + ry * scale, scale, scale, col)
            cx += (GLYPH_W + spacing) * scale

    if shadow:
        stamp(scale, scale, shadow)
    if outline:
        for dx, dy in ((-scale, 0), (scale, 0), (0, -scale), (0, scale),
                       (-scale, -scale), (scale, -scale), (-scale, scale), (scale, scale)):
            stamp(dx, dy, outline)
    stamp(0, 0, color)


# ---------------------------------------------------------------------------
# shared motifs
# ---------------------------------------------------------------------------
def draw_sprout(cv, x, y, leaf=GRASS_LIGHT, leaf2=GRASS, stem=GRASS_DARK):
    """A little 2-leaf seedling, ~9 wide x 8 tall, anchored at base (x,y)."""
    cv.rect(x - 1, y - 5, 2, 5, stem)                 # stem
    cv.ellipse(x - 6, y - 9, x - 1, y - 4, leaf)       # left leaf
    cv.ellipse(x + 1, y - 9, x + 6, y - 4, leaf2)      # right leaf
    cv.px(x - 4, y - 7, (255, 255, 255))               # tiny highlights
    cv.px(x + 3, y - 7, (255, 255, 255))


def draw_farmer(cv, cx, baseY, scale=1):
    """Original cozy farmer bust, front-facing. scale multiplies all coords.
    Drawn around horizontal center cx, with feet/cutoff near baseY."""
    def R(x, y, w, h, c):  # scaled rect relative to (cx, baseY)
        cv.rect(cx + x * scale, baseY + y * scale, max(1, w * scale), max(1, h * scale), c)

    def E(x0, y0, x1, y1, c):
        cv.ellipse(cx + x0 * scale, baseY + y0 * scale,
                   cx + x1 * scale, baseY + y1 * scale, c)

    # --- body / overalls (trapezoid) ---
    E(-11, -16, 11, 2, OVERALL)
    R(-11, -16, 22, 14, OVERALL)
    R(-11, -16, 5, 14, OVERALL_SH)        # shaded left side
    # shirt sleeves / collar
    E(-13, -19, -5, -11, SHIRT); E(5, -19, 13, -11, SHIRT)
    R(-4, -19, 8, 4, CREAM)               # collar
    # overall straps
    R(-7, -19, 3, 6, OVERALL); R(4, -19, 3, 6, OVERALL)
    R(-1, -12, 2, 2, GOLD)                # button

    # --- head ---
    E(-9, -34, 9, -16, SKIN)              # face
    E(4, -30, 9, -22, SKIN_SH)            # cheek shade
    # hair tufts under hat
    E(-10, -30, -4, -23, HAIR); E(4, -30, 10, -23, HAIR)
    R(-9, -25, 2, 4, HAIR_SH)
    # cheeks + eyes + smile
    R(-7, -24, 2, 2, CHEEK); R(5, -24, 2, 2, CHEEK)
    R(-5, -27, 2, 2, INK);  R(3, -27, 2, 2, INK)
    R(-2, -22, 4, 1, INK)                 # smile
    R(-2, -23, 1, 1, INK); R(1, -23, 1, 1, INK)

    # --- straw hat ---
    E(-15, -36, 15, -30, HAT)             # brim
    E(-15, -34, 15, -30, HAT_DARK)        # brim underside
    E(-15, -36, 15, -31, HAT)             # brim top (over the shade)
    E(-9, -44, 9, -33, HAT)               # crown
    E(-9, -36, 9, -33, HAT_DARK)
    R(-9, -37, 18, 2, HAT_BAND)           # hat band
    E(-8, -44, 0, -39, (255, 244, 214))   # crown highlight (soft)


# ---------------------------------------------------------------------------
# PFP 1: farmer avatar
# ---------------------------------------------------------------------------
def make_pfp_farmer():
    B, S = 64, 8                          # 64*8 = 512
    cv = Canvas(B, B)
    cx, cy, r = B // 2, B // 2, 31

    # circular badge background: sky gradient inside a green ring
    cv.disc(cx, cy, r + 1, GRASS_DEEP)            # ring
    cv.disc(cx, cy, r - 1, SKY_MID)
    # sky gradient (clipped to circle by redrawing grass mound after)
    for yy in range(cy - r, cy + r):
        t = (yy - (cy - r)) / (2 * r)
        col = tuple(round(SKY_TOP[k] + (SKY_LOW[k] - SKY_TOP[k]) * t) for k in range(3))
        cv.d.rectangle([cx - r, yy, cx + r, yy], fill=col)
    # re-mask to circle: punch transparent corners by drawing ring again over a fresh disc
    mask = Image.new("L", (B, B), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1], fill=255)
    bg = cv.img
    cv.img = Image.new("RGBA", (B, B), (0, 0, 0, 0))
    cv.img.paste(bg, (0, 0), mask)
    cv.d = ImageDraw.Draw(cv.img)
    # green ring outline on top
    cv.d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=GRASS_DEEP, width=2)

    # sun + cloud in the sky
    cv.disc(cx - 17, cy - 17, 5, SUN_CORE)
    cv.disc(cx - 17, cy - 17, 3, SUN)
    cv.ellipse(cx + 6, cy - 20, cx + 18, cy - 14, CLOUD)
    cv.ellipse(cx + 10, cy - 23, cx + 20, cy - 16, CLOUD)

    # grass mound at the bottom of the badge
    cv.ellipse(cx - r, cy + 6, cx + r, cy + r + 14, GRASS)
    cv.ellipse(cx - r, cy + 10, cx + r, cy + r + 16, GRASS_DARK)
    for dx in (-22, -8, 16, 24):                  # little sprouts on the mound
        draw_sprout(cv, cx + dx, cy + 16)

    # the farmer, centered
    draw_farmer(cv, cx + 1, cy + 14, scale=1)

    # re-apply circle mask so anything that spilled stays inside
    out = Image.new("RGBA", (B, B), (0, 0, 0, 0))
    out.paste(cv.img, (0, 0), mask)
    return out.resize((B * S, B * S), Image.NEAREST)


# ---------------------------------------------------------------------------
# PFP 2: $SPROUT coin / sprout icon (alt avatar)
# ---------------------------------------------------------------------------
def make_pfp_coin():
    B, S = 64, 8
    cv = Canvas(B, B)
    cx, cy = B // 2, B // 2

    # soft sky vignette background (square, fills the avatar)
    cv.vgrad(0, 0, B, B, SKY_MID, SKY_LOW)
    cv.disc(cx, cy, 30, (0, 0, 0, 0))   # no-op placeholder

    # coin with a notched/ridged rim
    cv.disc(cx, cy, 27, GOLD_DARK)
    cv.disc(cx, cy, 24, GOLD)
    cv.disc(cx, cy, 21, GOLD_DARK)
    cv.disc(cx, cy, 20, GOLD_LIGHT)
    cv.disc(cx, cy, 18, GOLD)
    # top-left shine
    cv.ellipse(cx - 14, cy - 15, cx - 6, cy - 7, GOLD_LIGHT)
    cv.px(cx - 12, cy - 13, (255, 255, 255)); cv.px(cx - 11, cy - 13, (255, 255, 255))

    # sprout emblem: tall stem, two pointed leaves, apical bud (reads as a plant)
    cv.rect(cx - 1, cy - 7, 3, 18, GRASS_DARK)              # stem
    cv.rect(cx - 1, cy - 7, 1, 18, GRASS)                  # stem highlight
    cv.disc(cx, cy - 9, 2, GRASS_LIGHT)                     # apical bud
    cv.poly([(cx, cy - 2), (cx - 7, cy - 13), (cx - 15, cy - 7), (cx - 6, cy + 2)], GRASS)        # left leaf
    cv.poly([(cx + 1, cy - 2), (cx + 8, cy - 13), (cx + 16, cy - 7), (cx + 7, cy + 2)], GRASS_LIGHT)  # right leaf
    cv.d.line([(cx - 2, cy - 1), (cx - 12, cy - 8)], fill=GRASS_DEEP)   # left vein
    cv.d.line([(cx + 3, cy - 1), (cx + 13, cy - 8)], fill=GRASS)        # right vein
    cv.px(cx - 13, cy - 7, (255, 255, 255))                # leaf-tip glints
    cv.px(cx + 14, cy - 7, (255, 255, 255))
    cv.ellipse(cx - 4, cy + 9, cx + 5, cy + 13, SOIL_DARK)  # soil tuft at base

    return cv.scale(S)


# ---------------------------------------------------------------------------
# Banner (1500x500)
# ---------------------------------------------------------------------------
def make_banner():
    B_W, B_H, S = 375, 125, 4
    cv = Canvas(B_W, B_H)

    # sky
    cv.vgrad(0, 0, B_W, 84, SKY_TOP, SKY_LOW)

    # sun with glow, upper right
    sx, sy = 312, 30
    for rr, a in ((22, 30), (17, 60), (13, 120)):
        glow = Image.new("RGBA", (B_W, B_H), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        gd.ellipse([sx - rr, sy - rr, sx + rr, sy + rr], fill=(*SUN_CORE, a))
        cv.img = Image.alpha_composite(cv.img, glow)
    cv.d = ImageDraw.Draw(cv.img)
    cv.disc(sx, sy, 11, SUN)
    cv.disc(sx, sy, 8, SUN_CORE)

    # clouds
    def cloud(x, y, s=1):
        cv.ellipse(x, y, x + 22 * s, y + 9 * s, CLOUD_SH)
        cv.ellipse(x + 4, y - 4 * s, x + 16 * s, y + 7 * s, CLOUD)
        cv.ellipse(x + 12, y - 2 * s, x + 26 * s, y + 7 * s, CLOUD)
    cloud(40, 22); cloud(150, 14); cloud(235, 34)

    # rolling hills (back -> front), each a sine horizon filled to the bottom
    def hills(amp, base, color, phase, freq):
        for x in range(B_W):
            yy = int(base + amp * math.sin(x * freq + phase))
            cv.d.rectangle([x, yy, x, B_H], fill=color)
    hills(5, 70, GRASS_LIGHT, 0.0, 0.025)
    hills(6, 82, GRASS, 1.6, 0.030)
    hills(5, 95, GRASS_DARK, 3.4, 0.022)

    # cozy cabin on the mid hill
    cxb, cyb = 70, 64
    cv.poly([(cxb - 1, cyb), (cxb + 12, cyb - 9), (cxb + 25, cyb)], ROOF)   # roof
    cv.poly([(cxb + 1, cyb), (cxb + 12, cyb - 7), (cxb + 23, cyb)], ROOF_DARK)
    cv.rect(cxb + 2, cyb, 20, 13, WOOD)
    cv.rect(cxb + 2, cyb, 20, 2, WOOD_DARK)
    cv.rect(cxb + 9, cyb + 5, 6, 8, WOOD_DARK)        # door
    cv.rect(cxb + 4, cyb + 4, 4, 4, WINDOW)           # window
    cv.rect(cxb + 17, cyb + 4, 3, 3, WINDOW)

    # foreground crop rows + fence along the bottom
    cv.rect(0, 110, B_W, B_H - 110, GRASS_DEEP)
    for x in range(6, B_W, 26):
        cv.rect(x, 112, 20, 3, SOIL_DARK)             # soil furrow
        cv.rect(x, 112, 20, 1, SOIL)
    sprout_palettes = [
        (GRASS_LIGHT, GRASS, GRASS_DARK),
        (GRASS_LIGHT, GRASS, GRASS_DARK),
        (GOLD_LIGHT, GOLD, GOLD_DARK),                 # a "gold" rare one
        (GRASS_LIGHT, GRASS, GRASS_DARK),
    ]
    i = 0
    for x in range(14, B_W, 17):
        pal = sprout_palettes[i % len(sprout_palettes)]
        draw_sprout(cv, x, 116, *pal)
        i += 1

    # sparkles / fireflies in the sky
    for (x, y) in [(120, 30), (200, 22), (286, 50), (95, 48), (250, 18), (332, 60)]:
        cv.px(x, y, (255, 255, 255))
        cv.px(x - 1, y, GOLD_LIGHT); cv.px(x + 1, y, GOLD_LIGHT)
        cv.px(x, y - 1, GOLD_LIGHT); cv.px(x, y + 1, GOLD_LIGHT)

    # --- wordmark ---
    title = "SPROUT VALLEY"
    tscale = 3
    tw = text_width(title, tscale)
    tx = (B_W - tw) // 2
    draw_text(cv, tx, 16, title, CREAM, scale=tscale, outline=OUTLINE, shadow=(0x1d, 0x2e, 0x1c))

    tag = "A COZY FARMING GAME ON SOLANA"
    gw = text_width(tag, 1)
    draw_text(cv, (B_W - gw) // 2, 44, tag, (0x21, 0x3a, 0x21), scale=1,
              outline=(0xea, 0xf7, 0xea))

    # $SPROUT pill chip, centered under the title
    chip = "$SPROUT"
    cwid = text_width(chip, 2)
    pad = 6
    px0 = (B_W - (cwid + pad * 2)) // 2
    py0 = 54
    ph = 7 * 2 + 8
    cv.d.rounded_rectangle([px0, py0, px0 + cwid + pad * 2, py0 + ph],
                           radius=6, fill=GRASS_DEEP, outline=CREAM, width=1)
    draw_text(cv, px0 + pad, py0 + 4, chip, GOLD_LIGHT, scale=2)

    return cv.scale(S)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    jobs = {
        "sprout-valley-pfp.png": make_pfp_farmer,
        "sprout-valley-coin.png": make_pfp_coin,
        "sprout-valley-banner.png": make_banner,
    }
    for name, fn in jobs.items():
        path = os.path.normpath(os.path.join(OUT_DIR, name))
        fn().save(path)
        print("wrote", path)


if __name__ == "__main__":
    main()
