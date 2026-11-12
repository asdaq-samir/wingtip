"""The `special_use_labels` layer of the map's overlay tiles: a point on
each special-use area's boundary where the map writes its tab, as
ForeFlight does over the sectional (the owner's screenshot near Brady,
TX, 2026-11-12): "M-BRNWD 2 W*: 7000-17999", "M-BRADY LOW:
500AGL-5999". The tiles carry the tab's name and its limits as figures
with their references; the map writes the altitudes' words, as it does
for the Class B, C and D tabs (`airspace_labels`, overlays.py).

From the FAA's special use airspace feature service (ADDS), as the cycle
pack holds it (wingtip.sua): NAME, TYPE_CODE, LOWER_VAL/LOWER_UOM/
LOWER_CODE/LOWER_DESC, UPPER_VAL/UPPER_UOM/UPPER_CODE/UPPER_DESC and
EXCLUSION. A pack written before wingtip.sua asked for the _DESC fields
and EXCLUSION has none of them: its limits are then read as inclusive
and every piece is labelled, until the next pack.

The limits are written as the FAA's own CIFP (FAACIFP18, ARINC 424's
restrictive airspace record, the lower and upper limits with their unit
M for MSL or A for AGL) writes the same areas, which is also how
ForeFlight writes them: Brady Low MOA, in ADDS 500 FT SFC to 6000 FT MSL
"to but not including", is "00500A" to "05999M" there; Brady North,
3600 FT MSL to FL180 TNI, is "03600M" to "17999M"; Brady Low's two
pieces above 1,500 ft AGL ("ANI") are "01501A" (cycle 2610, read
2026-11-12).
"""

from __future__ import annotations

import json
import math

from .overlays import SPECIAL_USE_MIN_ZOOM, _feature, _meets, _orient

#: The letter ForeFlight puts before an area's name, by the FAA's
#: TYPE_CODE: an MOA's name in ADDS is its words ("BRADY NORTH MOA"),
#: the others' their designator, which starts with it already ("R-2602",
#: "A-220", "W-291W", "P-56A").
PREFIX = {"MOA": "M-", "R": "R-", "P": "P-", "W": "W-", "A": "A-", "D": "D-"}
#: The longest a name is written in its tab, as ForeFlight cuts them:
#: "BRADY NOR" for BRADY NORTH MOA, "BRADY LOW" whole.
NAME_WIDTH = 9
#: The mark of a name cut short. ForeFlight's own documentation does not
#: say what its "*" is (its Pilot's and Legends Guides, read 2026-11-12);
#: on the owner's screenshot it is on exactly the names it shortens
#: ("BRADY NOR*", "BRNWD 2 W*") and not on the one it writes whole
#: ("BRADY LOW"), whose times also say "OTHER TIMES BY NOTAM", so it is
#: not the NOTAM mark. Here it marks a NAME the tab does not hold whole.
CUT = "*"


def label_name(name: str, type_code: str) -> str:
    """The tab's name: the type's letter (PREFIX) and the area's name,
    the type's own word left off, cut to NAME_WIDTH with CUT. A cut keeps
    every word after the first, so the four Brownwood MOAs stay apart:
    each later word kept as its number or its first letter, the first
    word as much of it as is left ("BROWN 2 W*")."""
    prefix = PREFIX.get(type_code, f"{type_code}-" if type_code else "")
    words = (name or "").upper().split()
    if type_code == "MOA" and words and words[-1] == "MOA":
        words = words[:-1]
    base = " ".join(words)
    if prefix and base.startswith(prefix):
        base = base[len(prefix) :]
    if len(base) <= NAME_WIDTH:
        return prefix + base
    cut = base[:NAME_WIDTH].rstrip()
    if len(cut.split()) < len(words):
        tail = " ".join(w if w.isdigit() or len(w) == 1 else w[0] for w in words[1:])
        head = words[0][: max(1, NAME_WIDTH - len(tail) - 1)]
        cut = f"{head} {tail}"[:NAME_WIDTH].rstrip()
    return prefix + cut + CUT


