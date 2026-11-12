#!/usr/bin/env python3
"""No raw style value in app code: every colour, type size, padding, gap
and corner comes from the design tokens (the owner, 2026-11-09: "make the
styling consistent with the branding").

design/tokens.json is the one source of Wingtip's look; scripts/build/
design-tokens.sh writes it out for each app (the web's tokens.css and
lib/tokens.ts, iOS's Tokens.swift, Android's Tokens.kt). A value typed
straight into a screen drifts from it, so this finds the shapes one takes:

- Web (apps/web/src, .ts/.tsx/.css): a hex, rgb(), hsl() or oklch() colour
  (a Tailwind arbitrary colour like bg-[#123456] or an inline style's
  among them); an arbitrary text size the type roles or Tailwind's scale
  has (text-[13px]); an arbitrary padding, margin or gap in whole pixels,
  which Tailwind's 4-point scale always has a step for (p-[7px] is
  p-1.75); an arbitrary corner (rounded-[10px]).
- iOS (apps/ios, .swift): Color(red:), Color(white:), Color(hex:),
  UIColor(red:), UIColor(white:), UIColor(hex:), hex(0xRRGGBB);
  .font(.system(size:));
  a number in .padding(), cornerRadius or spacing:.
- Android (apps/android/app/src/main, .kt): Color(0x...); a number in sp;
  a number in dp given to a padding, a spacedBy, a corner shape or
  PaddingValues.

Zero is not a style value and is never a hit, nor is a corner under 4
points, a small glyph's geometry. Left out: generated files,
tests, previews, comments, and the ramps that are data rather than look
(DATA below: the radar's and the chart's own symbology, already tokens
where the apps share them).

What is needed as it is -- an SVG's geometry, another company's mark, a
printed page's fixed sizes -- is listed in scripts/ci/brand_guard_allow.txt
as "<path> <count> <why>". A file with more hits than its count fails;
fewer is said, so the list shrinks.

The standard library only.

  python3 scripts/ci/brand_guard.py          check
  python3 scripts/ci/brand_guard.py --list   print every hit, the allowed too
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ALLOW = ROOT / "scripts/ci/brand_guard_allow.txt"

AREAS = {
    "web": ("apps/web/src", (".ts", ".tsx", ".css")),
    "ios": ("apps/ios", (".swift",)),
    "android": ("apps/android/app/src/main", (".kt",)),
}

# Generated, tests and previews.
SKIP = re.compile(
    r"(/generated/|/Generated/|apps/ios/WingtipAPI/|\.d\.ts$|\.test\.|\.spec\.|/test/|/tests?/|/e2e/|/fixtures/|__tests__|"
    r"\.stories\.|/previews?/|Tests/|UITests/|"
    r"apps/web/src/styles/tokens\.css$|apps/web/src/lib/tokens\.ts$|apps/web/src/lib/api/types\.ts$|"
    r"apps/web/src/lib/engine/contract\.ts$)"
)
# Ramps that are data, not the app's look: the radar's reflectivity scale
# (NWS's dBZ colours) and the FAA chart's own symbology drawn as the chart
# draws it.
DATA = re.compile(r"(apps/web/src/lib/map/gl/radar[^/]*\.ts$|apps/web/src/features/plan/map/radar[^/]*\.ts$)")

# A corner under the least radius token's half (4 points) is a small
# glyph's geometry -- a diamond's tip, a gauge's cell -- not a look.
LEAST_CORNER = 4

# --- web ---
HEX = re.compile(r"(?<![A-Za-z0-9&/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])")
# After a word or an underscore too: Tailwind writes a space as one (shadow-[0_1px_rgba(...)]).
FUNC = re.compile(r"(?<![A-Za-z0-9])(?:rgba?|hsla?|oklch|oklab|hwb)\((?!\s*(?:from\b|var\())")
# Tailwind's text sizes and the type roles', in px.
TEXT_SIZES = {11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 36}
ARBITRARY = re.compile(
    r"(?<![\w-])(?:[\w-]+:)*(?P<kind>text|p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|rounded(?:-[a-z]+)?)"
    r"-\[(?P<n>-?\d*\.?\d+)(?P<unit>px|rem)\]"
)


def web_hits(line: str) -> list:
    out = []
    if HEX.search(line) or FUNC.search(line):
        out.append("colour")
    for m in ARBITRARY.finditer(line):
        px = float(m["n"]) * (16 if m["unit"] == "rem" else 1)
        kind = m["kind"]
        if kind == "text":
            if px in TEXT_SIZES:
                out.append("text size")
        elif kind.startswith("rounded"):
            if px >= LEAST_CORNER:
                out.append("corner")
        elif px and px == int(px):
            out.append("spacing")
    return out


# --- iOS ---
# The colour initialisers, and a 0xRRGGBB handed to a helper of one's own.
SWIFT_COLOUR = re.compile(r"\b(?:UI)?Color\(\s*(?:\.sRGB\s*,\s*)?(?:red|white|hex):|\b(?:hex|rgb)\(\s*0x[0-9A-Fa-f]{6}\b")
SWIFT_FONT = re.compile(r"\.system\(\s*size:")
SWIFT_NUMBER = re.compile(
    r"\.padding\(\s*(?:\.[a-zA-Z]+\s*,\s*)?-?(?P<a>\d+(?:\.\d+)?)\s*\)"
    r"|cornerRadius(?::|\()\s*(?P<b>\d+(?:\.\d+)?)"
    r"|\bspacing:\s*(?P<c>\d+(?:\.\d+)?)\b"
)


def swift_hits(line: str) -> list:
    out = []
    if SWIFT_COLOUR.search(line):
        out.append("colour")
    if SWIFT_FONT.search(line):
        out.append("type size")
    for m in SWIFT_NUMBER.finditer(line):
        n = float(m["a"] or m["b"] or m["c"])
        if n and (m["b"] is None or n >= LEAST_CORNER):
            out.append("spacing or corner")
    return out


# --- Android ---
KT_COLOUR = re.compile(r"\bColor\(\s*0x[0-9A-Fa-f]+")
KT_SP = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)f?\.sp\b")
KT_DP = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)f?\.dp\b")
KT_STYLE_CALLS = {"padding", "spacedBy", "RoundedCornerShape", "PaddingValues", "absolutePadding", "CutCornerShape"}


def call_of(line: str, at: int) -> str:
    """The name of the call whose brackets hold position `at`."""
    depth = 0
    for i in range(at - 1, -1, -1):
        c = line[i]
        if c == ")":
            depth += 1
        elif c == "(":
            if depth == 0:
                m = re.search(r"(\w+)\s*$", line[:i])
                return m.group(1) if m else ""
            depth -= 1
    return ""


def kotlin_hits(line: str) -> list:
    out = []
    if KT_COLOUR.search(line):
        out.append("colour")
    for m in KT_SP.finditer(line):
        if float(m.group(1)):
            out.append("type size")
    for m in KT_DP.finditer(line):
        n, call = float(m.group(1)), call_of(line, m.start())
        if n and call in KT_STYLE_CALLS and (not call.endswith("Shape") or n >= LEAST_CORNER):
            out.append("spacing or corner")
    return out


def strip_comment(line: str, in_block: bool):
    """The line without its comments, and whether a /* */ is still open."""
    out = ""
    i = 0
    while i < len(line):
        if in_block:
            end = line.find("*/", i)
            if end < 0:
                return out, True
            i, in_block = end + 2, False
            continue
        if line.startswith("/*", i):
            in_block = True
            i += 2
            continue
        # `//` starts a comment unless it is a URL's (after a colon).
        if line.startswith("//", i) and (i == 0 or line[i - 1] != ":"):
            return out, False
        out += line[i]
        i += 1
    return out, False


def scan_file(path: Path, platform: str) -> list:
    hits_of = {"web": web_hits, "ios": swift_hits, "android": kotlin_hits}[platform]
    found = []
    in_block = False
    preview_depth = None
    for n, raw in enumerate(path.read_text(errors="replace").splitlines(), 1):
        stripped = raw.lstrip()
        # A preview (SwiftUI's #Preview, Compose's @Preview) is not the app.
        if preview_depth is None and (stripped.startswith("#Preview") or stripped.startswith("@Preview")):
            preview_depth = 0
        line, in_block = strip_comment(raw, in_block)
        if path.suffix == ".css" and stripped.startswith("*"):
            continue
        if preview_depth is not None:
            preview_depth += line.count("{") - line.count("}")
            if preview_depth <= 0 and "}" in line:
                preview_depth = None
            continue
        for what in hits_of(line):
            found.append((n, what, raw.strip()))
    return found


def scan() -> dict:
    out = {}
    for platform, (area, suffixes) in AREAS.items():
        for path in sorted((ROOT / area).rglob("*")):
            rel = path.relative_to(ROOT).as_posix()
            if path.suffix in suffixes and path.is_file() and not SKIP.search(rel) and not DATA.search(rel):
                found = scan_file(path, platform)
                if found:
                    out[rel] = found
    return out


def allowed() -> dict:
    out = {}
    for line in ALLOW.read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            rel, count, *_ = line.split(None, 2)
            out[rel] = int(count)
    return out


def main() -> int:
    found = scan()
    if "--list" in sys.argv:
        for rel, items in found.items():
            for n, what, text in items:
                print(f"{rel}:{n}: {what}: {text[:160]}")
        return 0
    allow = allowed()
    failed = False
    for rel, items in found.items():
        if len(items) > allow.get(rel, 0):
            failed = True
            print(
                f"::error file={rel}::{len(items)} raw style value(s) here, {allow.get(rel, 0)} allowed "
                "(scripts/ci/brand_guard_allow.txt). Use the design token (design/tokens.json; add one there "
                "for a value used again and again), or list the file with why."
            )
            for n, what, text in items:
                print(f"  {rel}:{n}: {what}: {text[:160]}")
    for rel, count in allow.items():
        have = len(found.get(rel, []))
        if have < count:
            print(f"{rel}: {have} now, {count} allowed: lower its count in brand_guard_allow.txt.")
    by = {p: sum(len(v) for k, v in found.items() if k.startswith(AREAS[p][0])) for p in AREAS}
    print(
        "brand guard: %s hit(s) (web %d, iOS %d, Android %d), %d allowed."
        % (sum(by.values()), by["web"], by["ios"], by["android"], sum(min(len(found.get(k, [])), c) for k, c in allow.items()))
    )
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
