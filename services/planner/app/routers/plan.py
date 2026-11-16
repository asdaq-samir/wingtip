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

The flight is put together by wingtip.flight_plan, its figures the
engine's: this module reads the request (app.plan_query's PlanQuery,
refusing what is not one), asks it and answers -- one line at a time for the nav log's stream."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from wingtip import airspace, altitude, chartlabels, charts, faa_data, geo, planning
from wingtip import flight_plan as fp
from wingtip.config import VFR_SECTIONAL_MAX_ZOOM, VFR_SECTIONAL_MIN_ZOOM
from wingtip.engine import ask as engine
from wingtip.planning import route_line
from wingtip.profile import route_profile as side_view

from .. import chart_model, cycle_in_address, foreflight, prefetch
from ..router_basics import CHART_CACHE, line, load_route, ndjson, resolve, resolve_stop, stops_of
from ..schemas.plan import (
    ChartLayer,
    ChartSheet,
    Checkpoints,
    ChartInfo,
    Course,
    RouteChecked,
    NavLogAltitude,
    NavLogDone,
    NavLogError,
    NavLogLeg,
    NavLogStage,
    Plan,
    RouteProfile,
    Totals,
)
from ..checkpoint_scoring import route_checkpoints
from ..plan_query import PlanQuery, named_checkpoints
from ..gateway import PUBLIC, SHARED, gateway

router = APIRouter()

# How often the nav log stream says it is still working while the
# altitude plans are being made.
HEARTBEAT_S = 8


def chart_layers() -> list[ChartLayer]:
    """Every chart kind the map may draw, with its zoom range -- and,
    for an overlay, its sheets and where they are, which is how the
    map knows to offer the Chicago TAC over Chicago."""
    return [
        ChartLayer(
            kind=k.key,
            label=k.label,
            min_zoom=k.min_zoom,
            max_zoom=k.max_zoom,
            base=k.base,
            over=list(k.over),
            cycle=(cycle := charts.serving_cycle_of(k.key)),
            revision=charts.tiles_revision(cycle),
            scales=charts.tile_scales(k.key),
            sheets=[]
            if k.base
            else [
                ChartSheet(name=name, label=charts.sheet_label(k, name), west=w, south=s, east=e, north=n)
                for name, (w, s, e, n) in charts.sheets(k)
            ],
        )
        for k in charts.KINDS.values()
    ]


def _chart_info() -> dict:
    cycle = charts.serving_cycle()
    return {
        "max_zoom": VFR_SECTIONAL_MAX_ZOOM,
        "min_zoom": VFR_SECTIONAL_MIN_ZOOM,
        "chart_cycle": cycle,
        "chart_revision": charts.tiles_revision(cycle),
        "chart_layers": chart_layers(),
    }


@router.get("/api/chart", openapi_extra=SHARED)
def chart_info(response: Response) -> ChartInfo:
    """The chart the map draws, for a map with no route on it yet: the
    planner's page opens on a search bar over the chart, as Maps does.
    The map asks for no tile before this answers, so it may be kept
    (CHART_CACHE) and served from the CDN's edge."""
    response.headers["Cache-Control"] = CHART_CACHE
    return ChartInfo(**_chart_info())


@router.get("/api/route-profile", openapi_extra=PUBLIC)
def route_profile(dep: str, dest: str, stops: str = "") -> RouteProfile:
    """The route's side view: the ground under it every 2 nm and the
    Class B, C and D airspace it passes through and the DOF's obstacles
    near its line, along the route through its stops (wingtip.profile)."""
    r = load_route(dep, dest, stops)
    shp_path = airspace.ensure_class_airspace_shapefile(altitude.DEFAULT_FAA_CACHE_DIR)
    dof_path = faa_data.ensure_nasr_file("DOF.DAT", altitude.DEFAULT_FAA_CACHE_DIR)
    return side_view([(a["lat"], a["lon"]) for a in r.airports], shp_path, dof_path)


