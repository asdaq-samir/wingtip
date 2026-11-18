"""The overlay tiles' layers read from NASR's CSV files (charts.overlays
builds the archive): the `navaids`, `fixes` and `runways` layers, and each
field's runways (runways_by_site), which the `airports` layer reads
(charts.airports). Where each comes from is charts.overlays' docstring.
Split from charts/overlays.py (2026-11-18), which had grown to 652 lines."""

from __future__ import annotations

import csv
import json
from functools import lru_cache
from pathlib import Path

from wingtip import geo
from wingtip.units import M_PER_FT, M_PER_NM

from .overlay_layers import CHARTED_FIX_MIN_ZOOM, FIX_MIN_ZOOM, NAVAID_MIN_ZOOM, RUNWAY_MIN_ZOOM, VOR_MIN_ZOOM, _feature, _meets


def _rows(path: Path):
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        yield from csv.DictReader(f)


def _number(text) -> float | None:
    try:
        return float((text or "").strip())
    except ValueError:
        return None


@lru_cache(maxsize=256)
def _hard(surface: str) -> bool:
    """Whether NASR's SURFACE_TYPE_CODE is a hard surface, the sectional's
    "hard-surfaced runways": the engine's runway_hard_surface, asked once
    a code."""
    from wingtip.engine import ask

    return bool(ask("runway_hard_surface", surface=surface or "")["hard"])


def runways_by_site(rwy_path: Path, rwy_end_path: Path | None) -> dict[str, dict]:
    """Each field's runways, by NASR's SITE_NO: its longest (RWY_LEN, ft),
    its longest hard-surfaced one (_hard), and the true alignment
    of its longest's first end (APT_RWY_END's TRUE_ALIGNMENT, degrees).
    Helipads (RWY_ID H1 and the like) are no runways here."""
    found: dict[str, dict] = {}
    for row in _rows(rwy_path):
        site, rwy = (row.get("SITE_NO") or "").strip(), (row.get("RWY_ID") or "").strip().upper()
        length = _number(row.get("RWY_LEN"))
        if not site or not rwy or rwy.startswith("H") or not length:
            continue
        held = found.setdefault(site, {"longest_ft": 0, "hard_ft": 0, "longest_id": None})
        if length > held["longest_ft"]:
            held["longest_ft"], held["longest_id"] = int(length), rwy
        if _hard(row.get("SURFACE_TYPE_CODE") or "") and length > held["hard_ft"]:
            held["hard_ft"] = int(length)
    if rwy_end_path is not None:
        for row in _rows(rwy_end_path):
            held = found.get((row.get("SITE_NO") or "").strip())
            if held is None or "runway_true" in held or (row.get("RWY_ID") or "").strip().upper() != held["longest_id"]:
                continue
            alignment = _number(row.get("TRUE_ALIGNMENT"))
            if alignment is not None:
                held["runway_true"] = int(alignment) % 360
    return found


def navaid_features(nav_path: Path, bbox=None, rmk_path: Path | None = None):
    """The `navaids` layer's lines: wingtip.fixes's navaids in service,
    with their own remarks from NAV_RMK.csv where rmk_path is given
    (wingtip.fixes.navaid_remarks: where the signal is unusable, the Chart
    Supplement's service volume restrictions, AIM 1-1-8), one a line, for
    a VOR's card to show without asking the planner."""
    from wingtip import fix_rows, fixes

    for found in fix_rows._read_navaids(nav_path).values():
        for n in found:
            if not _meets((n["lon"], n["lat"], n["lon"], n["lat"]), bbox):
                continue
            said = fixes.navaid_remarks(n["ident"], n["kind"], rmk_path.parent) if rmk_path is not None else []
            yield _feature(
                {
                    "ident": n["ident"],
                    "name": n["name"],
                    "kind": n["kind"],
                    "freq": n["freq"],
                    "channel": n["channel"],
                    "service_volume": n["service_volume"],
                    "mag_var": n["mag_var"],
                    "elevation_ft": n["elevation_ft"],
                    "hours": n["hours"],
                    "restricted": n["restricted"],
                    "remarks": "\n".join(said) or None,
                },
                f'{{"type":"Point","coordinates":[{n["lon"]},{n["lat"]}]}}',
                VOR_MIN_ZOOM if n["kind"] in fix_rows.VOR_KINDS else NAVAID_MIN_ZOOM,
            )


