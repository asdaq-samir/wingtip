"""The time zone a place keeps, by its position: the IANA name ("America/
Chicago") the apps read a field's clock in, daylight saving time and all,
with the platform's own time-zone data (Intl on the web).

An airport's local time is not in the FAA's NASR airport records (APT_BASE
gives no zone), and a state is not a zone (Indiana, Texas, Florida, the
Dakotas and others are split), so the zone is found from where the field
is, in tzfpy's boundaries: timezone-boundary-builder's, from
OpenStreetMap, the boundaries the IANA zones are drawn by, simplified to
within about 111 m of the border (tzfpy's README, "Accuracy"). A field
that near a zone line is the rare case; its NOTAMs' UTC times, the times
the FAA gives (JO 7930.2 3-3-2), are said beside the local ones anyway.
The finder is built on its first call (about 15 ms, some 40 MB), so a
planner that never asks pays nothing for it."""

from functools import cache


@cache
def _finder():
    from tzfpy import get_tz

    return get_tz


def at(lat: float, lon: float) -> str | None:
    """The IANA zone at (lat, lon); None where tzfpy names none."""
    name = _finder()(lon, lat)
    return name or None
