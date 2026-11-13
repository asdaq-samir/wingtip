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
