"""The towns a route may be over, for the terrain floor's clearances
(wingtip.terrain), which 14 CFR 91.119 sets by them -- read here, and
held to the rule by the engine (`congested_points`, engine/crates/altitude/
src/altitude/congested.rs: inside a town or within (b)'s 2,000 ft of one):

  (b) Over congested areas. Over any congested area of a city, town, or
  settlement, or over any open air assembly of persons, an altitude of
  1,000 feet above the highest obstacle within a horizontal radius of
  2,000 feet of the aircraft.

  (c) Over other than congested areas. An altitude of 500 feet above the
  surface, except over open water or sparsely populated areas. In those
  cases, the aircraft may not be operated closer than 500 feet to any
  person, vessel, vehicle, or structure.

(eCFR, Title 14, current to 2026-10-22.) 14 CFR 1.1 does not define a
congested area; the FAA judges it case by case. So the towns are read
from two Census Bureau data sets, both the US government's and public
domain, and anything either of them names counts:

- The 2020 Census urban areas (cartographic boundary file
  cb_2020_us_ua20_corrected_500k, the 2023 correction): every built-up
  area of 5,000 people or 2,000 housing units and more, drawn round its
  houses rather than its town line.
- The places in the Census gazetteer wingtip.geocode already keeps (every
  incorporated place and census-designated place, 2025): the villages
  under the urban areas' threshold, which 91.119(b)'s "settlement" still
  takes in. The gazetteer gives a point and a land area, not an outline,
  so each is a circle of that area round its point, at most
  PLACE_RADIUS_M -- a place's land can be a whole county (Greeley County,
  Kansas), and only its core is built on.

Neither knows an open air assembly of persons (a fair, a race), which is
the pilot's to see. Where the data cannot be had, nothing can be ruled
out, and the caller takes every point as congested: 91.119(b)'s 1,000 ft,
the safer answer.
"""

from __future__ import annotations

import logging
import math
import pickle
import threading
import time
from pathlib import Path

import numpy as np
import requests
import shapely

from . import geocode
from .engine import ask as engine
from .units import M_PER_FT, M_PER_NM, NM_PER_DEG_LAT

logger = logging.getLogger(__name__)

DIR = Path(__file__).resolve().parents[3] / "data" / "raw" / "census"
#: The Census Bureau's own file, pinned to the 2020 urban areas, so a later
#: delineation cannot move a town's edge under a kept answer.
URBAN_AREAS_URL = "https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_ua20_corrected_500k.zip"
URBAN_AREAS_PATH = DIR / "cb_2020_us_ua20_corrected_500k.zip"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; wingtip-maps/0.1; terrain floor)"}
#: How far round a point the towns are looked for, ft: wider than 14 CFR
#: 91.119(b)'s "horizontal radius of 2,000 feet" the engine holds each
#: point to, so a town near that edge is always among those it measures.
SEARCH_FT = 2500.0
#: The largest circle a gazetteer place is drawn as, m: a nautical mile,
#: the planner's own figure -- about the built-up core of a small town.
PLACE_RADIUS_M = M_PER_NM
#: A degree of latitude: sixty nautical miles (wingtip.units.NM_PER_DEG_LAT),
#: near enough (the earth's flattening moves it under 1% from the equator to
#: the pole), as the engine has it.
M_PER_DEG_LAT = NM_PER_DEG_LAT * M_PER_NM
FT_PER_DEG_LAT = M_PER_DEG_LAT / M_PER_FT
#: After a failed download, the next try waits this long.
RETRY_AFTER_S = 300

_LOCK = threading.Lock()
_HELD: dict = {}
_RETRY_AT = 0.0


def _urban_areas() -> list:
    """The urban areas' outlines, downloaded once and kept."""
    if not URBAN_AREAS_PATH.exists():
        resp = requests.get(URBAN_AREAS_URL, headers=HEADERS, timeout=60)
        resp.raise_for_status()
        DIR.mkdir(parents=True, exist_ok=True)
        part = URBAN_AREAS_PATH.with_suffix(".part")
        part.write_bytes(resp.content)
        part.replace(URBAN_AREAS_PATH)
    # Kept beside the download as WKB, keyed by its size and time: pyshp
    # and shapely building every outline from lists was 3 to 4 CPU-seconds
    # of each planner start, where WKB is read back in a fraction of one
    # (2026-11-01).
    # The cycle pack's outlines first, where it was made from this download.
    from . import cycle_pack

    packed = cycle_pack.current()
    if cycle_pack.matches(packed, "urban", URBAN_AREAS_PATH):
        return packed.geometries("urban")
    stat = URBAN_AREAS_PATH.stat()
    key = (stat.st_size, stat.st_mtime)
    kept = URBAN_AREAS_PATH.with_suffix(".wkb.pkl")
    try:
        with kept.open("rb") as f:
            kept_key, wkb = pickle.load(f)
        if kept_key == key:
            return list(shapely.from_wkb(wkb))
    except Exception:  # noqa: BLE001 -- missing or damaged: read from the shapefile again
        pass
    import shapefile
    from shapely.geometry import shape

    with shapefile.Reader(str(URBAN_AREAS_PATH)) as reader:
        areas = [shape(s.__geo_interface__) for s in reader.iterShapes()]
    part = kept.with_suffix(".part")
    try:
        with part.open("wb") as f:
            pickle.dump((key, shapely.to_wkb(areas)), f, protocol=pickle.HIGHEST_PROTOCOL)
        part.replace(kept)
    except OSError as err:
        logger.warning("Census urban areas not kept as WKB: %s", err)
    return areas


