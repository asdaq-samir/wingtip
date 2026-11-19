"""The plan, in the three pieces it naturally falls into. A page asks
for these in order: the course draws immediately, the checkpoints land
a tenth of a second later, and the nav log -- which needs terrain,
obstacles, airspace and weather -- arrives when it can without holding
up the map. /api/plan returns all of it at once, for the MCP connector's tools
(app.mcp) and anything else that wants the whole plan in one answer.

A route may land at stops on the way (`stops`, "KDSM,KLNK"): each flight
between two landings -- a hop -- is planned as a route of its own, with
its own chart read, altitude plan, climb from the field and fuel check,
the hops planned at once, and the nav log runs on through each stop.

The nav log's stream is app.routers.navlog; the flight is put together by wingtip.flight_plan, its figures the
engine's: this module reads the request (app.plan_query's PlanQuery,
refusing what is not one), asks it and answers; the nav log's stream, one
line at a time, is app.routers.navlog."""

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from wingtip import airspace, altitude, chartlabels, faa_data, geo, planning
from wingtip import flight_plan as fp
from wingtip.engine import ask as engine
from wingtip.planning import route_line
from wingtip.profile import route_profile as side_view

from .. import chart_model, cycle_in_address, foreflight, prefetch
from ..router_basics import load_route
from ..schemas.plan import Checkpoints, Course, Plan, RouteProfile, Totals
from ..checkpoint_scoring import route_checkpoints
from ..plan_query import PlanQuery, named_checkpoints
from ..gateway import PUBLIC, gateway
from ..chart_summary import chart_summary
from ..plan_dependencies import read_ahead

router = APIRouter()


@router.get("/api/route-profile", openapi_extra=PUBLIC)
def route_profile(dep: str, dest: str, stops: str = "") -> RouteProfile:
    """The route's side view: the ground under it every 2 nm and the
    Class B, C and D airspace it passes through and the DOF's obstacles
    near its line, along the route through its stops (wingtip.profile)."""
    r = load_route(dep, dest, stops)
    shp_path = airspace.ensure_class_airspace_shapefile(altitude.DEFAULT_FAA_CACHE_DIR)
    dof_path = faa_data.ensure_nasr_file("DOF.DAT", altitude.DEFAULT_FAA_CACHE_DIR)
    return side_view([(a["lat"], a["lon"]) for a in r.airports], shp_path, dof_path)


@router.get("/api/course", dependencies=[Depends(cycle_in_address.in_address)], openapi_extra=PUBLIC)
def course(dep: str, dest: str, stops: str = "") -> Course:
    """Just the course line and its endpoints, through any stops.

    Separate from detection so the chart can draw a line the instant two
    idents are entered. Reading tiles takes seconds even on the fast
    path, and there is no reason a pilot should watch an empty map for
    them.

    And the ground under the route is started here, the first thing the
    web app asks for a route, on a thread of its own (app.prefetch), so
    the nav log asked for beside this finds it under way or done. Not the
    chart's read for checkpoints: nothing finds them until the pilot asks
    (/api/checkpoints, or a nav log with checkpoints), the owner's rule
    (2026-11-18). checkpoints_ready only looks at what is kept.
    """
    r = load_route(dep, dest, stops)
    # Whether the chart along each hop is read and kept: looked at, not started.
    ready = all(chart_model.corridor_kept(chartlabels.route_key(hop.dep_ident, hop.dest_ident)) for hop in r.hops)
    prefetch.route(dep, dest, stops)
    first = r.hops[0]
    shp = airspace.ensure_class_airspace_shapefile(altitude.DEFAULT_FAA_CACHE_DIR)

    def classed(end: dict) -> dict:
        if end.get("kind", "airport") != "airport":
            return end
        return {
            **end,
            "airspace_class": airspace.surface_class_at(end["lat"], end["lon"], shp),
            "pattern_altitude_ft": fp.field_pattern_ft(end["ident"], end),
        }

    return Course(
        departure=classed(r.departure),
        destination=classed(r.destination),
        stops=[classed(s) for s in r.stops],
        distance_nm=round(r.distance_nm, 1),
        bearing_deg=round(geo.bearing_deg(*first.start, *first.end)),
        course_line=route_line(r),
        checkpoints_ready=ready,
        **chart_summary(),
    )


