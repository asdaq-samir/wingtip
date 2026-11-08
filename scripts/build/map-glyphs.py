"""Signed-distance-field glyph ranges (MapLibre's glyphs.proto) for one
font at one weight, as a glyph server serves them: 24 px glyphs with a
3 px buffer, radius 8 and cutoff 0.25 (TinySDF's and fontnik's).

The Android map's labels are MapLibre Native's, which reads its glyphs
as these ranges (the web's MapLibre GL draws the page's Inter itself):
apps/android/app/src/main/assets/glyphs/Inter-Bold is written by this,
from the web's own Inter (@fontsource-variable/inter, OFL) at weight
700, in the planner's image, which has Pillow, NumPy and SciPy:

  docker run --rm -v "$PWD:/w" -w /w --entrypoint python wingtip-planner \\
    -I scripts/build/map-glyphs.py \\
    apps/web/node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2 \\
    700 Inter-Bold apps/android/app/src/main/assets/glyphs
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import distance_transform_edt

SIZE = 24
BUFFER = 3
RADIUS = 8
CUTOFF = 0.25
S = 8  # supersampling

font_path, weight, stack, out = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
hi = ImageFont.truetype(font_path, SIZE * S)
lo = ImageFont.truetype(font_path, SIZE)
for f in (hi, lo):
    f.set_variation_by_axes([weight])


def varint(n):
    b = bytearray()
    while True:
        byte = n & 0x7F
        n >>= 7
        if n:
            b.append(byte | 0x80)
        else:
            b.append(byte)
            return bytes(b)


def key(field, wire):
    return varint((field << 3) | wire)


def u32(field, v):
    return key(field, 0) + varint(v)


def s32(field, v):
    return key(field, 0) + varint((v << 1) ^ (v >> 31))


def blob(field, data):
    return key(field, 2) + varint(len(data)) + data


def glyph(cp):
    ch = chr(cp)
    advance = int(round(lo.getlength(ch)))
    x0, y0, x1, y1 = hi.getbbox(ch, anchor="ls")
    if x1 <= x0 or y1 <= y0:
        return u32(1, cp) + u32(3, 0) + u32(4, 0) + s32(5, 0) + s32(6, 0) + u32(7, advance)
    left = math.floor(x0 / S)
    above = math.ceil(-y0 / S)
    width = math.ceil(x1 / S) - left
    height = above + math.ceil(y1 / S)
    w, h = width + 2 * BUFFER, height + 2 * BUFFER
    img = Image.new("L", (w * S, h * S), 0)
    ImageDraw.Draw(img).text(((BUFFER - left) * S, (BUFFER + above) * S), ch, font=hi, fill=255, anchor="ls")
    inside = np.asarray(img) >= 128
    d = (distance_transform_edt(~inside) - distance_transform_edt(inside)) / S
    d = d.reshape(h, S, w, S).mean(axis=(1, 3))
    sdf = np.clip(np.round(255 - 255 * (d / RADIUS + CUTOFF)), 0, 255).astype(np.uint8)
    # top: the glyph's top over the baseline less 26, so a line of 24 px
    # glyphs sits where a glyph server's would (fontnik's ascender offset).
    return (u32(1, cp) + blob(2, sdf.tobytes()) + u32(3, width) + u32(4, height)
            + s32(5, left) + s32(6, above - 26) + u32(7, advance))


def write_range(start, cps):
    name = f"{start}-{start + 255}"
    body = blob(1, stack.encode()) + blob(2, name.encode())
    for cp in cps:
        body += blob(3, glyph(cp))
    os.makedirs(os.path.join(out, stack), exist_ok=True)
    with open(os.path.join(out, stack, f"{name}.pbf"), "wb") as fh:
        fh.write(blob(1, body))


write_range(0, list(range(32, 127)) + list(range(160, 256)))
# General punctuation: the en dash of an airspace's "100–30", dashes,
# quotes, the bullet and the ellipsis.
write_range(8192, [0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026])
print("ok")
