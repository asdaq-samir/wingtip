"""The map's Stops: the public fields round a position or along a route
with fuel, food, repair or a flight school (app.routers.airports'
sibling), each with the places Overture holds near it."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Query
from wingtip import airports, altitude, faa_data, nearby

from .. import stop_corridor
from ..schemas.airport_services import StopFields
from ..gateway import PUBLIC
from ..field_marks import owners_of as _owners

log = logging.getLogger(__name__)

router = APIRouter()


#: The most of the nearest fields looked at round the pilot: a hundred
#: miles round Chicago hold some three hundred, each's places read once.
STOP_FIELDS = 150


def _places_of(field: dict) -> dict | None:
    """A field's places to eat and flight schools at the airport, None
    while they are still to be read (read on the pool): food inside its
    outline (wingtip.nearby's), as Pilot Pete's is at Schaumburg (the owner's
    "food at the airport itself", 2026-10-25), not a walk across the road;
    a school on the field or a walk from it (WALK_M, 15 minutes), as a
    school's office can be across the field's own road."""
    places = nearby.kept(field["ident"])
    if places is None:
        nearby.read_later(field["ident"], field["lat"], field["lon"])
        return None
    return {
        "food": [f for f in places.get("food") or [] if f.get("on_field")],
        "training": [t for t in places.get("training") or [] if t.get("on_field") or t.get("walk_min") is not None],
    }


def _stop(field: dict, places: dict | None) -> dict | None:
    """A field as one of the map's Stops, with what it has of the four
    kinds -- fuel, food, repair, training -- and its phone; None where it
    has none of them that is known yet. The fuel it sells and its airframe
    and engine repair are its Chart Supplement entry's (NASR's APT_BASE:
    FUEL_TYPES, AIRFRAME_REPAIR_SER_CODE and PWR_PLANT_REPAIR_SER, MAJOR or
    MINOR), its phone the manager's, else the owner's (NASR's APT_CON:
    PHONE_NO), each by its FAA or ICAO identifier (wingtip.faa_data)."""
    services = faa_data.airport_services(field["ident"], altitude.DEFAULT_FAA_CACHE_DIR)
    food = (places or {}).get("food") or []
    training = (places or {}).get("training") or []
    if not (services["fuel_types"] or services["airframe_repair"] or services["powerplant_repair"] or food or training):
        return None
    return {
        "ident": field["ident"],
        "name": field["name"],
        "city": field.get("city") or None,
        "lat": field["lat"],
        "lon": field["lon"],
        "phone": faa_data.airport_contact(field["ident"], altitude.DEFAULT_FAA_CACHE_DIR)["phone"],
        "fuel_types": services["fuel_types"],
        "airframe_repair": services["airframe_repair"],
        "powerplant_repair": services["powerplant_repair"],
        "food": food,
        "training": training,
        "places_known": places is not None,
    }


@router.get("/api/stops/near", response_model=StopFields, openapi_extra=PUBLIC)
def stops_near(
    lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180), nm: float = Query(default=25.0, ge=5, le=250)
) -> StopFields:
    """The public fields round a position with fuel, food, repair or a
    flight school, nearest first, for the map's Stops (the owner's one
    sheet for them near the pilot and along a route, 2026-10-27), within
    `nm` (the sheet's 10, 25, 50 or 100). A field's places are Overture's
    (wingtip.nearby), read on the planner's pool where they have not been and
    counted in `pending`; a field selling fuel or with a repair shop is
    listed at once, its places to come (`places_known`), and the page
    asks again until none is pending."""
    found = [p for p in airports.nearest(lat, lon, STOP_FIELDS) if p["distance_nm"] <= nm]
    out, pending = [], 0
    for p, (military, private) in zip(found, _owners(found)):
        # Not the airline airports: O'Hare's food is a smoothie in the
        # terminal, past security, not a fly-in lunch (its first answer),
        # and its fuel and repair are the airlines' FBOs' at airline fees.
        if military or private or p.get("kind") == "large":
            continue
        places = _places_of(p)
        pending += places is None
        stop = _stop({**p, "city": p.get("municipality")}, places)
        if stop:
            out.append({**stop, "distance_nm": p["distance_nm"], "bearing_deg": p["bearing_deg"]})
    return StopFields(fields=out, pending=pending)


@router.get("/api/stops/along", response_model=StopFields, openapi_extra=PUBLIC)
def stops_along(dep: str, dest: str, stops: str = "") -> StopFields:
    """The public fields along a route with fuel, food, repair or a flight
    school, in route order, for the map's Stops while a course is drawn:
    those no more than stop_corridor.STOP_OFF_COURSE_NM off each flight's line, each
    with its miles from its flight's departure, those it adds and how far
    off the course it is; what they have as round the pilot."""
    out, pending = [], 0
    for field, off in stop_corridor.corridor(dep, dest, stops, datetime.now(timezone.utc).date().isoformat()):
        places = _places_of(field)
        pending += places is None
        stop = _stop(field, places)
        if stop:
            out.append(
                {
                    **stop,
                    "distance_nm": field["from_nm"],
                    "bearing_deg": 0,
                    "departure": field["departure"],
                    "added_nm": field["added_nm"],
                    "off_nm": round(off, 1),
                }
            )
    return StopFields(fields=out, pending=pending)
