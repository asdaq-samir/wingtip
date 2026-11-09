"""Every app's icons and launch art, drawn from the brand's SVG sources.

Run through scripts/build/app-icons.sh (in the brand-render image, which
has librsvg and Pillow). The sources, in docs/brand:

  appicon.svg         the icon: the mark on a piece of sectional (pick A)
  appicon-dark.svg    the same scene at night (iOS's dark appearance)
  appicon-tinted.svg  its grayscale (iOS's tinted appearance)
  mark.svg            the mark alone: launch screens
  mark-small.svg      the mark for 64 px and under: favicon, notification,
                      watch
  android-*.svg       the adaptive icon's layers
  play-feature.svg    Google Play's feature graphic, the icon laid on it

and the launch grounds from design/tokens.json (color.brand.launch,
launch-night, chart-land). Nothing here is drawn by hand: change a source
and run the script. `--check` draws everything into memory and fails
where a committed file differs (CI): PNGs by their pixels, within a step
of rounding, since two zlib builds pack the same pixels differently.
"""
from __future__ import annotations

import io
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / "docs/brand"
IOS = ROOT / "apps/ios/Wingtip/Assets.xcassets"
WATCH = ROOT / "apps/ios/WingtipWatch/Assets.xcassets"
RES = ROOT / "apps/android/app/src/main/res"
WEB = ROOT / "apps/web/public"
SITE = ROOT / "apps/site/assets"
STORE = ROOT / "docs/store"

# Android's densities, as a factor of mdpi's one pixel per dp.
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
# The mark's colours by day and their night ones (color.brand).
NIGHT = {"#A3266F": "#E37BB5", "#14284B": "#FFFFFF"}
# The installed web app's launch images on iOS, one per iPhone screen in
# portrait (Apple's apple-touch-startup-image wants the exact size):
# points wide, high, and the scale.
IPHONES = [(440, 956, 3), (402, 874, 3), (430, 932, 3), (393, 852, 3), (390, 844, 3), (375, 812, 3), (414, 896, 2)]
# Apple rounds a Home Screen icon to about this fraction of its side; the
# PWA's "any" icons are drawn rounded so, for the installers that show
# them as they are.
CORNER = 0.2237


def tokens() -> dict:
    tree = json.loads((ROOT / "design/tokens.json").read_text())
    return {k: v["$value"] for k, v in tree["color"]["brand"].items() if isinstance(v, dict)}


def svg_text(name: str) -> str:
    return (BRAND / name).read_text()


def recolour(svg: str, mapping: dict[str, str]) -> str:
    for old, new in mapping.items():
        svg = re.sub(re.escape(old), new, svg, flags=re.IGNORECASE)
    return svg


def white(svg: str) -> str:
    """Every colour white: a shape for a system that reads its alpha alone."""
    return re.sub(r"#[0-9A-Fa-f]{6}\b", "#FFFFFF", svg)


def render(svg: str, width: int, height: int | None = None) -> Image.Image:
    """librsvg's drawing of an SVG at a size, as RGBA."""
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=True) as f:
        f.write(svg)
        f.flush()
        args = ["rsvg-convert", "-w", str(width), "-h", str(height or width), f.name]
        out = subprocess.run(args, check=True, capture_output=True).stdout
    return Image.open(io.BytesIO(out)).convert("RGBA")


def on_ground(img: Image.Image, colour: str) -> Image.Image:
    ground = Image.new("RGBA", img.size, colour)
    ground.alpha_composite(img)
    return ground


def rounded(img: Image.Image) -> Image.Image:
    """The icon with Apple's corner, the mask drawn at four times the size
    so its edge is smooth."""
    w, h = img.size
    mask = Image.new("L", (w * 4, h * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w * 4 - 1, h * 4 - 1), radius=round(w * 4 * CORNER), fill=255)
    out = img.copy()
    out.putalpha(ImageChops.multiply(img.getchannel("A"), mask.resize((w, h), Image.LANCZOS)))
    return out


