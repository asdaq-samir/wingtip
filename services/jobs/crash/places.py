"""Where an FAA report's place is, and which clocks it keeps: a state's
name as the FAA writes it ("Kentucky") to its postal code, and the IANA
zones a state's places may keep, for the offsets from UTC its local time
is read at (the engine's occurrence_identity widens its window over all
of them, so a state with two zones is never read at the wrong one).

Not a rule: the states' postal codes are USPS Publication 28's, and the
zones the IANA time zone database's (tzdata), which the US standard zones
of 49 CFR part 71 are kept in."""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

from wingtip import geocode

_NY, _CHI, _DEN, _LA = "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"

#: Name -> (postal code, its zones), the zones' first the most of its places keep.
STATES = {
    "alabama": ("AL", [_CHI]),
    "alaska": ("AK", ["America/Anchorage", "America/Adak"]),
    "arizona": ("AZ", ["America/Phoenix", _DEN]),
    "arkansas": ("AR", [_CHI]),
    "california": ("CA", [_LA]),
    "colorado": ("CO", [_DEN]),
    "connecticut": ("CT", [_NY]),
    "delaware": ("DE", [_NY]),
    "district of columbia": ("DC", [_NY]),
    "d.c": ("DC", [_NY]),
    "florida": ("FL", [_NY, _CHI]),
    "georgia": ("GA", [_NY]),
    "hawaii": ("HI", ["Pacific/Honolulu"]),
    "idaho": ("ID", ["America/Boise", _LA]),
    "illinois": ("IL", [_CHI]),
    "indiana": ("IN", ["America/Indiana/Indianapolis", _CHI]),
    "iowa": ("IA", [_CHI]),
    "kansas": ("KS", [_CHI, _DEN]),
    "kentucky": ("KY", [_NY, _CHI]),
    "louisiana": ("LA", [_CHI]),
    "maine": ("ME", [_NY]),
    "maryland": ("MD", [_NY]),
    "massachusetts": ("MA", [_NY]),
    "michigan": ("MI", ["America/Detroit", _CHI]),
    "minnesota": ("MN", [_CHI]),
    "mississippi": ("MS", [_CHI]),
    "missouri": ("MO", [_CHI]),
    "montana": ("MT", [_DEN]),
    "nebraska": ("NE", [_CHI, _DEN]),
    "nevada": ("NV", [_LA, _DEN]),
    "new hampshire": ("NH", [_NY]),
    "new jersey": ("NJ", [_NY]),
    "new mexico": ("NM", [_DEN]),
    "new york": ("NY", [_NY]),
    "north carolina": ("NC", [_NY]),
    "north dakota": ("ND", [_CHI, _DEN]),
    "ohio": ("OH", [_NY]),
    "oklahoma": ("OK", [_CHI]),
    "oregon": ("OR", [_LA, "America/Boise"]),
    "pennsylvania": ("PA", [_NY]),
    "rhode island": ("RI", [_NY]),
    "south carolina": ("SC", [_NY]),
    "south dakota": ("SD", [_CHI, _DEN]),
    "tennessee": ("TN", [_CHI, _NY]),
    "texas": ("TX", [_CHI, _DEN]),
    "utah": ("UT", [_DEN]),
    "vermont": ("VT", [_NY]),
    "virginia": ("VA", [_NY]),
    "washington": ("WA", [_LA]),
    "west virginia": ("WV", [_NY]),
    "wisconsin": ("WI", [_CHI]),
    "wyoming": ("WY", [_DEN]),
    "puerto rico": ("PR", ["America/Puerto_Rico"]),
    "u.s. virgin islands": ("VI", ["America/St_Thomas"]),
    "virgin islands": ("VI", ["America/St_Thomas"]),
    "guam": ("GU", ["Pacific/Guam"]),
    "northern mariana islands": ("MP", ["Pacific/Saipan"]),
    "american samoa": ("AS", ["Pacific/Pago_Pago"]),
}
_BY_CODE = {code: zones for code, zones in STATES.values()}


def state_code(text: str | None) -> str | None:
    """ "Kentucky" or "KY" as "KY"; None for anything else."""
    t = (text or "").strip().rstrip(".").lower()
    if t in STATES:
        return STATES[t][0]
    return t.upper() if t.upper() in _BY_CODE else None


def offsets_min(state: str | None, local_date: str) -> list[float]:
    """The offsets from UTC the state's places keep on that date, minutes,
    at local noon (summer time included); none for a state not known, which
    the engine reads at every US offset."""
    day = dt.date.fromisoformat(local_date)
    out = []
    for zone in _BY_CODE.get(state or "", []):
        offset = dt.datetime.combine(day, dt.time(12), ZoneInfo(zone)).utcoffset()
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
