"""The store screenshots, framed: each capture in a device's outline under
a short headline, at the sizes the stores ask for.

Run through scripts/build/store-frames.sh (the brand-render image: Pillow
and Barlow, the brand's text face, design/tokens.json font.brand). Reads

  docs/store/screenshots/captions.json   the headline per screen
  docs/store/screenshots/raw/<device>/   the captures, as the simulator
                                         or emulator took them

and writes docs/store/screenshots/<size>/<screen>.jpg, and the site's
hero (apps/site/assets/hero.png: the iPhone's map, rounded, no words). Nothing is drawn
into a capture: the app's own pixels, scaled, with rounded corners.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "docs/store/screenshots"
FONT = "/usr/share/fonts/truetype/barlow/Barlow-Bold.ttf"
SUB = "/usr/share/fonts/truetype/barlow/Barlow-SemiBold.ttf"

# The sizes each store takes (App Store Connect's screenshot
# specifications; Google Play's phone screenshots, 9:16), with the
# captures each is made from and how round the device's screen is.
SIZES = {
    "iphone-6.9": {"size": (1320, 2868), "from": "iphone", "corner": 0.14},
    "iphone-6.5": {"size": (1284, 2778), "from": "iphone", "corner": 0.14},
    "ipad-13": {"size": (2064, 2752), "from": "ipad", "corner": 0.035},
    "android-phone": {"size": (1080, 1920), "from": "android", "corner": 0.08},
}


def tokens() -> dict:
    tree = json.loads((ROOT / "design/tokens.json").read_text())
    return {k: v["$value"] for k, v in tree["color"]["brand"].items() if isinstance(v, dict)}


def round_corners(img: Image.Image, radius: int) -> Image.Image:
    w, h = img.size
    mask = Image.new("L", (w * 2, h * 2), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w * 2 - 1, h * 2 - 1), radius=radius * 2, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask.resize((w, h), Image.LANCZOS))
    return out


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines, line = [], ""
    for word in text.split():
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=font) <= width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    return lines + [line] if line else lines


def frame(capture: Image.Image, spec: dict, caption: dict, t: dict) -> Image.Image:
    """The headline over the device: navy words on the chart's green, the
    capture in a dark bezel below, its foot running off the image as the
    stores' own examples do."""
    W, H = spec["size"]
    canvas = Image.new("RGB", (W, H), t["chart-land"])
    draw = ImageDraw.Draw(canvas)
    unit = W / 1320 if spec["from"] != "ipad" else W / 1800
    head = ImageFont.truetype(FONT, round(96 * unit))
    sub = ImageFont.truetype(SUB, round(50 * unit))
    y = round(150 * unit)
    for line in wrap(draw, caption["title"], head, W - round(160 * unit)):
        draw.text((W / 2, y), line, font=head, fill=t["mark-plane"], anchor="ma")
        y += round(108 * unit)
    if caption.get("sub"):
        y += round(14 * unit)
        for line in wrap(draw, caption["sub"], sub, W - round(200 * unit)):
            draw.text((W / 2, y), line, font=sub, fill=t["mark-plane"], anchor="ma")
            y += round(64 * unit)
    top = y + round(70 * unit)
    # The device: the capture at the width left, in a bezel a few percent
    # of its width, rounded as the screen is.
    width = round(W * (0.78 if spec["from"] != "ipad" else 0.84))
    shot = capture.convert("RGB").resize((width, round(capture.height * width / capture.width)), Image.LANCZOS)
    bezel = max(8, round(width * 0.028))
    radius = round(width * spec["corner"])
    body = Image.new("RGBA", (shot.width + 2 * bezel, shot.height + 2 * bezel), (0, 0, 0, 0))
    ImageDraw.Draw(body).rounded_rectangle(
        (0, 0, body.width - 1, body.height - 1), radius=radius + bezel, fill="#0b1422", outline="#3a4658",
        width=max(2, bezel // 6))
    body.alpha_composite(round_corners(shot, radius), (bezel, bezel))
    canvas.paste(body, ((W - body.width) // 2, top), body)
    return canvas


def main(argv: list[str]) -> int:
    t = tokens()
    captions = json.loads((SHOTS / "captions.json").read_text())
    made = 0
    for size, spec in SIZES.items():
        raw = SHOTS / "raw" / spec["from"]
        for name, caption in captions.items():
            source = next((p for p in (raw / f"{name}.png", raw / f"{name}.jpg") if p.exists()), None)
            if source is None:
                print(f"no capture: {source or raw / name}")
                continue
            out = SHOTS / size / f"{name}.jpg"
            out.parent.mkdir(parents=True, exist_ok=True)
            frame(Image.open(source), spec, caption, t).save(out, quality=90, optimize=True, progressive=True)
            made += 1
    hero = SHOTS / "raw/iphone/01-map.jpg"
    if hero.exists():
        shot = Image.open(hero)
        small = shot.resize((660, round(shot.height * 660 / shot.width)), Image.LANCZOS)
        round_corners(small, round(660 * SIZES["iphone-6.9"]["corner"])).save(
            ROOT / "apps/site/assets/hero.png", optimize=True)
    print(f"framed {made} screenshots")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
