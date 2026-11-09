"""A logbook entry drawn from the app's own flown track: the data the
engine's rule needs, gathered round the track, and the rule asked.

The rule is the engine's (logbook_from_track,
engine/crates/pilot/src/autolog): the flight time and night (14 CFR 1.1),
the landings for 61.57(a) and (b), the approaches and holds for 61.57(c),
cross-country by 61.1(b), each with its reason. What this adds is what
the engine never fetches:

- the fields near where the track took off, landed or came down low
  (the engine's logbook_track_places names those places): OurAirports'
  places with NASR's elevation, and whether each has a control tower
  (NASR APT_BASE's TWR_TYPE_CODE, faa_data.towered_fields);
- those fields' instrument approaches, drawn from the FAA's CIFP for the
  cycle in force on the day flown (procedures.procedure_drawing), for the
  engine to match the track's finals to.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from . import airports, faa_data, procedures
from .engine import ask as engine
from .terrain import DEFAULT_FAA_CACHE_DIR

log = logging.getLogger(__name__)

#: The fields asked round each place: a field's runways lie within the
#: engine's own radius of it (`within_nm` in its answer); a few nearest
#: are enough to hold the one landed at.
_FIELDS_PER_PLACE = 3
#: At most this many fields' procedures drawn: a day's flying lands at a
#: handful, and each drawing reads the CIFP's legs.
_MOST_FIELDS_DRAWN = 8


def _fields_near(places: list[dict], within_nm: float) -> list[dict]:
    """The fields within `within_nm` of any place, each once, with their
    elevation and tower."""
    towers = faa_data.towered_fields(DEFAULT_FAA_CACHE_DIR)
    found: dict[str, dict] = {}
    for place in places:
        for f in airports.nearest(place["lat"], place["lon"], limit=_FIELDS_PER_PLACE):
            if f["distance_nm"] > within_nm or f["ident"] in found:
                continue
            found[f["ident"]] = {
                "ident": f["ident"], "lat": f["lat"], "lon": f["lon"], "elevation_ft": f.get("elevation_ft"),
                "towered": f["ident"] in towers or (f.get("faa_id") or "") in towers,
            }
    return list(found.values())


def _approach_drawings(idents: list[str], on: date | None) -> list[dict]:
    """Every approach of the fields, drawn from vectors (no transition):
    the engine finds which final the track came down. None for a field the
    CIFP has none for, and none at all where the CIFP cannot be had (the
    entry is then drawn without approaches, and says none were found)."""
    drawings: list[dict] = []
    for ident in idents[:_MOST_FIELDS_DRAWN]:
        try:
            listed = procedures.procedures_at(ident, on)
        except RuntimeError:
            log.warning("No CIFP for the logbook's approaches at %s", ident, exc_info=True)
            return drawings
        for p in (listed or {}).get("procedures", []):
            if p["kind"] != "approach":
                continue
            drawn = procedures.procedure_drawing(ident, p["id"], None, on)
            if drawn:
                drawings.append(drawn)
    return drawings


def draft(points: list[dict], *, aircraft: str | None = None, aircraft_type: str | None = None,
          utc_offset_min: float = 0, picked: str | None = None) -> dict:
    """The draft entry for a flown track (the engine's logbook_from_track
    answer): `points` [{t ms, lat, lon, alt_ft}] in any order."""
    points = sorted(points, key=lambda p: p["t"])
    looked = engine("logbook_track_places", points=points)
    fields = _fields_near(looked["places"], looked["within_nm"])
    flown_on = datetime.fromtimestamp(points[0]["t"] / 1000, tz=timezone.utc).date() if points else None
    drawings = _approach_drawings([f["ident"] for f in fields], flown_on)
    return engine("logbook_from_track", points=points, fields=fields, drawings=drawings, picked=picked,
                  aircraft=aircraft, aircraft_type=aircraft_type, utc_offset_min=utc_offset_min)
