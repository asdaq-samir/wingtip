"""Airport identifier -> coordinates lookup, plus runway and frequency
data: OurAirports' free tables (three sibling CSVs from the same host) for
the idents, sizes and fields abroad, and NASR's own figures -- position,
elevation, runways -- for every field NASR lists (wingtip.nasr_fields).

The one name the rest of the planner asks these through: the work is in
airport_tables (the files), airport_lookup (one airport), airport_us and
airport_places (the US table, search, places, nearest) and airport_comms
(runways and frequencies).
"""

from pathlib import Path

from .airport_comms import get_frequencies, get_frequencies_for, get_runways
from .airport_lookup import get_airport, wikipedia_link
from .airport_places import find_place, nearest, nearest_abroad, places_in
from .airport_places import _place_index
from .airport_tables import (
    DEFAULT_CACHE_PATH,
    FREQUENCIES_CACHE_PATH,
    OURAIRPORTS_URL,
    RUNWAYS_CACHE_PATH,
    RUNWAYS_URL,
    _airport_rows,
    _ensure_cached,
    _faa_key,
    load_airports,
)
from .airport_us import count_airports, search_airports, search_index

__all__ = [
    "DEFAULT_CACHE_PATH",
    "FREQUENCIES_CACHE_PATH",
    "RUNWAYS_CACHE_PATH",
    "RUNWAYS_URL",
    "count_airports",
    "find_place",
    "get_airport",
    "get_frequencies",
    "get_frequencies_for",
    "get_runways",
    "load_airports",
    "nearest",
    "nearest_abroad",
    "places_in",
    "preload_lookup",
    "search_airports",
    "search_index",
    "wikipedia_link",
]


def preload_lookup(cache_path: Path = DEFAULT_CACHE_PATH) -> None:
    """get_airport's index made now (the planner's warm-up), not by the
    first route asked for after a restart: a quarter of a second. And
    find_place's, the Stops' along a route."""
    path = _ensure_cached(OURAIRPORTS_URL, cache_path)
    _airport_rows(str(path), path.stat().st_mtime)
    _place_index(str(path), path.stat().st_mtime, *_faa_key(cache_path))
