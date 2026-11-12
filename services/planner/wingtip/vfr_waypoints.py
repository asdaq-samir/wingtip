"""The VFR waypoints in the map's view (/api/waypoints/in-view): the
magenta flags the sectional prints round busy airspace, from NASR's fixes
(wingtip.fixes, its VFR waypoints indexed apart), each with where it is
in a pilot's words (wingtip.places.describe). A waypoint's words are
worked once and kept: a pan of the map asks the same few hundred again."""

from __future__ import annotations

from . import fixes, places

# Each waypoint's words by (ident, lat, lon), once the places are loaded:
# they are loaded once a process, so the words never change after.
_DESCRIBED: dict[tuple, str | None] = {}


def _described(fix: dict) -> str | None:
    key = (fix["ident"], fix["lat"], fix["lon"])
    held = _DESCRIBED.get(key, _DESCRIBED)
    if held is not _DESCRIBED:
        return held
    table = places.loaded()
    words = places.describe(fix["lat"], fix["lon"], table)
    if table is not None:
        _DESCRIBED[key] = words
    return words


def in_view(south: float, west: float, north: float, east: float, limit: int) -> list[dict]:
    """The VFR waypoints inside the box, by ident, at most `limit`:
    {"ident", "lat", "lon", "description"}."""
    found = sorted(fixes.within(south, west, north, east, vfr=True), key=lambda f: f["ident"])
    return [{"ident": f["ident"], "lat": f["lat"], "lon": f["lon"], "description": _described(f)} for f in found[:limit]]
