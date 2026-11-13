"""Terrain + registered-obstacle floor for a VFR route -- the minimum
altitude a pilot should plan to cruise at, given what's actually on the
ground along the way. This module reads the ground, the DOF obstacles and
the towns; the clearances below are the engine's (wingtip_engine::altitude::
floor, `vfr_floors`, #482 phase 3), which it asks with them.

The clearances are 14 CFR 91.119's (eCFR, current to 2026-10-22):

  (b) Over congested areas. Over any congested area of a city, town, or
  settlement, or over any open air assembly of persons, an altitude of
  1,000 feet above the highest obstacle within a horizontal radius of
  2,000 feet of the aircraft.

  (c) Over other than congested areas. An altitude of 500 feet above the
  surface, except over open water or sparsely populated areas. In those
  cases, the aircraft may not be operated closer than 500 feet to any
  person, vessel, vehicle, or structure.

The floor is the higher of two figures:

- The ground plus 1,000 ft everywhere (PLANNING_GROUND_MARGIN_FT): the
  owner's planning margin for the altitude plans ("every 500 ft below
  3,000 AGL over a floor 1,000 ft above the ground"), above 91.119(c)'s
  500 ft over open country and equal to (b)'s over a town.
- Each DOF obstacle's top plus 91.119's clearance for where it stands:
  1,000 ft over or within 2,000 ft of a congested area (wingtip.congested: the
  Census urban areas and gazetteer places), and 500 ft elsewhere, since
  500 ft from a structure is at least that over its top. Where the towns
  cannot be read, every obstacle takes 1,000 ft, the safer answer.

91.119's own minimum -- the ground or obstacle plus its clearance, with
the ground's 500 ft over open country -- is kept beside the floor (the
segment's highest_ft and clearance_ft) for a caution to measure a
pilot's own altitude against: between 500 and 1,000 ft over open fields is
legal, under the planner's floor but not 91.119. Over sparsely populated
land 91.119(c) asks only the 500 ft from structures, not over the surface;
the minimum keeps 500 ft over the surface there as well, the simpler and
safer reading. 91.119(a)'s altitude for a power-off landing "without undue
hazard" has no figure, and is the pilot's.

The floor used to take only 100 ft over a DOF obstacle, the sectional
MEF's measurement buffer: a plan could cross a tower in a town at 100 ft
over its top, where 91.119(b) asks 1,000.

Like a sectional's Maximum Elevation Figure it is the highest of those,
rounded up to the next 100 ft, but computed continuously along the actual
route line (every cell of wingtip.ground_grid it crosses, else every
SAMPLE_INTERVAL_NM), not gridded to a fixed 30-minute quadrangle, so it
doesn't dilute a single tall feature across a whole quadrangle the way
the printed chart figure does. It is what the planner suggests, never a
limit: a pilot's own altitude under 91.119's minimum is flown with a
caution (the engine's floor_caution).
"""

import math
import threading
from pathlib import Path

import numpy as np

from . import congested, elevation, faa_data, geo, ground_grid
from .engine import ask as engine
from .units import M_TO_FT

SAMPLE_INTERVAL_NM = 2.0  # how finely to sample terrain along the route
#: How far off the direct line the obstacles are read: past the engine's
#: corridor (5 nm, wingtip_engine::altitude::floor), which picks those
#: that count.
OBSTACLE_READ_NM = 7.0

DEFAULT_FAA_CACHE_DIR = Path(__file__).resolve().parents[3] / "data" / "raw" / "faa_nasr"


def _route_sample_points(route_start: tuple, route_end: tuple, interval_nm: float) -> list:
    total_nm = geo.distance_nm(route_start[0], route_start[1], route_end[0], route_end[1])
    bearing = geo.bearing_deg(route_start[0], route_start[1], route_end[0], route_end[1])
    # Never farther apart than the interval: a floor reads only the ground
    # it samples, so the spacing rounds down, not up (42 N to 43 N is
    # 59.98 nm on WGS-84, 31 samples 1.999 nm apart, not 30 at 2.07).
    n_samples = max(2, math.ceil(total_nm / interval_nm) + 1)
    return [
        geo.destination_point(route_start[0], route_start[1], bearing, d)
        for d in (i * total_nm / (n_samples - 1) for i in range(n_samples))
    ]


# The route's ground, read once however many ask for it at the same time:
# the planner reads it ahead as a route is entered (app.prefetch) and its
# altitude selection may ask while that read is still going -- each one
# reading every point from USGS's EPQS, a few seconds a point, was two
# full reads at once. A second caller waits for the first and is answered
# from the disk cache it filled (wingtip.elevation).
_READING: dict[tuple, threading.Event] = {}
_READING_LOCK = threading.Lock()
# Longer than any one read takes, so a stuck one is not waited on forever.
_READ_WAIT_S = 120


