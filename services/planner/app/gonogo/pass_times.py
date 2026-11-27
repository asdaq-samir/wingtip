"""When the flight passes a point along its route, and whether a TFR or a
special-use area is in force then (apps/web/src/lib/passTimes.ts, the
roadmap's 4-D airspace check): the briefing lists what is near the route
at any time during the flight, and this says whether it is at the time
the airplane gets there. The rules are the engine's
(wingtip_engine::gonogo::pass_times), asked by name through
wingtip_native.call; the times are
read here, and the time zones are Python's (zoneinfo), which the engine,
built for the phones as well, does not carry."""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from . import ask

_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
_MICROSECOND = timedelta(microseconds=1)


def us_of(t: datetime) -> int:
    """Whole microseconds since 1970, exactly (UTC where naive)."""
    return ((t if t.tzinfo else t.replace(tzinfo=timezone.utc)) - _EPOCH) // _MICROSECOND


def pass_time(legs: list[dict], depart: datetime, along_nm: float) -> datetime | None:
    """When the flight is `along_nm` along its route: the departure plus
    the legs' times to there, the leg it is in taken pro rata. None where
    a leg before it has no time (it cannot be flown) or there are no
    legs."""
    minutes = ask(
        "gonogo_pass_minutes", legs=[{"distance_nm": leg["distance_nm"], "ete_min": leg.get("ete_min")} for leg in legs], along_nm=along_nm
    )
    return None if minutes is None else depart + timedelta(minutes=minutes)


def _clock(local: datetime) -> tuple[int, int]:
    """The day of the week (0 Sunday) and the minute of the day."""
    return (local.weekday() + 1) % 7, local.hour * 60 + local.minute


def sua_when(times_of_use: str | None, at: datetime, time_zone: str | None = None) -> str:
    """Whether a special-use area's published times of use have it in use
    when the flight passes (FAA Order JO 7400.2, 21-2-4): "active",
    "not-scheduled", "by-notam" or "unknown". Local hours are read in the
    area's own zone (wingtip.sua.time_zone), daylight saving time and all;
    with no zone, or one not known, they are not guessed at."""
    local = None
    if time_zone == "UTC":
        local = _clock(at.astimezone(timezone.utc))
    elif time_zone:
        try:
            local = _clock(at.astimezone(ZoneInfo(time_zone)))
        except (KeyError, ValueError):
            local = None
    return ask("gonogo_sua_when", times_of_use=times_of_use, utc=_clock(at.astimezone(timezone.utc)), local=local)
