"""The ways to fly a route, for FPL's Routes (wingtip.route_options): the
fastest, the best weather's and the fewest stops', each clear of
thunderstorms, weather under the pilot's minimums, prohibited areas, TFRs
and high ground; and the route kept out of the Class B it enters at its
altitude (wingtip.class_b_route)."""

import threading
from datetime import datetime
from typing import Annotated

from cachetools import TTLCache
from fastapi import APIRouter, HTTPException, Query
from wingtip import filed_routes, nearby
from wingtip.class_b_route import class_b_route
from wingtip import route_options as wingtip_route_options

from .. import prefetch
from ..router_basics import load_route, resolve
from wingtip.aircraft import aircraft_profile
from wingtip.winds_aloft import winds_key_for
from ..schemas.route_options import RouteOptions
from ..gateway import PUBLIC
from ..plan_query import CruiseTas, FuelBurn, GlideRatio, ServiceCeiling, TaxiFuel, UsableFuel

router = APIRouter()

#: An answer kept ten minutes: the TAFs and METARs it reads change by the
#: hour, and FPL asks again as the page draws.
_KEPT: TTLCache = TTLCache(maxsize=128, ttl=600)
#: One whose fuel stops' places to eat were not all read yet, a minute:
#: asked again once they have been (nearby.read_later), its stops may be
#: ones with a meal.
_KEPT_SHORT: TTLCache = TTLCache(maxsize=128, ttl=60)
_LOCK = threading.Lock()


#: The route as typed with the fuel stops it needs put in where it is short
#: of fuel, each landing with 14 CFR 91.151's reserve (the engine's
#: route_options `own`, route/options/stops.rs): the owner, 2026-11-17,
#: "Suggested routes should also have 'add fuel stops'".
FUEL_WORDS = "With Fuel Stops"
#: The words on the route line's chip for each kind of way, and the order
#: they come in after "As typed" and "With Fuel Stops" (the owner's canvas,
#: 2026-10-26). The fewest stops' way is not offered (lib/routeWays).
CHIP_WORDS = {"weather": "Avoid Weather", "fastest": "Fastest", "land": "Over Land"}
#: The last chip's: the route pilots file most between the two fields
#: (wingtip.filed_routes; the owner, 2026-10-27: "Most filed is how you get
#: most flown").
FILED_WORDS = "Most Filed"
#: The route kept out of the Class B it enters (the owner, 2026-11-17:
#: "You can still avoid class B in the suggested routes"), after the ways.
CLASS_B_WORDS = "Avoid Class B"


def _same(ident: str) -> str:
    """An ident as the route's box may spell it: KUES and UES alike."""
    s = ident.strip().upper()
    return s[1:] if len(s) == 4 and s.startswith("K") and s.isalpha() else s


def _chips(found: dict, typed: list[str]) -> list[dict]:
    """FPL's route line: "As typed", the route as typed; "With Fuel Stops",
    it with the fuel stops it needs, where it is short of fuel; then the
    ways, each named by what it is alone --
    "Fastest", "Avoid Weather" -- not the stops it adds, at the owner's ask
    (2026-10-28: "for routes, don't include stops in its label"), its
    stops drawn on the map and put in the route's box as it is picked.
    One chip a set of stops; none at all where only the route itself is
    left."""
    # "As typed", the owner's word for what was "None" (2026-11-08).
    chips = [
        {
            "key": "none",
            "label": "As typed",
            "stops": typed,
            "fuel": [],
            "crosses": found.get("current", []) if typed else found.get("direct", []),
        }
    ]
    seen = [[_same(t) for t in typed]]

    def add(key: str, words: str, way: dict) -> None:
        same = [_same(s) for s in way["stops"]]
        if same in seen:
            return
        seen.append(same)
        chips.append({"key": key, "label": words, "stops": way["stops"], "fuel": way["fuel"], "crosses": way.get("crosses", [])})

    own = found.get("own")
    # Only where a fuel stop is put in: the route as typed with none is
    # "As typed" already.
    if own and own.get("fuel"):
        add("fuel", FUEL_WORDS, own)
    for kind in CHIP_WORDS:
        way = next((o for o in found.get("options", []) if kind in o["kinds"]), None)
        if way:
            add(kind, " & ".join(CHIP_WORDS[k] for k in CHIP_WORDS if k in way["kinds"]), way)
    class_b = found.get("class_b")
    if class_b:
        add("class_b", CLASS_B_WORDS, class_b)
    filed = found.get("filed")
    if filed:
        add("filed", FILED_WORDS, filed)
    return chips if len(chips) > 1 else []


def _most_filed(dep: str, dest: str) -> tuple[tuple[list[tuple], list[str]] | None, list[str]]:
    """The route most filed between the fields that the planner can fly
    (load_route: every fix and airway found), its points and idents
    between the ends with each airway flown fix by fix, and its stops as
    filed; (None, []) where none is."""
    for way in filed_routes.most_filed(dep, dest):
        if not way["stops"]:
            continue
        try:
            route = load_route(dep, dest, ",".join(way["stops"]))
        except HTTPException:
            continue
        return ([(a["lat"], a["lon"]) for a in route.airports[1:-1]], list(route.idents[1:-1])), way["stops"]
    return None, []