def _places() -> list:
    """Each gazetteer place as a circle of its land area, at most
    PLACE_RADIUS_M, in degrees round its point (east-west scaled by its
    latitude). Empty where the gazetteer cannot be had."""
    towns = geocode._towns()
    if not towns:
        return []
    lats = np.array([t[2] for t in towns], dtype=float)
    lons = np.array([t[3] for t in towns], dtype=float)
    radius_m = np.minimum(np.sqrt(np.array([t[4] for t in towns], dtype=float) / math.pi), PLACE_RADIUS_M)
    # A circle in degrees of latitude, stretched east-west by the latitude's
    # cosine: a degree of longitude is that much shorter. Sixteen sides,
    # all the places at once.
    r_lat = np.maximum(radius_m, 1.0) / M_PER_DEG_LAT
    r_lon = r_lat / np.maximum(0.2, np.cos(np.radians(lats)))
    angle = np.linspace(0.0, 2 * math.pi, 17)
    ring = np.stack([lons[:, None] + r_lon[:, None] * np.cos(angle), lats[:, None] + r_lat[:, None] * np.sin(angle)], axis=-1)
    ring[:, -1] = ring[:, 0]
    return list(shapely.polygons(ring))


def _tree() -> shapely.STRtree | None:
    """Every congested area, in one tree; None where either data set could
    not be had (both are needed to rule a point out)."""
    global _RETRY_AT
    with _LOCK:
        if "tree" in _HELD:
            return _HELD["tree"]
        if time.monotonic() < _RETRY_AT:
            return None
        try:
            areas = _urban_areas()
        except (requests.RequestException, OSError, ValueError) as err:
            logger.warning("No Census urban areas, every point taken as congested: %s", err)
            _RETRY_AT = time.monotonic() + RETRY_AFTER_S
            return None
        places = _places()
        if not places:
            logger.warning("No Census gazetteer of places, every point taken as congested")
            _RETRY_AT = time.monotonic() + RETRY_AFTER_S
            return None
        _HELD["tree"] = shapely.STRtree(areas + places)
        return _HELD["tree"]


def preload() -> None:
    """Read the towns now, not on the first route's ask."""
    _tree()


def _rings(geometry) -> list:
    """A town's outline as the engine reads it: each polygon its outer ring
    and holes, each ring [[lon, lat], ...]."""
    parts = getattr(geometry, "geoms", [geometry])
    return [
        [shapely.get_coordinates(ring).tolist() for ring in (part.exterior, *part.interiors)] for part in parts if hasattr(part, "exterior")
    ]


def congested(lats, lons) -> np.ndarray | None:
    """Whether each point is over a congested area or within 91.119(b)'s
    2,000 ft of one, the engine's (`congested_points`); None where that
    cannot be told (the data could not be had), for the caller to take
    every point as congested.

    One ask a route: the towns within SEARCH_FT of each point by their
    boxes (the tree), each outline sent once and each point with the
    indices of its own, so a route over Chicago measures its thousands of
    obstacles against the towns near them alone."""
    lats = np.asarray(lats, dtype=float)
    lons = np.asarray(lons, dtype=float)
    if lats.size == 0:
        return np.zeros(0, dtype=bool)
    tree = _tree()
    if tree is None:
        return None
    found = np.zeros(lats.size, dtype=bool)
    # Degrees never short of SEARCH_FT any way: a degree of longitude is
    # shorter than one of latitude by the latitude's cosine.
    widest = max(0.2, math.cos(math.radians(min(89.0, float(np.abs(lats).max())))))
    reach = SEARCH_FT / FT_PER_DEG_LAT / widest
    near_point, near_area = tree.query(shapely.points(lons, lats), predicate="dwithin", distance=reach)
    if not near_point.size:
        return found
    asked = np.unique(near_point)
    towns, index = np.unique(near_area, return_inverse=True)
    candidates: dict[int, list[int]] = {int(i): [] for i in asked}
    for i, j in zip(near_point.tolist(), index.tolist()):
        candidates[i].append(j)
    answer = engine(
        "congested_points",
        areas=[_rings(tree.geometries[j]) for j in towns.tolist()],
        points=[[float(lats[i]), float(lons[i])] for i in asked.tolist()],
        candidates=[candidates[i] for i in asked.tolist()],
    )
    found[asked] = np.asarray(answer, dtype=bool)
    return found
