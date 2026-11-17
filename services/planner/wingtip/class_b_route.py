"""Avoid Class B, for the Routes (the owner, 2026-11-17: "You can still
avoid class B in the suggested routes"). The plan always flies through
Class B with the clearance it takes (14 CFR 91.131(a)(1)); where the route
as planned enters one at its altitude, this is the same route with, on
each leg that enters, the best of the fixes that keep both legs out
(the engine's class_b_entered and class_b_detours, read on the FAA's
Class Airspace shapefile by wingtip.airspace). The engine's route_options
builds it as a way with its fuel stops (route/options/class_b_way.rs)."""

from __future__ import annotations

from itertools import pairwise

from cachetools import TTLCache

from . import airspace, fixes
from . import altitude as altitude_module

#: class_b_ways by leg and altitude: the Routes are asked again with every
#: airplane, time and minimums, and the detours were worked out afresh
#: each time, a third of a second a leg (py-spy, 2026-10-20). The airspace
#: changes only with the FAA's chart cycle; six hours is well inside one.
_CLASS_B_WAYS: TTLCache = TTLCache(maxsize=512, ttl=6 * 3600)


def class_b_ways(start: tuple, end: tuple, cruise_ft: float) -> list[dict] | None:
    """Where a leg flown at `cruise_ft` enters Class B, the fixes that keep
    it out at that altitude, best first (wingtip.airspace.detour_waypoints;
    empty where none does); None where it passes under, over or round it."""
    key = (round(start[0], 4), round(start[1], 4), round(end[0], 4), round(end[1], 4), cruise_ft)
    if key in _CLASS_B_WAYS:
        return _CLASS_B_WAYS[key]
    shp_path = airspace.ensure_class_airspace_shapefile(altitude_module.DEFAULT_FAA_CACHE_DIR)
    ways = airspace.detour_waypoints(start, end, shp_path, cruise_ft) if airspace.class_b_entered(start, end, shp_path, cruise_ft) else None
    _CLASS_B_WAYS[key] = ways
    return ways


def class_b_route(points: list[tuple], idents: list[str], landed: list[bool], cruise_ft: float) -> dict | None:
    """The route through `points` (its ends included; `idents` and
    `landed` its points between them) with the best fix round the Class B
    put in each leg that enters it at `cruise_ft`, as route_options' `class_b`
    takes it: {"points", "idents", "landed"} between the ends. None where no
    leg enters Class B, or one that does has no way round: Avoid Class B is
    then not offered."""
    out_points: list[list[float]] = []
    out_idents: list[str] = []
    out_landed: list[bool] = []
    entered = False
    for i, (a, b) in enumerate(pairwise(points)):
        if i > 0:
            out_points.append([a[0], a[1]])
            out_idents.append(idents[i - 1])
            out_landed.append(landed[i - 1] if i - 1 < len(landed) else False)
        ways = class_b_ways(a, b, cruise_ft)
        if ways is None:
            continue
        fix = fixes.find_fix(ways[0]["ident"]) if ways else None
        if fix is None:
            return None
        entered = True
        out_points.append([fix["lat"], fix["lon"]])
        out_idents.append(ways[0]["ident"])
        out_landed.append(False)
    return {"points": out_points, "idents": out_idents, "landed": out_landed} if entered else None