@router.get("/api/route-check")
def route_check(dep: str = "", dest: str = "", stops: str = "") -> RouteChecked:
    """Whether a route would plan, checked as a typed one is (load_route):
    a 404 naming an ident that is not one, a 422 for a stop at the point
    before it or too many stops. With an end missing, each ident given is
    checked alone. Nothing is read or planned. The gateway forwards
    no app here."""
    if dep and dest:
        load_route(dep, dest, stops)
    else:
        resolve(*(ident for ident in (dep, dest) if ident))
        for stop in stops_of(stops):
            resolve_stop(stop)
    return RouteChecked(stops=stops_of(stops))


@router.get("/api/course", dependencies=[Depends(cycle_in_address.in_address)], openapi_extra=PUBLIC)
def course(dep: str, dest: str, stops: str = "") -> Course:
    """Just the course line and its endpoints, through any stops.

    Separate from detection so the chart can draw a line the instant two
    idents are entered. Reading tiles takes seconds even on the fast
    path, and there is no reason a pilot should watch an empty map for
    them.

    And the route's slow parts are started here, the first thing the web
    app asks for a route: the chart's read and the ground under it, on
    threads of their own (app.prefetch), so the nav log asked for beside
    this finds them under way or done.
    """
    r = load_route(dep, dest, stops)
    # Asked before the reads below start: read is read, not under way.
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
        **_chart_info(),
    )


async def _read_ahead(
    ahead: Annotated[
        bool,
        Query(
            description="Asked ahead of the pilot -- a Recent or Saved route planned while "
            "the page is idle: its chart reads wait behind the route on screen's"
        ),
    ] = False,
) -> None:
    """The request's chart reads as reads ahead (chart_model.READ_AHEAD).
    Async, so it is set in the request's own context, which the endpoint's
    thread and a streamed body's are copied from."""
    chart_model.READ_AHEAD.set(ahead)


@router.get("/api/checkpoints", dependencies=[Depends(_read_ahead), Depends(cycle_in_address.in_address)], openapi_extra=PUBLIC)
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
    (wingtip.performance). depart, an ISO time (UTC when naive), picks the
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
        _, ways = fp.unflyable_parts(outcome, runs)
        raise HTTPException(422, planning.no_altitude(outcome.selection, outcome.between, ways[0] if ways else None)["detail"])
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
        class_b_detours=fp.class_b_detours_of(runs, outcome, asked),
        altitude_figures=list(outcome.figures),
        aircraft=None if asked.profile is None else {"name": q.aircraft, **asked.profile},
        **_chart_info(),
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


