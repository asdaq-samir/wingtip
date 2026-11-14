"""What the in-flight copilot reads round the airplane and along the rest
of its route, gathered in one answer for the apps (GET /api/copilot/
around): the landing fields near it and near the destination as the
emergency assistant gathers them for best_fields (runways, METAR), with
whether they sell fuel;
the TFRs, special-use areas SFDPS speaks of and convective SIGMETs on the
way; and ITWS's alerts at the destination and the alternate.

Nothing here judges: which of these matters, and what to say, is the
engine's copilot_watch (engine/crates/inflight), asked by the app with
its own GPS. Each source that cannot be read is named in `unavailable`
rather than failing the rest, so the copilot says what it can.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime, timezone

from shapely.geometry import Polygon, shape

from . import airports, emergency, fuelstops, geo, itws, saa, sua, tfr, weather

log = logging.getLogger(__name__)

#: Fields asked near the airplane and near the destination: enough for
#: an alternative on any side, few enough to read their METARs at once.
NEAR_OWN = 12
NEAR_DEST = 6
#: How far ahead in time the TFRs are asked for: the rest of a light
#: airplane's flight, and the planner's two hours for a briefing.
WINDOW_S = 2 * 3600


def fields(lat: float, lon: float, dest: str, alternate: str | None) -> list[dict]:
    """The fields round the airplane, the destination and the alternate,
    each as the emergency assistant gathers a candidate for the engine's
    best_fields (wingtip.emergency: runways, METAR, the field's kind), with
    whether NASR lists fuel sold there (wingtip.fuelstops)."""
    found: dict[str, dict] = {}
    for field in emergency.fields_near(lat, lon, NEAR_OWN):
        found.setdefault(field["ident"], field)
    for ident, near in ((dest, NEAR_DEST), (alternate, 1)):
        place = airports.find_place(ident) if ident else None
        if place:
            for field in emergency.fields_near(place["lat"], place["lon"], near):
                found.setdefault(field["ident"], field)
    try:
        with_fuel = fuelstops.fields_with_fuel()
        selling = set(with_fuel["ident"]) | set(with_fuel["faa_ident"])
    except (OSError, ValueError, KeyError) as err:
        log.warning("fuel listings not read: %s", err)
        selling = set()
    out = [{**field, "fuel": ident in selling or ident.removeprefix("K") in selling} for ident, field in found.items()]
    return out + _closed(dest, found, lat, lon)


def _closed(dest: str, found: dict, lat: float, lon: float) -> list[dict]:
    """The destination where NASR lists it as closed (decision 0043), which
    the field lists leave out: sent with its status and no runway, so the
    engine's copilot_watch says it is closed and names an alternative, and
    best_fields never ranks it."""
    out = []
    for ident in (dest,):
        place = airports.find_place(ident) if ident else None
        if not place or place["ident"] in found or not place.get("closed"):
            continue
        out.append(
            {
                "ident": place["ident"],
                "name": place["name"],
                "lat": place["lat"],
                "lon": place["lon"],
                "elevation_ft": place.get("elevation_ft"),
                "distance_nm": geo.distance_nm(lat, lon, place["lat"], place["lon"]),
                "bearing_deg": geo.bearing_deg(lat, lon, place["lat"], place["lon"]),
                "runways": [],
                "status": place.get("status"),
                "fuel": False,
            }
        )
    return out


def _sigmet_id(raw: str | None) -> str:
    """A convective SIGMET's number as it is issued ("12C"), from its text."""
    found = re.search(r"SIGMET\s+(\d+[CEW])\b", raw or "")
    return found.group(1) if found else "convective"


def areas(path: list[tuple[float, float]], now: float) -> tuple[list[dict], list[str]]:
    """The areas on the rest of the route, each as the engine's
    CopilotArea, and the sources that could not be read."""
    out: list[dict] = []
    unavailable: list[str] = []
    start, end = datetime.fromtimestamp(now, timezone.utc), datetime.fromtimestamp(now + WINDOW_S, timezone.utc)
    try:
        for t in tfr.along_route(path, start, end):
            point = shape(t["geometry"]).representative_point()
            detail = t.get("detail") or {}
            out.append(
                {
                    "kind": "tfr",
                    "id": t.get("notam_id"),
                    "name": t.get("notam_id") or t.get("title"),
                    "lat": point.y,
                    "lon": point.x,
                    "active": bool(t.get("active_now")),
                    "starts_s": _unix(detail.get("effective")),
                    "until_s": _unix(detail.get("expires")),
                }
            )
    except tfr.TfrUnavailable as err:
        log.warning("TFRs for the copilot: %s", err)
        unavailable.append("tfr")
    try:
        crossed = sua.along_route(path[0], path[-1], fixes=path)
        status = saa.status([a["name"] for a in crossed], now=now)
        for a in crossed:
            word = status.get(a["name"])
            if not word:
                continue  # SFDPS has said nothing of it: its chart times are the Brief's
            out.append(
                {
                    "kind": "sua",
                    "id": a["name"],
                    "name": a["name"],
                    "lat": a["lat"],
                    "lon": a["lon"],
                    "active": word["active"],
                    "starts_s": word["next"] if not word["active"] else None,
                    "until_s": word["until"] if word["active"] else None,
                }
            )
    except sua.SpecialUseUnavailable as err:
        log.warning("special-use areas for the copilot: %s", err)
        unavailable.append("sua")
    for h in weather.hazards_along_route(path[0], path[-1]):
        if (h.get("hazard") or "").upper() != "CONVECTIVE" or len(h.get("coords") or []) < 3:
            continue
        point = Polygon([(lon, lat) for lat, lon in h["coords"]]).representative_point()
        starts, until = h.get("valid_from"), h.get("valid_to")
        out.append(
            {
                "kind": "sigmet",
                "id": _sigmet_id(h.get("raw")),
                "name": _sigmet_id(h.get("raw")),
                "lat": point.y,
                "lon": point.x,
                "active": starts is None or starts <= now,
                "starts_s": starts,
                "until_s": until,
            }
        )
    return out, unavailable


def _unix(when: str | float | None) -> float | None:
    """An ISO 8601 time, or seconds, as UNIX seconds; None for none."""
    if when is None or isinstance(when, (int, float)):
        return when
    try:
        return datetime.fromisoformat(when.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def itws_alerts(idents: list[str]) -> list[dict]:
    """ITWS's alerts at these airports, one an alert, as the engine's
    CopilotItws."""
    return [
        {"airport": p["airport"], "alert": a.get("alert") or "", "words": a.get("words") or ""}
        for p in itws.at_airports(idents)
        for a in p.get("alerts") or []
    ]


def around(lat: float, lon: float, dest: str, alternate: str | None, path: list[tuple[float, float]]) -> dict:
    """The copilot's inputs from the planner's data, as one answer."""
    now = time.time()
    route = path if len(path) >= 2 else [(lat, lon), *path]
    found, unavailable = areas(route, now) if len(route) >= 2 else ([], [])
    return {
        "fields": fields(lat, lon, dest, alternate),
        "areas": found,
        "itws": itws_alerts([i for i in (dest, alternate) if i]),
        "unavailable": unavailable,
        "at": now,
    }
