"""The fields along a route a stop may be, for the map's Stops
(/api/stops/along, app.routers.airports): the route's corridor searched
(wingtip.fuelstops) and each field's distance off its flight's line."""

import functools

import numpy as np
from wingtip import airports, fuelstops, geo

from .router_basics import load_route


def off_course_nm(start: tuple, end: tuple, lat: float, lon: float) -> float:
    """How far a point is off the straight course from start to end, nm:
    its least distance to the line, read every hundredth of the way."""
    t = np.linspace(0.0, 1.0, 101)
    lats = start[0] + (end[0] - start[0]) * t
    lons = start[1] + (end[1] - start[1]) * t
    return float(np.min(geo.distance_nm(lats, lons, lat, lon)))


#: How far off the course a field is offered along a route, nm: a short
#: turn off the way for lunch, the owner's pick (2026-10-26, "10-15 nm off
#: course"), where wingtip.fuelstops' corridor reached 30.
STOP_OFF_COURSE_NM = 15.0


@functools.lru_cache(maxsize=64)
def corridor(dep: str, dest: str, stops: str, day: str) -> tuple[tuple[dict, float], ...]:
    """The fields along a route that a stop may be, each with how far off
    its flight's line it is: the route loaded, the corridor searched and
    every field's distance to the line read, the same for the same route
    whatever the places near them say. Kept per route for the UTC day (the
    airport data turns over with its cycle, not within a day), so the
    Stops list asked again -- each Overture read finishing, the pilot's
    filter changed -- reads only the places, which wingtip.nearby keeps on
    disk per release; it worked the corridor out again on every ask, 1 to
    3.4 s (the 23 Oct audit; the web audit's WEB-31). `day` is the cache's
    key alone."""
    r = load_route(dep, dest, stops)
    flights = [(f.dep_ident, f.start, f.end) for f in r.flights]
    kept: list[tuple[dict, float]] = []
    for field in fuelstops.along(flights, skip=set(r.idents)):
        # Not the airline airports, as round the pilot: Detroit's food is
        # past security, not a fly-in lunch (its first answer along a route).
        if (airports.find_place(field["ident"]) or {}).get("kind") == "large":
            continue
        _, start, end = flights[field["flight"]]
        # Off course first: a field too far off is not read for its places.
        off = off_course_nm(start, end, field["lat"], field["lon"])
        if off <= STOP_OFF_COURSE_NM:
            kept.append((field, off))
    return tuple(kept)