def centred(mark: Image.Image, size: tuple[int, int], colour: str | None) -> Image.Image:
    canvas = Image.new("RGBA", size, colour or (0, 0, 0, 0))
    canvas.alpha_composite(mark, ((size[0] - mark.width) // 2, (size[1] - mark.height) // 2))
    return canvas


def contents(images: list[dict], extra: dict | None = None) -> str:
    doc = {"images": images, "info": {"author": "xcode", "version": 1}}
    doc.update(extra or {})
    return json.dumps(doc, indent=2) + "\n"


def small_icon(t: dict, size: int) -> Image.Image:
    """The small master as an icon: the mark on the chart's green, at 80%
    so the ring clears the watch's round mask."""
    mark = render(svg_text("mark-small.svg"), round(size * 0.8))
    return centred(mark, (size, size), t["chart-land"]).convert("RGB")


def favicon_svg() -> str:
    """mark-small.svg with its night colours for a dark browser."""
    style = (
        "  <style>\n    @media (prefers-color-scheme: dark) {\n"
        f"      .ring {{ stroke: {NIGHT['#A3266F']}; }}\n"
        f"      .ship {{ fill: {NIGHT['#14284B']}; stroke: {NIGHT['#14284B']}; }}\n"
        "    }\n  </style>\n"
    )
    svg = svg_text("mark-small.svg")
    head = svg.index("\n", svg.index("-->")) + 1
    return svg[:head] + style + svg[head:]


def ios(out: dict, t: dict) -> None:
    """The iPhone's icon in its three appearances (iOS 18: one 1024 image
    each), the watch's, and the launch screen's ground and mark."""
    out[IOS / "AppIcon.appiconset/AppIcon.png"] = render(svg_text("appicon.svg"), 1024).convert("RGB")
    out[IOS / "AppIcon.appiconset/AppIcon-dark.png"] = render(svg_text("appicon-dark.svg"), 1024).convert("RGB")
    out[IOS / "AppIcon.appiconset/AppIcon-tinted.png"] = render(svg_text("appicon-tinted.svg"), 1024).convert("L").convert("RGB")
    one = {"idiom": "universal", "platform": "ios", "size": "1024x1024"}
    out[IOS / "AppIcon.appiconset/Contents.json"] = contents([
        {"filename": "AppIcon.png", **one},
        {"appearances": [{"appearance": "luminosity", "value": "dark"}], "filename": "AppIcon-dark.png", **one},
        {"appearances": [{"appearance": "luminosity", "value": "tinted"}], "filename": "AppIcon-tinted.png", **one},
    ])
    out[WATCH / "Contents.json"] = contents([])
    out[WATCH / "AppIcon.appiconset/AppIcon.png"] = small_icon(t, 1024)
    out[WATCH / "AppIcon.appiconset/Contents.json"] = contents(
        [{"filename": "AppIcon.png", "idiom": "universal", "platform": "watchos", "size": "1024x1024"}])

    def srgb(hex_: str) -> dict:
        r, g, b = (int(hex_[i:i + 2], 16) for i in (1, 3, 5))
        return {"color-space": "srgb", "components": {
            "red": f"0x{r:02X}", "green": f"0x{g:02X}", "blue": f"0x{b:02X}", "alpha": "1.000"}}
    out[IOS / "LaunchBackground.colorset/Contents.json"] = json.dumps({"colors": [
        {"color": srgb(t["launch"]), "idiom": "universal"},
        {"appearances": [{"appearance": "luminosity", "value": "dark"}], "color": srgb(t["launch-night"]), "idiom": "universal"},
    ], "info": {"author": "xcode", "version": 1}}, indent=2) + "\n"
    # The mark at 120 points, the size Apple's own apps' launch marks are.
    images = []
    for scale in (2, 3):
        for dark in (False, True):
            name = f"LaunchMark{'-dark' if dark else ''}@{scale}x.png"
            svg = recolour(svg_text("mark.svg"), NIGHT) if dark else svg_text("mark.svg")
            out[IOS / "LaunchMark.imageset" / name] = render(svg, 120 * scale)
            entry = {"filename": name, "idiom": "universal", "scale": f"{scale}x"}
            if dark:
                entry = {"appearances": [{"appearance": "luminosity", "value": "dark"}], **entry}
            images.append(entry)
    out[IOS / "LaunchMark.imageset/Contents.json"] = contents(images)


def android(out: dict, t: dict) -> None:
    """The adaptive icon's three layers (108 dp), the notification's
    small icon (24 dp, white), the splash screen's mark (Android 12's
    288 dp, the ring inside its 192 dp circle) and the grounds."""
    for dpi, f in DENSITIES.items():
        px = round(108 * f)
        for layer in ("foreground", "background", "monochrome"):
            out[RES / f"mipmap-{dpi}/ic_launcher_{layer}.png"] = render(svg_text(f"android-{layer}.svg"), px)
        out[RES / f"drawable-{dpi}/ic_stat_wingtip.png"] = render(white(svg_text("mark-small.svg")), round(24 * f))
        mark = render(svg_text("mark.svg"), round(216 * f))
        out[RES / f"drawable-{dpi}/splash_mark.png"] = centred(mark, (round(288 * f),) * 2, None)
        night = render(recolour(svg_text("mark.svg"), NIGHT), round(216 * f))
        out[RES / f"drawable-night-{dpi}/splash_mark.png"] = centred(night, (round(288 * f),) * 2, None)
    for folder, token in (("values", "launch"), ("values-night", "launch-night")):
        out[RES / folder / "brand_colors.xml"] = (
            '<?xml version="1.0" encoding="utf-8"?>\n'
            "<!-- Generated by scripts/build/app-icons.sh from design/tokens.json's color.brand: edit there. -->\n"
            f'<resources>\n    <color name="splash_background">{t[token].upper()}</color>\n</resources>\n'
        )
    out[STORE / "play-icon-512.png"] = render(svg_text("appicon.svg"), 512)
    out[STORE / "play-feature-graphic.png"] = feature_graphic()


def feature_graphic() -> Image.Image:
    """Play's banner with the icon laid on its placeholder: librsvg here
    draws no SVG inside an <image>, so Pillow puts it there."""
    svg = svg_text("play-feature.svg")
    box = re.search(r'<rect id="icon" x="(\d+)" y="(\d+)" width="(\d+)"', svg)
    x, y, size = (int(v) for v in box.groups())
    banner = render(svg, 1024, 500)
    icon = rounded(render(svg_text("appicon.svg"), size))
    # A soft shadow under it, as a launcher lifts an icon off its
    # wallpaper: the icon is the same chart as the banner behind it.
    shadow = Image.new("RGBA", banner.size, (0, 0, 0, 0))
    shadow.paste((20, 40, 75, 90), (x, y + 8), icon.getchannel("A"))
    banner.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
    banner.alpha_composite(icon, (x, y))
    return banner.convert("RGB")


def web(out: dict, t: dict) -> None:
    """The web app's and the site's icons: the tab's (the small master),
    the Home Screen's, the manifest's, and the installed app's launch
    images on iOS."""
    icon = svg_text("appicon.svg")
    fav = favicon_svg()
    ico = {s: render(svg_text("mark-small.svg"), s) for s in (16, 32, 48)}
    for base in (WEB, SITE):
        out[base / "favicon.svg"] = fav
        out[base / "favicon.ico"] = ico
    out[WEB / "apple-touch-icon.png"] = render(icon, 180).convert("RGB")
    out[SITE / "icon-180.png"] = render(icon, 180).convert("RGB")
    for s in (192, 512):
        out[WEB / f"icon-{s}.png"] = rounded(render(icon, s))
        out[WEB / f"icon-maskable-{s}.png"] = render(icon, s).convert("RGB")
    out[SITE / "icon-512.png"] = rounded(render(icon, 512))
    out[BRAND / "app-store-1024.png"] = render(icon, 1024).convert("RGB")
    for w, h, s in IPHONES:
        for dark, ground in ((False, t["launch"]), (True, t["launch-night"])):
            svg = recolour(svg_text("mark.svg"), NIGHT) if dark else svg_text("mark.svg")
            name = f"splash/launch-{w}x{h}{'-dark' if dark else ''}.png"
            out[WEB / name] = centred(render(svg, 120 * s), (w * s, h * s), ground).convert("RGB")


BEGIN = "    <!-- BEGIN launch images: generated by scripts/build/app-icons.sh -->\n"
END = "    <!-- END launch images -->\n"


def index_html() -> str:
    """index.html with its launch-image links written between the markers."""
    page = (ROOT / "apps/web/index.html").read_text()
    start, stop = page.index(BEGIN) + len(BEGIN), page.index(END)
    return page[:start] + startup_links() + "\n" + page[stop:]


def startup_links() -> str:
    """index.html's links to the launch images, one per screen and scheme."""
    lines = []
    for w, h, s in IPHONES:
        for dark in (False, True):
            media = (f"(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {s})"
                     f" and (orientation: portrait) and (prefers-color-scheme: {'dark' if dark else 'light'})")
            lines.append(f'    <link rel="apple-touch-startup-image" media="{media}" '
                         f'href="/splash/launch-{w}x{h}{"-dark" if dark else ""}.png" />')
    return "\n".join(lines)


def encode(value) -> bytes:
    if isinstance(value, str):
        return value.encode()
    buf = io.BytesIO()
    if isinstance(value, dict):  # an .ico of several sizes
        biggest = value[max(value)]
        biggest.save(buf, format="ICO", sizes=[(s, s) for s in sorted(value)], append_images=list(value.values()))
    else:
        value.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def same(path: Path, value) -> bool:
    if not path.exists():
        return False
    if isinstance(value, str):
        return path.read_text() == value
    if isinstance(value, dict):
        with Image.open(path) as ico:
            return set(ico.info.get("sizes", [])) == {(s, s) for s in value}
    with Image.open(path) as old:
        if old.size != value.size or old.mode != value.mode:
            return False
        diff = ImageChops.difference(old.convert("RGBA"), value.convert("RGBA"))
        return max(hi for _, hi in diff.getextrema()) <= 2


def main(argv: list[str]) -> int:
    t = tokens()
    out: dict = {}
    for part in (ios, android, web):
        part(out, t)
    out[ROOT / "apps/web/index.html"] = index_html()
    if "--check" in argv:
        stale = [p for p, v in sorted(out.items()) if not same(p, v)]
        for p in stale:
            print(f"differs: {p.relative_to(ROOT)}")
        if stale:
            print("run scripts/build/app-icons.sh and commit what it writes")
        return 1 if stale else 0
    for path, value in out.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(encode(value))
    print(f"wrote {len(out)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