@router.get("/api/checkpoints", dependencies=[Depends(read_ahead), Depends(cycle_in_address.in_address)], openapi_extra=PUBLIC)
def checkpoints(dep: str, dest: str, stops: str = "") -> Checkpoints:
    """Scored candidates and the subset worth flying, hop by hop along
    the whole route: fast once each hop's chart has been read, a few
    seconds for its first time."""
    r = load_route(dep, dest, stops)
    scored, selected, _ = named_checkpoints(r)
    return Checkpoints(departure=r.departure, destination=r.destination, stops=r.stops, candidates=scored, selected=selected)


@router.get(
    "/api/foreflight-pack/{route}/{file}",
    response_class=Response,
    responses={200: {"content": {"application/zip": {}}, "description": "The pack, a ZIP"}},
    # ForeFlight's downloader fetches it in byte ranges and will not
    # install a pack sent without its size; a download shows its name.
    openapi_extra=gateway("public", range=True, headers=("Content-Disposition", "Content-Length", "Content-Range", "Accept-Ranges")),
)
def foreflight_pack(route: str, file: str, request: Request) -> Response:
    """The route's checkpoints as a ForeFlight content pack (app.foreflight),
    for ForeFlight's own link to the pack, or to download. `route` is its
    idents dash-joined, KORD-KDLH or C81-KRYV-KDLH, and the checkpoints
    are the planner's own selection for it; `file`, the pack's name, which
    ForeFlight takes from the end of the address. A 422 for a route it
    cannot read.

    ForeFlight's downloader asks for the file several times over and
    wants its size: so the same address is always the same bytes, a Range
    is answered with a 206 of just those bytes, and the size goes with
    every answer (a 416 for a range past the end)."""
    try:
        idents = foreflight.route_idents(route)
    except ValueError as e:
        raise HTTPException(422, f"The pack's address: {e}") from None
    r = load_route(idents[0], idents[-1], ",".join(idents[1:-1]))
    _, selected, _ = route_checkpoints(r)
    version = foreflight.version_at(datetime.now(timezone.utc))
    body = foreflight.pack_zip(foreflight.pack_files(list(r.idents), route_line(r), foreflight.from_candidates(selected), version))
    headers = {"Content-Disposition": f'attachment; filename="{foreflight.file_name(list(r.idents))}"', "Accept-Ranges": "bytes"}
    try:
        wanted = foreflight.byte_range(request.headers.get("range"), len(body))
    except ValueError:
        return Response(status_code=416, headers={**headers, "Content-Range": f"bytes */{len(body)}"})
    if wanted is None:
        return Response(body, media_type="application/zip", headers=headers)
    start, end = wanted
    return Response(
        body[start : end + 1],
        status_code=206,
        media_type="application/zip",
        headers={**headers, "Content-Range": f"bytes {start}-{end}/{len(body)}"},
    )


