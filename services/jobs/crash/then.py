"""What was so at a draft's event, for its kit: the weather (IEM's METARs
and TAFs of the fields near the place, over the event's hour), the NOTAMs
and TFRs in force at the event's moment (the daily snapshots ingest keeps),
and the NTSB's record (ntsb.py). Each is read from what the Studio's
history keeps on the data volume (wingtip.history: weather_then over
iem's kept days, notam_archive, ntsb), the same code the planner's
/api/studio/weather, /api/studio/notams and /api/studio/ntsb answer from,
so the kit and the Studio's replay say the same.

A part is given once it can be whole, and asked again on a later run until
then (kit.fill): the weather once the hour after the event has passed (a
METAR is issued up to an hour late) and IEM answers; the NOTAMs once a
snapshot of that UTC day is kept, or the day has gone by without one (no
archive of past NOTAMs exists to fill it from); the NTSB's record when
the NTSB has published its case."""

from __future__ import annotations

import datetime as dt
import logging

from wingtip import geo
from wingtip.history import iem, notam_archive, weather_then

from . import ntsb, places

log = logging.getLogger(__name__)

#: The weather is the hour before the event's moment (with the METAR in
#: force at its start, weather_then.METAR_MARGIN_S), s.
WEATHER_BEFORE_S = 3600
#: How far round the place the NOTAMs are kept, nm: the kit's TFRs' frame
#: (kit.TFR_NEAR_NM), a film's, not a rule.
NOTAMS_NEAR_NM = 30.0


def moment(lead: dict) -> float | None:
    """The event's moment, s since 1970: the reported local time where the
    state and the place's own zone keep one offset from UTC that day (a
    place on a zone line or in a state of two is not one moment), else the confirmed track's
    report nearest the place (the identity check's `nearest`); None where
    neither is known."""
    point = (lead["lat"], lead["lon"]) if lead.get("lat") is not None and lead.get("lon") is not None else None
    offsets = places.offsets_min(lead.get("state"), lead["local_date"], point)
    if lead.get("local_time") and len(offsets) == 1:
        local = dt.datetime.fromisoformat(f"{lead['local_date']}T{lead['local_time']}")
        return (local - dt.timedelta(minutes=offsets[0])).replace(tzinfo=dt.timezone.utc).timestamp()
    nearest = (lead.get("identity") or {}).get("nearest")
    return float(nearest["t"]) if nearest else None


def _points(lead: dict) -> list[tuple[float, float]]:
    points = [(lead["lat"], lead["lon"])]
    nearest = (lead.get("identity") or {}).get("nearest")
    if nearest:
        points.append((nearest["lat"], nearest["lon"]))
    return points


def weather(lead: dict, at: float, now: float) -> dict | None:
    """The METARs and TAFs of the fields near the place over the hour
    before `at`, with IEM's credit; None until the hour after has passed
    or while IEM cannot be read."""
    if now < at + weather_then.METAR_MARGIN_S:
        return None
    try:
        found = weather_then.weather_then(at - WEATHER_BEFORE_S, at, _points(lead))
    except iem.WeatherHistoryUnavailable as err:
        log.info("draft %s: IEM not read now (%s); its weather waits for the next run", lead["id"], err)
        return None
    return {"at": at, **found}


def notams(lead: dict, at: float, now: float) -> dict | None:
    """The NOTAMs and TFRs in force at `at` within NOTAMS_NEAR_NM of the
    place, from that UTC day's snapshot (notam_archive.as_it_was, its
    `archived` false where none was kept); None while that day is today
    and none is kept yet."""
    south, west, north, east = geo.box_around(lead["lat"], lead["lon"], NOTAMS_NEAR_NM)
    found = notam_archive.as_it_was(at, south, north, west, east)
    today = dt.datetime.fromtimestamp(now, dt.timezone.utc).date().isoformat()
    if not found["archived"] and found["day"] >= today:
        return None
    return {"at": at, "near_nm": NOTAMS_NEAR_NM, **found}


def parts(lead: dict, have: set[str], now: float) -> dict[str, dict]:
    """The kit's parts from the history not yet in it (`have`, by name)
    that can be given now: {"weather", "notams", "ntsb"}, each where it is."""
    out: dict[str, dict] = {}
    if "ntsb" not in have:
        record = ntsb.record(lead.get("n_number") or "", lead["local_date"])
        if record is not None:
            out["ntsb"] = record
    at = moment(lead)
    if at is None or lead.get("lat") is None:
        return out
    if "weather" not in have and (found := weather(lead, at, now)) is not None:
        out["weather"] = found
    if "notams" not in have and (found := notams(lead, at, now)) is not None:
        out["notams"] = found
    return out
