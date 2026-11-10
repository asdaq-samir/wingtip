"""Each Class B, C and D's primary field, from the FAA's airspace file,
which names each for one field: what the map's list of fields
(/api/airports/in-view) marks so the field an airspace is named for shows
first where only one fits (zoomed out over Texas it showed Love Field and
Hobby, not DFW and Intercontinental at their rings' middle; the owner,
2026-11-03)."""

import functools
from pathlib import Path

from . import airspace
from .terrain import DEFAULT_FAA_CACHE_DIR


def primaries() -> dict[str, str]:
    """Each Class B, C and D's primary field, by the FAA location
    identifier the airspace file names it by, to the highest class it is
    the primary of; empty where the FAA's airspace cannot be had."""
    try:
        shp_path = Path(airspace.ensure_class_airspace_shapefile(DEFAULT_FAA_CACHE_DIR))
        return primaries_of(str(shp_path), shp_path.stat().st_mtime)
    except (OSError, RuntimeError):
        return {}


@functools.lru_cache(maxsize=2)
def primaries_of(shp_path: str, _mtime: float) -> dict[str, str]:
    found: dict[str, str] = {}
    for polygon in airspace._load_all_controlled_airspace(shp_path):
        ident, cls = polygon.get("ident"), polygon.get("class")
        if ident and cls in ("B", "C", "D") and cls < found.get(ident, "Z"):
            found[ident] = cls
    return found