def _elevations_m(points: list) -> dict:
    key = tuple((round(lat, 5), round(lon, 5)) for lat, lon in points)
    with _READING_LOCK:
        running = _READING.get(key)
        if running is None:
            done = _READING[key] = threading.Event()
    if running is not None:
        running.wait(_READ_WAIT_S)
        return elevation.get_elevations_m(points)
    try:
        return elevation.get_elevations_m(points)
    finally:
        with _READING_LOCK:
            del _READING[key]
        done.set()


def floor_profile(
    route_start: tuple,
    route_end: tuple,
    breaks_nm: list,
    sample_interval_nm: float = SAMPLE_INTERVAL_NM,
    faa_cache_dir=DEFAULT_FAA_CACHE_DIR,
) -> list:
    """The MEF-style floor of each segment of the route, in feet MSL, with
    the lowest ground under it and 91.119's own minimum (the engine's
    `vfr_floors` answer, a dict a segment): one per consecutive pair
    of `breaks_nm` (along-track distances from route_start, ascending,
    from 0 to the route's length -- a nav log's fixes, say). The same
    samples, obstacles and margins for every segment, read once
    for the whole route and split by along-track distance, so a leg
    under a low airspace shelf gets its own floor rather than the whole
    route's: that is what lets a nav log step down under the shelf and
    back up past it. Each segment also sees one terrain sample beyond
    either end, and obstacles up to the corridor's half-width beyond, so
    what sits at a boundary counts for both legs.
    """
    # The ground from the built grid where it covers the route (wingtip.
    # ground_grid): every cell the line crosses, its highest ground for the
    # floor and its lowest for the lowest ground under it, in a few array
    # reads; else points along the line read off the tiles, as before.
    lats, lons, along = ground_grid.line_points(route_start, route_end)
    read = ground_grid.ground_ft(lats, lons)
    if read is not None:
        terrain_ft, terrain_low_ft = read
        sample_along = along
    else:
        total_nm = geo.distance_nm(*route_start, *route_end)
        sample_points = _route_sample_points(route_start, route_end, sample_interval_nm)
        spacing_nm = total_nm / (len(sample_points) - 1)
        elevations_m = _elevations_m(sample_points)
        sample_along = np.arange(len(sample_points)) * spacing_nm
        terrain_ft = terrain_low_ft = np.array([elevations_m[p] for p in sample_points]) * M_TO_FT
        lats = np.array([p[0] for p in sample_points])
        lons = np.array([p[1] for p in sample_points])

    # The DOF obstacles near the line and the towns under it and them
    # (wingtip.congested), one read for both; the engine places each
    # obstacle on the line, keeps the corridor's, and gives each 91.119's
    # clearance. Where the towns cannot be read the congested flags go as
    # null and the engine takes 91.119(b)'s 1,000 ft everywhere.
    bbox = geo.corridor_bbox(route_start, route_end, buffer_nm=OBSTACLE_READ_NM)
    obstacles = faa_data.load_obstacles(faa_data.ensure_nasr_file("DOF.DAT", faa_cache_dir), bbox, min_agl_ft=0)
    obstacle_lats = obstacles["lat"].to_numpy(dtype=float) if len(obstacles) else np.empty(0)
    obstacle_lons = obstacles["lon"].to_numpy(dtype=float) if len(obstacles) else np.empty(0)
    over_town = congested.congested(np.concatenate([lats, obstacle_lats]), np.concatenate([lons, obstacle_lons]))
    known = over_town is not None
    types = obstacles["type"].tolist() if len(obstacles) and "type" in obstacles else [None] * len(obstacle_lats)
    heights = obstacles["amsl_ft"].to_numpy(dtype=float) if len(obstacles) else np.empty(0)
    return engine(
        "vfr_floors",
        start=list(route_start),
        end=list(route_end),
        breaks_nm=[float(b) for b in breaks_nm],
        ground={
            "along_nm": [float(a) for a in sample_along],
            "high_ft": [float(h) for h in terrain_ft],
            "low_ft": [float(h) for h in terrain_low_ft],
            "congested": [bool(c) for c in over_town[: len(lats)]] if known else None,
        },
        obstacles=[
            {
                "lat": float(lat),
                "lon": float(lon),
                "amsl_ft": float(ft),
                "type": kind if isinstance(kind, str) else None,
                "congested": bool(over_town[len(lats) + i]) if known else None,
            }
            for i, (lat, lon, ft, kind) in enumerate(zip(obstacle_lats, obstacle_lons, heights, types))
        ],
    )
