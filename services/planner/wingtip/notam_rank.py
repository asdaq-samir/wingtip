"""A flight's NOTAMs ranked by what bears on it, for the Brief's "NOTAMs
that matter": the data the engine's `notams_ranked` reads, gathered here
-- the NOTAMs the FAA's feed has sent for the fields the route lands at
(wingtip.notams, SWIM's FNS), the TFRs near the route (wingtip.tfr), the
Class B, C and D airspace it passes (wingtip.airspace) and the time the
flight is at each field -- and the engine's ranking of them, every NOTAM
given coming back. The scores are the engine's (crates/weather's
notam_rank.rs): nothing is weighed here."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from shapely.geometry import LineString

from . import airspace, geo, notams, tfr
from .engine import ask as engine
from .terrain import DEFAULT_FAA_CACHE_DIR

#: How long either side of the time the flight is at a field a NOTAM there
#: is read as bearing on it: the preflight on the ramp before it leaves, a
#: hold or a go-around after it lands. The planner's own choice, as the
#: briefing's MARGIN_S (an hour past the arrival) is, not a rule's.
MARGIN = timedelta(hours=1)
#: The flight's length where the caller does not say, as the briefing's
#: DEFAULT_ETE_MIN.
DEFAULT_ETE_MIN = 120.0


def _iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def windows(fields: list[tuple[str, str]], depart: datetime, ete_min: float | None) -> tuple[list[dict], dict]:
    """Each field's time, [(ident, role)] in the route's order: the
    departure round its leaving, the destination round its landing, a stop
    anywhere between; and the whole flight's, for what is at no field."""
    land = depart + timedelta(minutes=ete_min or DEFAULT_ETE_MIN)
    span = {"dep": (depart, depart), "dest": (land, land), "stop": (depart, land)}
    out = [
        {"ident": ident, "role": role, "from": _iso(span[role][0] - MARGIN), "until": _iso(span[role][1] + MARGIN)}
        for ident, role in fields
    ]
    return out, {"from": _iso(depart - MARGIN), "until": _iso(land + MARGIN)}


def airspaces_on(path: list[tuple[float, float]]) -> list[str]:
    """The names of the Class B, C and D airspace the route's straight
    hops pass through (the FAA's class airspace shapefile)."""
    shp = airspace.ensure_class_airspace_shapefile(DEFAULT_FAA_CACHE_DIR)
    names: list[str] = []
    for start, end in zip(path, path[1:]):
        line = LineString([(start[1], start[0]), (end[1], end[0])])
        for polygon in airspace.load_controlled_airspace(shp, geo.corridor_bbox(start, end, buffer_nm=2.0)):
            name = (polygon.get("name") or "").strip()
            if name and name not in names and line.intersects(polygon["geometry"]):
                names.append(name)
    return names


def _feet_msl(ft, ref) -> float | None:
    """A TFR's level in feet MSL, or None where it is above the ground,
    which cannot be set against a cruise altitude without the ground."""
    if ft is None:
        return None
    return float(ft) if ft == 0 or (ref or "MSL").upper() in ("MSL", "SFC") else None


#: What the card reads a TFR by (the engine's tfr_read) and shows of it:
#: its kind, rule, title and levels as tfr.faa.gov gives them, and its
#: instructions, NOTAM text and whom to call as its XNOTAM file does.
TFR_FACTS = ("kind", "rule", "title", "floor_ft", "floor_ref", "ceiling_ft", "ceiling_ref", "instructions", "text", "facility", "contact")


def _tfr_facts(t: dict, field: dict | None) -> dict:
    """A TFR's facts for the card, and where it is from the field: over
    it, else its nearest edge (wingtip.tfr.near_point)."""
    facts = {k: t.get(k) for k in TFR_FACTS}
    facts["instructions"] = facts["instructions"] or []
    facts.update(over_field=t.get("crosses") if field else None, field=field, edge=t.get("edge") if field else None)
    return facts


