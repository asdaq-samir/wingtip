"""Stage 2, the identity check: a lead becomes a draft only where the
report's N-number, the FAA registry's Mode S code for it and an ADS-B
track (by that code, on that day, near that place) agree. The rule and
its tolerances are the engine's (occurrence_identity, engine/crates/
procedures/src/occurrence.rs); this gathers what it reads -- the town's
point, the state's clocks, the registry's answer, the track -- and keeps
its verdict on the lead.

The track is wingtip.traffic.day_tracks': a past UTC day from adsb.lol's
history, read once and kept in day_tracks.sqlite; today's from its recent
trace at once, before it rolls off, and kept in the draft's kit
(kit.py). Where adsb.lol cannot be read now the lead is left as it was,
to be checked on the next run: no verdict is made on a refusal."""

from __future__ import annotations

import datetime as dt
import logging

from wingtip import crash_drafts, registry
from wingtip.engine import ask
from wingtip.traffic import TrafficUnavailable, day_tracks

from . import places

log = logging.getLogger(__name__)


def report_of(lead: dict) -> dict | None:
    """The engine's `report` for a lead: None where its place is not known."""
    if lead.get("lat") is not None and lead.get("lon") is not None:
        lat, lon, place = lead["lat"], lead["lon"], lead.get("place") or "town"
    else:
        point = places.town_point(lead.get("city"), lead.get("state"))
        if point is None:
            return None
        (lat, lon), place = point, "town"
    return {
        "n_number": lead.get("n_number"),
        "date": lead["local_date"],
        "time": lead.get("local_time"),
        "utc_offsets_min": places.offsets_min(lead.get("state"), lead["local_date"], (lat, lon)),
        "lat": lat,
        "lon": lon,
        "place": place,
    }


def _utc_days(start: float, end: float) -> list[dt.date]:
    first = dt.datetime.fromtimestamp(start, dt.timezone.utc).date()
    last = dt.datetime.fromtimestamp(end, dt.timezone.utc).date()
    return [first + dt.timedelta(days=i) for i in range((last - first).days + 1)]


def track_of(hex_id: str, start: float, end: float, today: dt.date | None = None) -> dict | None:
    """The address's reports over the UTC days the window meets, as the
    Studio's track (day_tracks.day_track's answer, its days' points in
    order); None where it has none. TrafficUnavailable where adsb.lol
    cannot be read now."""
    today = today or dt.datetime.now(dt.timezone.utc).date()
    found: dict | None = None
    for day in _utc_days(start, end):
        if day > today:
            continue
        answer = day_tracks.day_track(hex_id, day, today=today)
        if not answer["points"] or answer["altitude"] != "pressure":
            # Reports only watched here are not adsb.lol's whole day.
            continue
        if found is None:
            found = answer
        else:
            found = {**found, "points": found["points"] + answer["points"]}
    return found


def check(lead: dict, today: dt.date | None = None) -> dict:
    """The lead checked, its verdict kept on it: the lead as it is now."""
    report = report_of(lead)
    if report is None:
        words = f"{lead.get('city')}, {lead.get('state')} is not a place the Census gazetteer has."
        return crash_drafts.update(
            lead["id"], identity={"verdict": "needs_human", "checks": [{"check": "place", "ok": False, "words": words}]}
        )
    if lead.get("lat") is None:
        lead = crash_drafts.update(lead["id"], lat=report["lat"], lon=report["lon"], place=report["place"])
    registry.refresh()
    found = registry.lookup(n_number=report["n_number"]) if report["n_number"] else None
    reg = {"n_number": found["n_number"], "hex": found.get("mode_s_hex")} if found else None
    first = ask("occurrence_identity", report=report, registry=reg)
    track = None
    if first["verdict"] == "no_track" and reg and reg["hex"]:
        try:
            track = track_of(reg["hex"], first["window"]["start"], first["window"]["end"], today)
        except TrafficUnavailable as err:
            log.info("lead %s: adsb.lol not read now (%s); checked again next run", lead["id"], err)
            return lead
    answer = first if track is None else ask("occurrence_identity", report=report, registry=reg, track=track)
    fields: dict = {"identity": answer, "identity_by": "engine", "hex": reg["hex"] if reg else None}
    if answer["verdict"] == "confirmed":
        fields |= {"status": "ready", "track": "adsb"}
    elif answer["verdict"] == "no_track":
        fields |= {"status": "ready", "track": "none"}
    lead = crash_drafts.update(lead["id"], **fields)
    if track is not None and answer["verdict"] == "confirmed":
        lead["_track"] = track
    return lead
