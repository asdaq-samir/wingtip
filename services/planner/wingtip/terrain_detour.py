"""A way round high ground for an airplane that cannot climb over it: the
fields with fuel to fly by, in order, so that every leg between them keeps
clear of the ground at an altitude the airplane can reach.

The planner says when a route has no legal altitude because the terrain
under its straight line needs more than the airplane's service ceiling
allows (wingtip.planning.no_altitude); a pilot then goes round, by the passes
and the low country. The way round -- which cells can be flown over, the
shortest way over them and the stepping stones along it -- is the
engine's (engine/crates/route/src/route/options/terrain.rs,
`terrain_way_round`; #482 phase 5). This reads what it reads: the ground's
height at the samples its frame names (`terrain_way_frame`), off the
terrain tiles (wingtip.elevation's terrarium tiles at a coarse zoom, which
route options reads too), and the fields with fuel round it
(wingtip.fuelstops); and names the way's own turns as points of the
pilot's own off the nearest fix (wingtip.fixes.frd_near).

It only suggests: the route through the fields is planned as any route
is, its floor read along each leg at full resolution (wingtip.terrain).
"""

from __future__ import annotations

import threading

import numpy as np

from . import elevation, fixes, fuelstops, geo
from .engine import ask as engine
from .units import M_TO_FT

#: The terrarium tiles' zoom read: a pixel about 0.02 degrees, 1.3 nm.
ZOOM = 6


def heights_ft(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """The ground's height at each point, feet, from the terrain tiles."""
    fx, fy = geo.tile_xy(lats, lons, ZOOM)
    tx, ty = np.floor(fx).astype(int), np.floor(fy).astype(int)
    out = np.zeros(lats.shape, dtype=np.float64)
    for x, y in set(zip(tx.ravel().tolist(), ty.ravel().tolist())):
        tile = elevation._terrain_tile(ZOOM, x, y)
        size = tile.shape[0]
        at = (tx == x) & (ty == y)
        col = np.minimum(size - 1, ((fx[at] - x) * size).astype(int))
        row = np.minimum(size - 1, ((fy[at] - y) * size).astype(int))
        out[at] = tile[row, col]
    return np.maximum(out, 0.0) * M_TO_FT


def way_round(start: tuple, end: tuple, ceiling_ft: float, fields=None) -> list[dict] | None:
    """The way round (_way_round), kept for each route and ceiling: every
    re-plan of a route over high ground -- each altitude picked on the
    wheel is one -- asks for it again, a few seconds each."""
    if fields is not None:
        return _way_round(start, end, ceiling_ft, fields)
    frame = engine("terrain_way_frame", start=list(start), end=list(end), ceiling_ft=ceiling_ft)
    # Keyed by the highest cruising altitude the ceiling allows, not the
    # ceiling itself: a forecast's warmth moves the ceiling a few feet
    # from one plan to the next without changing the way.
    key = (round(start[0], 4), round(start[1], 4), round(end[0], 4), round(end[1], 4), frame["top_ft"])
    with _KEPT_LOCK:
        if key in _KEPT:
            found = _KEPT[key]
            return None if found is None else [dict(p) for p in found]
    found = _way_round(start, end, ceiling_ft)
    with _KEPT_LOCK:
        _KEPT[key] = None if found is None else tuple(found)
        while len(_KEPT) > 64:
            _KEPT.pop(next(iter(_KEPT)))
    return None if found is None else [dict(p) for p in found]


_KEPT: dict = {}
_KEPT_LOCK = threading.Lock()


def _way_round(start: tuple, end: tuple, ceiling_ft: float, fields=None) -> list[dict] | None:
    """The fields with fuel to fly by, in order, from `start` to `end`
    ((lat, lon)), the engine's: each a dict of ident, name, lat and lon.
    None where there is no such way in reach, or a turn of it cannot be
    named off a fix; [] where the straight line is clear already."""
    frame = engine("terrain_way_frame", start=list(start), end=list(end), ceiling_ft=ceiling_ft)
    step = frame["cell_deg"] / frame["per_cell"]
    lats = frame["lat0"] + (np.arange(frame["rows"] * frame["per_cell"]) + 0.5) * step
    lons = frame["lon0"] + (np.arange(frame["cols"] * frame["per_cell"]) + 0.5) * step
    heights = heights_ft(*np.meshgrid(lats, lons, indexing="ij"))
    table = fields if fields is not None else fuelstops.fields_with_fuel()
    s, w, n, e = frame["data_box"]
    near = table[(table["lat"] >= s) & (table["lat"] <= n) & (table["lon"] >= w) & (table["lon"] <= e)]
    stones = engine(
        "terrain_way_round",
        start=list(start),
        end=list(end),
        ceiling_ft=ceiling_ft,
        terrain_ft=np.rint(heights).astype(int).ravel().tolist(),
        fields=[
            {"ident": str(r["ident"]), "name": str(r["name"]), "lat": float(r["lat"]), "lon": float(r["lon"])}
            for r in near.to_dict("records")
        ],
    )
    if stones is None:
        return None
    out = []
    for stone in stones:
        if stone["ident"] is not None:
            out.append(stone)
            continue
        # Where no field will do, a point of the pilot's own off the
        # nearest fix, so a chain is always there.
        own = fixes.frd_near(stone["lat"], stone["lon"])
        if own is None:
            return None
        out.append({"ident": own["ident"], "name": own["name"], "lat": stone["lat"], "lon": stone["lon"]})
    return out