def limit(value, uom, code, desc, *, upper: bool) -> tuple[float | None, str | None]:
    """A floor or ceiling as the tab writes it, (feet, reference), from
    ADDS' VAL, UOM (FT or FL), CODE (SFC, MSL, STD, UNLTD) and DESC (TNI
    "to but not including", ANI "above but not including", TI, OTHER):

    - "SFC" at 0: the surface. A CODE of SFC with a height above 0 is that
      height above the ground, "AGL" (Brady Low's 500 FT SFC, CIFP's
      "00500A").
    - "FL": a flight level, feet / 100; but a ceiling at FL180 TNI is
      17,999 ft MSL, as CIFP writes it ("17999M"): below 18,000 ft MSL,
      the floor of Class A (14 CFR 71.33), altitudes are MSL.
    - "UNL": no ceiling (UNLTD), no figure.
    - Otherwise "MSL", or "AGL" as said; a ceiling TNI a foot under its
      figure and a floor ANI a foot over it, as CIFP writes them
      ("05999M", "01501A").
    (None, None) where the figure is not one."""
    if (code or "").upper() == "UNLTD":
        return None, "UNL"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None, None
    desc = (desc or "").upper()
    step = -1 if upper and desc == "TNI" else 1 if not upper and desc == "ANI" else 0
    if (uom or "").upper() == "FL":
        feet = number * 100
        if upper and step and feet == 18000:
            return feet - 1, "MSL"
        return feet, "FL"
    if (code or "").upper() == "SFC":
        return (0.0, "SFC") if number == 0 and not step else (number + step, "AGL")
    return number + step, "MSL"


def _edge_place(geometry) -> tuple[tuple[float, float], float, int]:
    """Where an area's tab goes: the middle of the longest side of its
    largest polygon's outer ring, turned along it and kept upright (-90 to
    90, clockwise), as ForeFlight's lie along a MOA's straight edges; and
    which side of the text the area is on, 1 below and -1 above, for the
    map to set the tab just inside the line. In a plane tangent at the
    side's middle (east scaled by the cosine of the latitude), the web
    map's own angle near it (Mercator is conformal). The outer ring runs
    counter-clockwise (overlays._orient), so the area is on its left."""
    polygon = max(getattr(geometry, "geoms", [geometry]), key=lambda p: p.area)
    ring = list(polygon.exterior.coords)
    k = math.cos(math.radians(polygon.centroid.y))
    a, b = max(zip(ring, ring[1:]), key=lambda s: math.hypot((s[1][0] - s[0][0]) * k, s[1][1] - s[0][1]))
    dx, dy = (b[0] - a[0]) * k, b[1] - a[1]
    turn = math.degrees(math.atan2(dx, dy)) - 90.0
    flipped = False
    while turn > 90.0:
        turn, flipped = turn - 180.0, not flipped
    while turn <= -90.0:
        turn, flipped = turn + 180.0, not flipped
    # Along the side the area is on the left, the text's top; read the
    # other way it is below.
    side = 1 if flipped else -1
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), round(turn, 1), side


def special_use_label_features(pack, bbox=None):
    """The `special_use_labels` layer's lines of GeoJSON: one point an
    area's polygon (_edge_place) with `label` (label_name), `type`, its
    floor and ceiling (limit) as `floor_ft`/`floor_ref` and
    `ceiling_ft`/`ceiling_ref`, `angle` and `side`. A piece the FAA marks
    as cut out of its area (EXCLUSION 1: Brady Low's parts below 1,500 ft
    AGL) is no area of its own and has none."""
    if "sua.attr" not in pack.sections:
        return
    for props, geometry in zip(pack.attrs("sua"), pack.geometries("sua")):
        props = props or {}
        geometry = _orient(geometry)
        if geometry is None or geometry.is_empty or not _meets(geometry.bounds, bbox):
            continue
        if str(props.get("EXCLUSION") or "0").strip() == "1":
            continue
        floor_ft, floor_ref = limit(
            props.get("LOWER_VAL"), props.get("LOWER_UOM"), props.get("LOWER_CODE"), props.get("LOWER_DESC"), upper=False
        )
        ceiling_ft, ceiling_ref = limit(
            props.get("UPPER_VAL"), props.get("UPPER_UOM"), props.get("UPPER_CODE"), props.get("UPPER_DESC"), upper=True
        )
        if floor_ref is None or ceiling_ref is None:
            continue
        (lon, lat), angle, side = _edge_place(geometry)
        type_code = (props.get("TYPE_CODE") or "").strip()
        yield _feature(
            {
                "label": label_name(props.get("NAME") or "", type_code),
                "type": type_code,
                "floor_ft": floor_ft,
                "floor_ref": floor_ref,
                "ceiling_ft": ceiling_ft,
                "ceiling_ref": ceiling_ref,
                "angle": angle,
                "side": side,
            },
            json.dumps({"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}),
            SPECIAL_USE_MIN_ZOOM,
        )