@router.get("/api/route-options", openapi_extra=PUBLIC)
def route_options(
    dep: str,
    dest: str,
    #: The pilot's own route's stops, "KDSM,VPBNG": what it meets is said.
    stops: str = "",
    #: A stock profile's name, or "own" for a pilot's own airplane of no
    #: stock type on its figures alone; none for no airplane picked: the ways are
    #: then the route's own, with no minutes, fuel or fuel stops (the
    #: engine's route_options with a null profile).
    aircraft: str | None = None,
    cruise_tas_kt: CruiseTas = None,
    fuel_burn_gph: FuelBurn = None,
    usable_fuel_gal: UsableFuel = None,
    service_ceiling_ft: ServiceCeiling = None,
    #: A pilot's own airplane's start and taxi fuel and glide ratio
    #: (PlanQuery's), for the fuel stops and the water out of glide.
    taxi_fuel_gal: TaxiFuel = None,
    glide_ratio: GlideRatio = None,
    depart: datetime | None = None,
    #: The pilot's own minimums (Settings), never under 14 CFR 91.155's:
    #: none given, the rules' alone.
    min_ceiling_ft: Annotated[float | None, Query(ge=0, le=20000)] = None,
    min_visibility_sm: Annotated[float | None, Query(ge=0, le=50)] = None,
    #: The altitude the route as planned cruises at, its highest leg's
    #: (the nav log's): where it enters Class B there, Avoid Class B is
    #: offered. None before the plan: not offered.
    altitude_ft: Annotated[float | None, Query(ge=0, le=60000)] = None,
) -> RouteOptions:
    """The ways to fly from `dep` to `dest` in the airplane, at the owner's
    ask ("smart to reroute for fastest time along safe weather, over
    terrain, best tailwinds, refueling", 2026-10-23): each its points in
    order for the address's `stops`, its fuel stops, and its distance,
    minutes and fuel, from a coarse read the plan then checks leg by leg.
    It only suggests."""
    key = (
        dep.upper(),
        dest.upper(),
        stops.upper(),
        aircraft,
        cruise_tas_kt,
        fuel_burn_gph,
        usable_fuel_gal,
        service_ceiling_ft,
        taxi_fuel_gal,
        glide_ratio,
        depart.isoformat() if depart else None,
        min_ceiling_ft,
        min_visibility_sm,
        altitude_ft,
    )
    with _LOCK:
        kept = _KEPT.get(key) or _KEPT_SHORT.get(key)
    if kept is not None:
        return kept
    start, end = resolve(dep, dest)
    profile = (
        None
        if aircraft is None
        else aircraft_profile(
            aircraft,
            cruise_tas_kt=cruise_tas_kt,
            fuel_burn_gph=fuel_burn_gph,
            usable_fuel_gal=usable_fuel_gal,
            service_ceiling_ft=service_ceiling_ft,
            taxi_fuel_gal=taxi_fuel_gal,
            glide_ratio=glide_ratio,
        )
    )
    # The pilot's own route, its points by ident: what it meets, and it with
    # the fuel stops it needs put in (`own`).
    # A route the plan refuses (too many stops, a stop twice over) still
    # gets its ways: the straight line's, nothing of its own.
    try:
        route = load_route(dep, dest, stops)
    except HTTPException:
        route = None
    current = [(a["lat"], a["lon"]) for a in route.airports] if route else None
    current_idents = list(route.idents[1:-1]) if route else []
    # Which of its points are fields landed at, not fixes flown over.
    current_landed = [not a.get("fix") for a in route.airports[1:-1]] if route else []
    filed, filed_as = _most_filed(dep, dest)
    # The route as planned, or the straight line, round the Class B it
    # enters at its altitude (14 CFR 91.131(a)(1)), for Avoid Class B.
    points = [(a["lat"], a["lon"]) for a in route.airports] if route else [(start["lat"], start["lon"]), (end["lat"], end["lon"])]
    class_b = class_b_route(points, current_idents, current_landed, altitude_ft) if altitude_ft is not None else None
    # Where there is somewhere to eat at each fuel field the ways weigh
    # (wingtip.nearby, the places kept for it), so a stop with a meal is
    # landed at among chains of as many stops; a field not read yet is
    # taken as having none this time, and those the ways weighed
    # (`food_unread`) are read on the side.
    found = wingtip_route_options.options(
        {"ident": dep.upper(), "lat": start["lat"], "lon": start["lon"]},
        {"ident": dest.upper(), "lat": end["lat"], "lon": end["lon"]},
        profile,
        depart=depart,
        fcst_hr=winds_key_for(depart),
        min_ceiling_ft=min_ceiling_ft,
        min_visibility_sm=min_visibility_sm,
        current=current if stops.strip() else None,
        current_idents=current_idents,
        current_landed=current_landed,
        filed=filed,
        food=nearby.food_at,
        class_b=class_b,
    )
    unread = found.pop("food_unread", None) or []
    for field in unread:
        nearby.read_later(field["ident"], field["lat"], field["lon"])
    typed = [s.strip().upper() for s in stops.split(",") if s.strip()]
    chips = _chips(found, typed)
    # The most filed route kept as filed, its airways named, where it
    # needs no fuel stop: the route box shows "V4", not its every fix.
    if filed_as and found.get("filed") and not found["filed"]["fuel"]:
        for chip in chips:
            if chip["key"] == "filed":
                chip["stops"] = filed_as
    found.pop("filed", None)
    # Each chip's route read ahead, the ground under it, as a typed route
    # is (app.prefetch); its chart's read for checkpoints waits for the
    # pilot to ask for them (the owner, 2026-11-18). The first chip last,
    # as the reads ahead go newest first.
    for chip in reversed(chips):
        if chip["key"] != "none":
            prefetch.route(dep, dest, ",".join(chip["stops"]))
    answer = RouteOptions(**{**found, "chips": chips})
    with _LOCK:
        (_KEPT_SHORT if unread else _KEPT)[key] = answer
    return answer
