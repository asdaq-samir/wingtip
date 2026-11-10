"""A CSS colour as the generator writes it for every app: parsed to sRGB as
a browser renders it, and back to a hex. Standard library only."""

import math
import re


def _srgb_encode(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def rgba(value):
    """A CSS colour (hex, rgb(), oklch(), transparent) as 0-255 r, g, b and
    an alpha 0-1, as a browser renders it in sRGB (oklch through OKLab,
    Björn Ottosson's matrices; out-of-gamut channels clipped)."""
    v = value.strip().lower()
    if v == "transparent":
        return (0, 0, 0, 0.0)
    if v.startswith("#"):
        h = v[1:]
        if len(h) in (3, 4):
            h = "".join(ch * 2 for ch in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return (r, g, b, a)
    m = re.match(r"^(rgb|oklch)\(\s*([^)/]+?)\s*(?:/\s*([\d.]+%?))?\s*\)$", v)
    if not m:
        raise ValueError("not a colour: %s" % value)
    kind, body, alpha = m.groups()
    a = 1.0
    if alpha:
        a = float(alpha[:-1]) / 100 if alpha.endswith("%") else float(alpha)
    parts = [float(p) for p in body.split()]
    if kind == "rgb":
        return (round(parts[0]), round(parts[1]), round(parts[2]), a)
    L, C, H = parts
    la, lb = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l_ = (L + 0.3963377774 * la + 0.2158037573 * lb) ** 3
    m_ = (L - 0.1055613458 * la - 0.0638541728 * lb) ** 3
    s_ = (L - 0.0894841775 * la - 1.2914855480 * lb) ** 3
    lin = (
        4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
    )
    r, g, b = (round(max(0.0, min(1.0, _srgb_encode(max(0.0, c)))) * 255) for c in lin)
    return (r, g, b, a)


def hex6(c):
    return "#%02x%02x%02x" % c[:3]