def _tfr_notam(t: dict, field: dict | None = None) -> dict:
    return {
        "id": t["notam_id"],
        "location": None,
        "starts": t.get("effective"),
        "ends": t.get("expires"),
        "text": f"TFR {t['notam_id']}: {t.get('title') or t.get('purpose') or 'no title'}.",
        "floor_ft": _feet_msl(t.get("floor_ft"), t.get("floor_ref")),
        "ceiling_ft": _feet_msl(t.get("ceiling_ft"), t.get("ceiling_ref")),
        "crosses": bool(t.get("crosses")),
        # Its NOTAM as sent where its file gave it, else the list's title.
        "raw": t.get("text") or t.get("title") or "",
        "tfr": _tfr_facts(t, field),
    }


def coverage_since() -> str | None:
    """The day the store first heard the NOTAM feed, ISO date (UTC): what
    was issued before it and never changed is not held."""
    t = notams.since()
    return None if t is None else datetime.fromtimestamp(t, timezone.utc).date().isoformat()


def ranked(
    fields: list[tuple[str, str]],
    path: list[tuple[float, float]],
    depart: datetime,
    ete_min: float | None,
    cruise_ft: float | None,
    runways: dict[str, list[str]],
) -> dict:
    """{"ranked": [the engine's item with "raw", "starts", "ends",
    "kind" (notam, tfr) and a TFR's "tfr" facts], "top", "unchecked"}: the route's fields as
    [(ident, role)], its points, its time and altitude, and the runway
    ends in use by field as the pilot's plan has them."""
    timed, flight = windows(fields, depart, ete_min)
    for f in timed:
        f["runways"] = runways.get(f["ident"].upper(), [])
    until = datetime.fromisoformat(flight["until"].replace("Z", "+00:00"))
    return _rank(
        fields, timed, flight, depart, lambda: tfr.along_route(path, depart - MARGIN, until), cruise_ft, lambda: airspaces_on(path), None
    )


def at_field(ident: str, lat: float, lon: float, now: datetime) -> dict:
    """One field's own NOTAMs and the TFRs within tfr.NEAR_NM of it, ranked
    as ranked() ranks a route's, for its card: the field read as a stop
    from an hour ago to DEFAULT_ETE_MIN and an hour ahead, the time a pilot
    looking at it now is round it. No runway in use, cruise altitude or
    route airspace: the card has no flight."""
    fields = [(ident, "stop")]
    timed, flight = windows(fields, now, DEFAULT_ETE_MIN)
    for f in timed:
        f["runways"] = []
    until = datetime.fromisoformat(flight["until"].replace("Z", "+00:00"))
    field = {"lat": lat, "lon": lon}
    return _rank(fields, timed, flight, now, lambda: tfr.near_point(lat, lon, now - MARGIN, until), None, lambda: [], field)


def _rank(fields, timed, flight, depart, tfrs_for, cruise_ft, airspaces_for, field) -> dict:
    """The NOTAMs at `fields` and the TFRs `tfrs_for()` finds, asked of
    the engine's notams_ranked, each given back with its text as sent."""
    found = notams.at_fields(list(dict.fromkeys(i for i, _ in fields)), now=depart.timestamp())
    unchecked: list[str] = []
    try:
        tfrs = tfrs_for()
    except tfr.TfrUnavailable:
        tfrs, unchecked = [], ["tfrs"]
    given = [
        {
            "id": n["id"],
            "location": n.get("location"),
            "starts": n.get("starts"),
            "ends": n.get("ends"),
            "schedule": n.get("schedule"),
            "text": n.get("raw") or n.get("text") or "",
            "raw": n.get("raw") or n.get("text") or "",
            "kind": "notam",
            "tfr": None,
        }
        for n in found
    ]
    given += [{**_tfr_notam(t, field), "kind": "tfr"} for t in tfrs]
    by_id = {n["id"]: n for n in given}
    asked = {
        "notams": [{k: v for k, v in n.items() if k not in ("raw", "kind", "tfr")} for n in given],
        "fields": timed,
        **flight,
        "cruise_ft": cruise_ft,
        "airspaces": airspaces_for() if given else [],
    }
    answer = engine("notams_ranked", **asked)
    for item in answer["ranked"]:
        n = by_id[item["id"]]
        item.update(raw=n["raw"], starts=n["starts"], ends=n["ends"], kind=n["kind"], tfr=n["tfr"])
    return {**answer, "unchecked": unchecked}
