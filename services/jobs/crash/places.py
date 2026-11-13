"""Where an FAA report's place is, and which clocks it keeps: a state's
name as the FAA writes it ("Kentucky") to its postal code, and the IANA
zones the place may keep, for the offsets from UTC its local time is read
at (the engine's occurrence_identity widens its window over all of them,
so a place near a zone line is never read at the wrong one).

Not a rule, and not kept here: the states and territories, their postal
codes and the zones each keeps are the `us` package's (Sunlight Labs'
metadata, BSD), and the zone at the town's own point
tzfpy's (the timezone-boundary-builder's polygons over OpenStreetMap, the
IANA database's zones). The point's zone catches what a state's list
leaves out: the Navajo Nation in Arizona keeps summer time, which the rest
of Arizona does not."""

from __future__ import annotations

import datetime as dt
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import tzfpy
import us
from wingtip import geocode


def state_code(text: str | None) -> str | None:
    """ "Kentucky", "KY", "D.C." or "U.S. Virgin Islands" as its postal
    code; None for anything else, a state that no longer is among them."""
    t = re.sub(r"(?i)^u\.s\.\s+", "", (text or "").strip()).replace(".", "").strip()
    found = us.states.lookup(t) if t else None
    return found.abbr if found is not None and not found.is_obsolete else None


def offsets_min(state: str | None, local_date: str, point: tuple[float, float] | None = None) -> list[float]:
    """The offsets from UTC the state's places, and the zone at `point`
    (lat, lon) where it is given, keep on that date, minutes, at local
    noon (summer time included); none for a state not known and no point,
    which the engine reads at every US offset."""
    found = us.states.lookup(state) if state else None
    zones = list(found.time_zones) if found is not None else []
    if point is not None and (zone := tzfpy.get_tz(point[1], point[0])):
        zones.append(zone)
    day = dt.date.fromisoformat(local_date)
    out: list[float] = []
    for zone in zones:
        try:
            offset = dt.datetime.combine(day, dt.time(12), ZoneInfo(zone)).utcoffset()
        except ZoneInfoNotFoundError:
            # An old alias (America/Indianapolis) Debian's tzdata no longer
            # ships; its state lists the zone it stands for as well.
            continue
        if offset is not None and offset.total_seconds() / 60 not in out:
            out.append(offset.total_seconds() / 60)
    return out


def town_point(city: str | None, state: str | None) -> tuple[float, float] | None:
    """The town's internal point (the Census Bureau's gazetteer, through
    wingtip.geocode), where the name is one of the state's places exactly."""
    if not city or not state:
        return None
    for town in geocode.find_towns(f"{city}, {state}", limit=10):
        name, _, code = town["label"].rpartition(", ")
        if name.lower() == city.strip().lower() and code == state:
            return town["lat"], town["lon"]
    return None