def fix_features(fix_path: Path, bbox=None):
    """The `fixes` layer's lines: every row of FIX_BASE (wingtip.fix_rows.read_rows)."""
    from wingtip import fix_rows

    for f in fix_rows.read_rows(fix_path):
        if not _meets((f["lon"], f["lat"], f["lon"], f["lat"]), bbox):
            continue
        yield _feature(
            {"ident": f["ident"], "kind": f["kind"], "vfr": f["vfr"], "enroute_low": f["enroute_low"]},
            f'{{"type":"Point","coordinates":[{f["lon"]},{f["lat"]}]}}',
            CHARTED_FIX_MIN_ZOOM if f["vfr"] or f["enroute_low"] else FIX_MIN_ZOOM,
        )


def _runway_corners(a, b, width_m: float) -> list[list[float]]:
    """The four corners of a runway's surface, (lon, lat), from its two
    ends' positions and its width: half the width square off each end's
    true course to the other (wingtip.geo), as a closed counter-clockwise
    ring (RFC 7946)."""
    half_nm = width_m / 2 / M_PER_NM

    def beside(end, other, side: float) -> list[float]:
        lat, lon = geo.destination_point(end[1], end[0], geo.bearing_deg(end[1], end[0], other[1], other[0]) + side, half_nm)
        return [round(lon, 7), round(lat, 7)]

    ring = [beside(a, b, 90.0), beside(b, a, -90.0), beside(b, a, 90.0), beside(a, b, -90.0)]
    if (ring[1][0] - ring[0][0]) * (ring[2][1] - ring[0][1]) - (ring[1][1] - ring[0][1]) * (ring[2][0] - ring[0][0]) < 0:
        ring.reverse()
    return [*ring, ring[0]]


def _true_bearing(a, b) -> int:
    """The initial great-circle bearing from a to b, (lon, lat), degrees
    true, whole: the heading of an airplane landing on a's end towards b
    (wingtip.geo.bearing_deg, PROJ's on the planner's sphere)."""
    return round(geo.bearing_deg(a[1], a[0], b[1], b[0])) % 360


def runway_features(rwy_path: Path, rwy_end_path: Path, bbox=None):
    """The `runways` layer's lines: for each runway whose two ends NASR
    surveys (APT_RWY_END LAT_DECIMAL/LONG_DECIMAL), its surface (`part`
    surface, a polygon RWY_WIDTH wide), its centreline (`part`
    centreline) and each end (`part` end: RWY_END_ID and the true heading
    along the runway from it). Helipads (RWY_ID H1 and the like) and
    runways with an end unsurveyed are left out: no shape is guessed."""
    widths: dict[tuple[str, str], tuple[float | None, str]] = {}
    for row in _rows(rwy_path):
        key = ((row.get("SITE_NO") or "").strip(), (row.get("RWY_ID") or "").strip().upper())
        widths[key] = (_number(row.get("RWY_WIDTH")), (row.get("SURFACE_TYPE_CODE") or "").strip().upper())
    ends: dict[tuple[str, str], list[tuple[str, tuple[float, float]]]] = {}
    for row in _rows(rwy_end_path):
        key = ((row.get("SITE_NO") or "").strip(), (row.get("RWY_ID") or "").strip().upper())
        lat, lon = _number(row.get("LAT_DECIMAL")), _number(row.get("LONG_DECIMAL"))
        if not key[0] or key[1].startswith("H") or lat is None or lon is None:
            continue
        ends.setdefault(key, []).append(((row.get("RWY_END_ID") or "").strip().upper(), (lon, lat)))
    for key, pair in ends.items():
        if len(pair) != 2:
            continue
        (id_a, a), (id_b, b) = pair
        box = (min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1]))
        if not _meets(box, bbox):
            continue
        width_ft, surface = widths.get(key, (None, ""))
        props = {"site_no": key[0], "runway": key[1], "width_ft": width_ft, "surface": surface, "hard": _hard(surface)}
        ring = _runway_corners(a, b, (width_ft or 75) * M_PER_FT)
        yield _feature({**props, "part": "surface"}, json.dumps({"type": "Polygon", "coordinates": [ring]}), RUNWAY_MIN_ZOOM)
        yield _feature(
            {**props, "part": "centreline"}, json.dumps({"type": "LineString", "coordinates": [list(a), list(b)]}), RUNWAY_MIN_ZOOM
        )
        for end_id, here, there in ((id_a, a, b), (id_b, b, a)):
            yield _feature(
                {**props, "part": "end", "end_id": end_id, "heading": _true_bearing(here, there)},
                json.dumps({"type": "Point", "coordinates": list(here)}),
                RUNWAY_MIN_ZOOM,
            )