@router.get("/api/navlog", dependencies=[Depends(_read_ahead)], openapi_extra=PUBLIC)
def navlog_stream(q: Annotated[PlanQuery, Depends()]) -> StreamingResponse:
    """Altitude and the dead-reckoning legs, as newline-delimited JSON --
    the slow half, because it reads terrain, the obstacle file, the
    airspace shapefile and live winds; asked for separately so none of
    that delays the chart. Each line is one app.schemas.NavLogMessage.

    Streamed rather than a single blocking response so a pilot sees the
    table fill in as it goes rather than a blank screen: a "stage" line
    before each real piece of work (scoring, the altitude plans), an
    "altitude" line the moment those are decided -- the four plans and
    the one chosen (altitude_choice, see /api/plan) with it -- one "leg"
    line per leg, then one "done" line with the totals, which need
    every leg in before they mean anything. Its own implementation, not
    a wrapper over /api/plan: that one commits to a single synchronous
    JSON response, and mixing a streaming and a non-streaming contract
    into one function would compromise both. The overlap is the same
    handful of calls into wingtip.flight_plan either way.

    An unflyable route (some leg with no legal cruising altitude at all)
    is reported as an "error" line, not an HTTP error status -- by the
    time that's known, a 200 and a stream of NDJSON have already gone
    out, and an HTTP status can't change after that.
    """
    r = load_route(q.dep, q.dest, q.stops)
    # Refused as a 422 here, before the stream starts: once its 200 has gone
    # out, a bad procedure or altitude could only be an error line (the
    # one planning sequence, 823822e7, had left them to it).
    asked = q.asked()

    def lines():
        if q.checkpoints:
            yield line(NavLogStage(detail="Choosing checkpoints…"))
            _, _, by_hop = route_checkpoints(r)
        else:
            by_hop = [[] for _ in r.hops]

        runs = fp.hop_runs(r, by_hop, asked.depart, asked.profile, asked.ground, asked.holds, asked.drawn, asked.leave_runways)

        # Each stage's words short enough for the one line the panel gives
        # them, at the pilot's ask: what is being worked on first.
        yield line(NavLogStage(detail="Planning altitudes…"))
        # On side threads with a heartbeat, not inline: an uncached
        # selection on a bad aviationweather.gov day was observed
        # taking over two minutes, all of it silent -- and the gateway
        # proxy cuts a stream that has been silent that long, so the
        # browser saw the nav log simply end with no legs and no error.
        # A stage line every few seconds keeps the connection visibly
        # alive (and tells the pilot what it's still waiting on) for
        # however long the fetch takes. The legs are worked out there
        # too, a pilot's own altitude's included, so none of the waiting
        # on winds happens after the heartbeat has stopped.
        # The heartbeat names what the selection is actually waiting on --
        # it used to say "aviationweather.gov" whatever the cause -- and
        # the wait ends at COMPUTE_LIMIT_S with an error line saying so,
        # rather than a stream that never ends. Not a `with` block: that
        # would wait on a stuck thread on the way out. Every hop of a
        # route with stops at once, each waited on in turn.
        altitude_pool = ThreadPoolExecutor(max_workers=len(runs))
        outcomes = []
        try:
            futures = [altitude_pool.submit(fp.resolve_run, run, asked) for run in runs]
            for run, future in zip(runs, futures):
                where = f" {run.hop.dep_ident} → {run.hop.dest_ident}" if len(runs) > 1 else ""
                waiting = fp.waited(future, HEARTBEAT_S, lambda run=run: fp.running_stages(run, asked))
                while True:
                    try:
                        elapsed = next(waiting)
                    except StopIteration as done:
                        outcomes.append(done.value)
                        break
                    named = fp.waiting_on(run, asked)
                    yield line(
                        NavLogStage(
                            detail=(
                                f"Altitudes{where}, {elapsed:.0f} s, waiting on {named}…"
                                if named
                                else f"Altitudes{where}, {elapsed:.0f} s, winds for each plan…"
                            )
                        )
                    )
        finally:
            altitude_pool.shutdown(wait=False)
        outcome = fp.join_outcomes(runs, outcomes)

        aircraft_line = None if asked.profile is None else {"name": q.aircraft, **asked.profile}
        if isinstance(outcome, fp.Unflyable):
            why, detours = fp.unflyable_parts(outcome, runs)
            yield line(
                NavLogError(
                    detail=why["title"],
                    brief=why["brief"],
                    reasons=why["reasons"],
                    advice=why["advice"],
                    retry=False,
                    class_b=why["class_b"],
                    detours=detours,
                )
            )
            return
        if isinstance(outcome, fp.NoWinds):
            # The selection stands -- terrain, airspace, the legal
            # altitudes -- even though the winds did not come: say what
            # was decided, then what failed.
            yield line(
                NavLogAltitude(
                    flown=None,
                    altitude_ft=None,
                    altitude_selection=outcome.selection,
                    options=outcome.options,
                    aircraft=aircraft_line,
                    altitude_figures=list(outcome.figures),
                )
            )
            yield line(NavLogError(detail=str(outcome.error)))
            return

        # Before any leg -- the checkpoints already on screen from
        # /api/checkpoints can show their own cruise altitude
        # immediately rather than waiting on the first leg to carry it.
        yield line(
            NavLogAltitude(
                flown=outcome.choice or "custom",
                altitude_ft=outcome.altitude_ft,
                altitude_selection=outcome.selection,
                options=outcome.options,
                aircraft=aircraft_line,
                cautions=list(outcome.cautions),
                class_b_detours=fp.class_b_detours_of(runs, outcome, asked),
                altitude_figures=list(outcome.figures),
            )
        )
        outcome, legs = fp.flown_as_picked(r, runs, outcome, asked)
        for leg in legs:
            yield line(NavLogLeg.model_validate(leg))

        yield line(NavLogDone(totals=fp.totals_of(r, runs, outcome, asked)))

    return ndjson(lines(), NavLogError)
