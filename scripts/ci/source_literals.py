"""The literals the simplicity ratchet counts written again (scripts/ci/
simplicity_ratchet.py): the unit factors and the earth's size, and the
source with its comments and strings taken out to find them in. The
standard library only, as the ratchet is.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def text(path: str) -> str:
    try:
        return (ROOT / path).read_text(errors="replace")
    except FileNotFoundError:
        return ""


UNIT = r"\b(0\.3048|3\.2808\d*|6076(\.\d+)?|1852(\.0)?|1\.9438\d*)\b"
# The engine's unit literals, set or used inline: the foot, the nautical
# and statute miles, their rounded ratios (nautical miles in a statute
# mile, 0.8689...; statute in a nautical, 1.1507...; knots in a metre a
# second, 1.9438...; metres a second in a knot, 0.5144...) and the
# kelvin's offset. Each is engine/crates/core/src/units.rs's alone.
ENGINE_UNIT = re.compile(
    r"(?<![\w.])(0\.3048|3\.2808\d*|6_?076(\.\d+)?|1_?852(\.0*)?|1\.852|1_?609\.344|5_?280(\.0*)?"
    r"|1\.9438\d*|0\.5144\d*|0\.8689\d*|1\.1507\d*|273\.15)(?![\w.])"
)
RUST_NOT_CODE = re.compile(r'//[^\n]*|/\*.*?\*/|r(#*)".*?"\1|b?"(\\.|[^"\\])*"|\'(\\.|[^\'\\])\'', re.S)


def rust_code(source: str) -> str:
    """A Rust file with its comments, strings and characters taken out:
    test data written in a string is data, not a factor."""
    return RUST_NOT_CODE.sub(" ", source)


# The Web Mercator world's size and edge, and the earth's radius it is
# often confused with, in every form a copy has taken: the sphere of
# 6,378,137 m (and in km), the mean radius 6,371,000 m (and 6,371,008.8,
# and in km), the equator's 40,075,016.686 m (and in km), half of it
# 20,037,508.34 m, the metres a point at zoom 0 for 256 and 512 point
# tiles (156,543.03; 78,271.52), the world in nautical miles (21,600 round
# to 21,638.8) and the edge, 85.05 to 85.0511287798 (rounds 3 and 4 found
# rounded copies the canonical literals missed).
MERCATOR = re.compile(
    r"(?<![\w.])(6_?378_?137(\.0*)?|6_?378\.137|6_?371_?0[01]\d(\.\d*)?|6_?371(\.0*)?|40_?075_?01[67](\.\d*)?|40_?075(\.0\d*)?"
    r"|20_?037_?50[89](\.\d*)?|20_?037(\.5\d*)?|156_?543(\.\d*)?|78_?271(\.\d*)?|21_?6[0-4]\d(\.\d*)?|85\.05\d*)(?![\w.])"
)
# Every language's code in the apps, the services and the engine, which
# the Mercator count reads.
EVERY_SOURCE = tuple(
    (top, suffix)
    for top in ("apps", "services", "engine")
    for suffix in (".rs", ".py", ".ts", ".tsx", ".js", ".mjs", ".swift", ".kt", ".java")
)
# Each platform's one home for them (and tags.rs's WGS-84 a, the sourced
# TERPS earth's companion).
MERCATOR_HOMES = (
    "apps/web/src/lib/map/tileMath.ts",
    "apps/ios/Wingtip/Tiles/TileMath.swift",
    "android/tiles/TileGrid.kt",
    "services/planner/wingtip/geo.py",
    "engine/crates/core/src/geo.rs",
    "engine/crates/route/src/approach/tags.rs",
)
# A search box padded by hand: a pad in miles divided by 60 (or 59.7) to
# make degrees, or widened by a cosine of latitude, in the engine or a
# Python service (round 5's S1). core's geo::corridor_bbox and box_around,
# and wingtip.geo's, are the homes: a degree of latitude taken at its
# shortest, 59.7 nm, and of longitude at the box's poleward edge.
# The same box padded in degrees (round 6's T1 to T3): a latitude or
# longitude plus or minus a pad, half, reach, margin or radius times a
# fixed number (PAD_DEG * 1.4, half * 1.5: a cosine of one latitude for
# every latitude) or over a cosine of its own.
DEGREE_BOX = r"(?i:\b\w*(?:lat|lon)\w*\s*[-+]\s*\w*(?:pad|half|reach|margin|radius)\w*\s*(?:\*\s*\d|/[^\n]*\bcos\b))"
SEARCH_BOX = re.compile(
    r"/\s*\(?\s*(?:60|59\.7)(?:\.0*)?(?![\w.])[^\n]*\bcos\b"
    r"|\bpad\w*\s*=(?!=)[^\n]*(?:/\s*\(?\s*(?:60|59\.7)(?:\.0*)?(?![\w.])|\bcos\b)"
    r"|" + DEGREE_BOX
)
SEARCH_BOX_HOMES = ("engine/crates/core/src/geo.rs", "services/planner/wingtip/geo.py")
# A great-circle distance worked by hand (round 6's T4): the haversine's
# sin(x / 2) squared, or its asin or atan2 of a square root. The engine's
# geodesic (core's geo.rs, through wingtip/geo.py) is the one distance.
HAVERSINE = re.compile(
    r"\bsin\([^\n]*/\s*2(?:\.0*)?\s*\)\s*(?:\*\*\s*2|\.powi\(2\))"
    r"|/\s*2(?:\.0*)?\s*\)\s*\.sin\(\)\s*\.powi\(2\)"
    r"|\b(?:asin|atan2)\(\s*(?:np\.|math\.|Math\.)?sqrt\("
)
HAVERSINE_HOMES = SEARCH_BOX_HOMES
# A distance margin worked in degrees (round 7's U1 to U4): miles over 60
# (STORM_NM / 60.0), a degrees constant set as miles over 60, or a reach,
# margin, pad, buffer or radius constant in degrees added to a latitude or
# longitude -- each a mile short east and west by cos(latitude). Pad with
# geo::corridor_bbox or box_around and measure in nm on core::flat::Flat.
# Degree tilings (a grid's step, a region, a cell) are degrees by design.
DEGREE_MARGIN = re.compile(
    r"\b[A-Z][A-Z0-9_]*_NM\s*/\s*\(?\s*(?:60|59\.7)(?:\.0*)?(?![\w.])"
    r"|\b[A-Z][A-Z0-9_]*_(?:DEG|MARGIN)\b\s*(?::\s*f64\s*)?=\s*[\d.]+\s*/\s*\(?\s*60(?:\.0*)?(?![\w.])"
    r"|[-+]\s*\b[A-Z0-9_]*(?:REACH|MARGIN|PAD|BUFFER|RADIUS)[A-Z0-9_]*_DEG\b|[-+]\s*\b[A-Z][A-Z0-9_]*_MARGIN\b"
)
DEGREE_MARGIN_HOMES = SEARCH_BOX_HOMES + ("engine/crates/core/src/flat.rs",)
PY_NOT_CODE = re.compile(r'#[^\n]*|"""(.|\n)*?"""|\'\'\'(.|\n)*?\'\'\'|"(\\.|[^"\\\n])*"|\'(\\.|[^\'\\\n])*\'')


def code_of(path: str) -> str:
    """A source file with its comments and strings taken out, and a Rust
    file's inline tests (#[cfg(test)] to the end) too."""
    source = text(path)
    if path.endswith(".py"):
        return PY_NOT_CODE.sub(" ", source)
    if path.endswith(".rs"):
        source = source.split("#[cfg(test)]", 1)[0]
    return rust_code(source)