@router.get("/api/plan")
def plan(q: Annotated[PlanQuery, Depends()]) -> Plan:
    """The whole plan: course line, every scored candidate, the selected
    checkpoints, and a nav log leg between each consecutive pair.

    altitude_ft is optional. Omitted, wingtip.altitude works out each leg's
    own legal altitudes -- clear of terrain and obstacles, under the
    Class B shelf over that leg alone and the aircraft's service
    ceiling, on the hemispheric rule for that leg's own course
    -- and wingtip.navlog makes four plans of them: the lowest, the
    highest, the fastest for the winds aloft, and the one that burns the
    least fuel, climb and cruise. altitude_choice picks
    which one the legs fly -- the fastest unless asked otherwise, the
    plan a pilot with the winds in hand picks (it was the lowest, as the
    predictable one) -- and the reasoning comes back with it, since
    "why am I at 6,500" is a question a pilot will actually ask.

    aircraft names a stock profile; cruise_tas_kt, fuel_burn_gph, usable_fuel_gal,
    climb_tas_kt, climb_fuel_burn_gph, descent_ias_kt (indicated), descent_fuel_burn_gph and
    cruise_power_pct (the power the cruise figures are at), when given,
    are a pilot's own aeroplane's numbers laid over it. Each leg flies
    them in its own air: the cruise figures are the aeroplane's at a
    reference altitude on a standard day, and the forecast temperature
    at the leg's altitude gives the density altitude they are flown at
    (the engine's wingtip_flight::performance). depart, an ISO time (UTC when naive), picks the
    winds-aloft forecast period the legs are flown on -- the 6-, 12- or
    24-hour product, whichever is valid closest to the departure;
    without it, the 6-hour product, i.e. about now -- and whether the
    fuel reserve is the day or the night one.
    """
    r = load_route(q.dep, q.dest, q.stops)
    asked = q.asked()
    scored, selected, runs, outcome = fp.plan_within_limit(r, asked, lambda: named_checkpoints(r))
    if isinstance(outcome, fp.NoWinds):
        raise outcome.error
    if isinstance(outcome, fp.Unflyable):
        raise HTTPException(422, planning.no_altitude(outcome.selection, outcome.between)["detail"])
    outcome, leg_list = fp.flown_as_picked(r, runs, outcome, asked)

    return Plan(
        departure=r.departure,
        destination=r.destination,
        stops=r.stops,
        distance_nm=round(r.distance_nm, 1),
        course_line=route_line(r),
        candidates=scored,
        selected=selected,
        legs=leg_list,
        totals=fp.totals_of(r, runs, outcome, asked),
        altitude_ft=outcome.altitude_ft,
        altitude_selection=outcome.selection,
        altitude_options=outcome.options,
        altitude_choice=outcome.choice,
        altitude_cautions=list(outcome.cautions),
        detours=fp.detours_of(runs, outcome, asked),
        altitude_figures=list(outcome.figures),
        aircraft=None if asked.profile is None else {"name": q.aircraft, **asked.profile},
        **chart_summary(),
    )


#: The longest local flight planned: a day's flying.
LocalMinutes = Annotated[float, Query(gt=0, le=12 * 60)]


@router.get("/api/local-flight", openapi_extra=PUBLIC)
def local_flight(q: Annotated[PlanQuery, Depends()], duration_min: LocalMinutes = 60.0) -> Totals:
    """A flight that leaves and lands at the same airport -- the pattern,
    practice approaches, an hour's sightseeing: no course and no legs to
    plan, so its totals are the time aloft at the aeroplane's cruise burn,
    with the fuel check a route's has (the start and taxi allowance, the
    VFR reserve by day or by night, the usable fuel). Night is judged at
    the field at both ends of the time aloft, from now where no
    departure time is given (planning.flight_totals). A 422 for a route
    that is not one airport to itself. With no airplane, the time aloft and
    the reserve's minutes alone: no fuel is worked out."""
    r = load_route(q.dep, q.dest, q.stops)
    if r.dep_ident != r.dest_ident or len(r.idents) != 2:
        raise HTTPException(422, "A local flight leaves and lands at the same airport, with no stops.")
    profile = q.profile()
    fuel = round(profile["fuel_burn_gph"] * duration_min / 60, 1) if profile else None
    depart = planning.now() if q.depart is None else q.depart if q.depart.tzinfo else q.depart.replace(tzinfo=timezone.utc)
    night = engine(
        "night_at_either_end",
        start=list(r.start),
        depart_s=depart.timestamp(),
        end=list(r.start),
        arrive_s=(depart + timedelta(minutes=duration_min)).timestamp(),
    )
    return Totals(
        distance_nm=0.0,
        ete_min=duration_min,
        fuel_gal=fuel,
        unflyable_legs=0,
        legs_without_wind=0,
        **engine("navlog_fuel_plan", total_fuel_gal=fuel, profile=profile, night=bool(night), rules=q.rules),
    )
