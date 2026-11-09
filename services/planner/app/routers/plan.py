"""The plan, in the three pieces it naturally falls into. A page asks
for these in order: the course draws immediately, the checkpoints land
a tenth of a second later, and the nav log -- which needs terrain,
obstacles, airspace and weather -- arrives when it can without holding
up the map. /api/plan returns all of it at once, for the assistant
(app.assistant) and anything else that wants the whole plan in one
answer.

A route may land at stops on the way (`stops`, "KDSM,KLNK"): each flight
between two landings -- a hop -- is planned as a route of its own, with
its own chart read, altitude plan, climb from the field and fuel check,
the hops planned at once, and the nav log runs on through each stop.

The flight is put together by wingtip.flight_plan, its figures the
engine's: this module reads the request (PlanQuery, refusing what is not
one), asks it and answers -- one line at a time for the nav log's stream."""
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse
from wingtip import airports, airspace, altitude, chartlabels, charts, fixes, geo, planning, procedures
from wingtip import flight_plan as fp
# As vfr_holds: PlanQuery's own `holds` is the address's.
from wingtip import holds as vfr_holds
from wingtip.config import VFR_SECTIONAL_MAX_ZOOM, VFR_SECTIONAL_MIN_ZOOM
from wingtip.engine import ask as engine
from wingtip.planning import aircraft_profile, route_line
from wingtip.profile import route_profile as side_view

from .. import chart_model, foreflight, prefetch
from ..router_basics import CHART_CACHE, DEFAULT_AIRCRAFT, Route, line, load_route, ndjson, resolve, resolve_stop, stops_of
from ..schemas.common import (
    AltitudeChoice,
    FlightRules,
)
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

router = APIRouter()

# A pilot's own cruise speed: above zero, since every leg's time divides
# by it -- zero was a ZeroDivisionError and a 500 rather than a 422.
CruiseTas = Annotated[float | None, Query(gt=0, le=1000)]
# The power a pilot's own cruise figures are at, in percent: from the
# lowest a handbook's cruise table goes, about 40, to full power.
CruisePower = Annotated[float | None, Query(ge=40, le=100)]
#: An airplane's own service ceiling, ft, as the pilot sets it for their
#: N-number: from a powered glider's to past a piston single's highest.
ServiceCeiling = Annotated[float | None, Query(ge=1000, le=30000)]


@dataclass
class PlanQuery:
    """What /api/plan and /api/navlog are asked, read from the query by
    FastAPI (`Depends()`): the route, a pilot's own altitude or the plan
    chosen, the aeroplane -- a stock profile, a pilot's own figures laid
    over it -- and the departure time. One list where the two routes each
    spelled out all twelve, and one `profile()` built from it."""

    dep: str
    dest: str
    #: The stops landed at on the way, in order: "KDSM,KLNK".
    stops: str = ""
    altitude_ft: float | None = None
    #: `altitude_ft` was picked on the altitude wheel: flown on each leg
    #: where that leg may fly it, else at the leg's own legal altitude
    #: nearest it (14 CFR 91.159, 91.119), as the wheel's figures were
    #: worked out -- where a typed altitude is flown on every leg, legal or
    #: not, with its cautions.
    altitude_nearest: bool = False
    altitude_choice: AltitudeChoice = "fastest"
    aircraft: str = DEFAULT_AIRCRAFT
    cruise_tas_kt: CruiseTas = None
    fuel_burn_gph: float | None = None
    usable_fuel_gal: float | None = None
    climb_tas_kt: CruiseTas = None
    climb_fuel_burn_gph: float | None = None
    cruise_power_pct: CruisePower = None
    #: The airplane's own ceiling over its profile's, where the pilot has
    #: set one for their N-number (the owner's "give users a way to change
    #: these specs for their n-number").
    service_ceiling_ft: ServiceCeiling = None
    depart: datetime | None = None
    #: The pilot will have a Class B clearance: its shelves are no
    #: ceiling, and the route is planned through it (wingtip.altitude).
    class_b_clearance: bool = False
    #: The flight rules: "ifr" plans it under IFR -- 14 CFR 91.177's
    #: minimum altitudes, 91.179's by direction of flight, 91.167's
    #: reserve (wingtip.ifr) -- where "vfr", the default, plans it as before.
    rules: FlightRules = "vfr"
    #: Under IFR, the alternate filed: the fuel on to it after the
    #: destination (14 CFR 91.167(a)(2)), in the totals.
    alternate: str = ""
    #: Points' own altitudes, feet above sea level: "VPBNG:4500,KMSN:1900".
    #: A waypoint's is flown to it, the hop into it at that altitude (where
    #: a pilot crosses it); an airport's is its pattern, which a flight
    #: landing there comes down to. The rest of the route as planned.
    altitudes: str = ""
    #: The instrument procedures picked at the route's fields, as the
    #: address has them: "KDLH:I09:ANDOE,KORD:BENKY6:BYLAW", the field, the
    #: procedure and any transition -- approaches, arrivals and
    #: departures alike -- and a fix ATC sent the airplane direct to, after
    #: a fourth colon ("KELD:I22::BXCMB"), the procedure flown from there. A leg flown by them is the longer by their path
    #: (with_procedures), and a flight landing by an approach comes down
    #: to the altitude of its first fix rather than to the pattern
    #: (approach_end).
    procedures: str = ""
    #: The runway each field is left from, where the pilot picked one, as
    #: "KSTL:30R,KMSN:36": a departure picked there flown by its runway
    #: transition for it (wingtip.procedure_paths.procedure_path), or with no
    #: departure there, out along it and its upwind (with_procedures).
    runways: str = ""
    #: The runway each field is landed on, where the pilot picked one (or
    #: it was picked into the wind), as "KUGN:23,KMSN:36": with no approach
    #: there, the leg in is flown by its traffic pattern (with_procedures).
    patterns: str = ""
    #: With no runway picked at a field, the runway into its own report's
    #: wind (wind_picks), for the first plan to fly the patterns the page
    #: picks a moment later: planned without them, its time jumped as they
    #: came (KOSH-KGRB 20.8 min, then 33 with both patterns, 2026-10-28).
    wind_runways: bool = False
    #: Altitudes ATC gave the pilot to cross the procedures' fixes at,
    #: feet above sea level: "BXCMB:3000". Each stands for the chart's at
    #: that fix wherever a procedure picked passes it -- the descent planned
    #: to it and the path's heights (drawn_procedures).
    crossings: str = ""
    #: Holds the pilot put on the route's points (wingtip.holds): the point,
    #: its inbound course, R or L, its legs and how long, as
    #: "VPBNG/090/30:270:R:1M:2T"; several joined by commas.
    holds: str = ""
    #: Minutes on the ground at the route's stops: "KJVL:45". A stop not
    #: named turns around in TURNAROUND_MIN, at the owner's pick (2026-10-20):
    #: the flights after it leave that much later, for their winds, their
    #: night and their times.
    ground: str = ""
    #: Checkpoints between the route's own points, as the planner picks
    #: them off the chart. False, the legs run from point to point alone
    #: -- the departure, the stops, the destination -- as a pilot whose
    #: map shows no waypoints flies it; and nothing is scored for them.
    checkpoints: bool = True

    def profile(self) -> dict:
        return aircraft_profile(
            self.aircraft, self.cruise_tas_kt, self.fuel_burn_gph, self.usable_fuel_gal,
            self.climb_tas_kt, self.climb_fuel_burn_gph, self.cruise_power_pct, self.service_ceiling_ft,
        )

    @property
    def aircraft_key(self) -> str:
        """The profile's name, and its own ceiling where one is set: what the
        altitude selection is cached by, as the ceiling decides it."""
        return self.aircraft if self.service_ceiling_ft is None else f"{self.aircraft}@{self.service_ceiling_ft:.0f}"

    def own_altitudes(self) -> dict[str, float]:
        """`altitudes` by ident; a 422 for one that is not "IDENT:FEET",
        or not a VFR altitude: under 18,000 ft MSL, the floor of Class A
        (14 CFR 71.33), where no flight is VFR (14 CFR 91.135). Under IFR,
        up to FL410, the top of RVSM airspace (14 CFR part 91, Appendix G,
        section 1; 91.179(b)(4))."""
        top = 41_000 if self.rules == "ifr" else 17_999
        out = {}
        for part in filter(None, (p.strip() for p in self.altitudes.split(","))):
            ident, _, feet = part.partition(":")
            if not point_figure(part) or not 0 < float(feet) <= top:
                raise HTTPException(422, f"{part!r} is not a point's altitude: an ident and feet, as VPBNG:4500.")
            out[point_key(ident)] = float(feet)
        return out


    def procedure_picks(self) -> list[tuple[str, str, str | None, str | None]]:
        """`procedures`, each the field, the procedure, its transition
        (None, an approach from vectors) and the fix flown direct to (None,
        as charted); a 422 for one that is not
        "FIELD:PROCEDURE[:TRANSITION[:DIRECT]]" -- the engine's reading
        (wingtip_engine::route::picks), the web app's lib/procedures too."""
        out = []
        for read in engine("procedures_read", text=self.procedures):
            if not read["exact"]:
                raise HTTPException(422, f"{read['part']!r} is not a procedure: a field, a procedure and a transition, as KDLH:I09:ANDOE.")
            pick = read["pick"]
            out.append((pick["ident"], pick["id"], pick["transition"], pick["direct"]))
        return out

    def own_crossings(self) -> dict[str, float]:
        """`crossings` by fix; a 422 for one that is not "FIX:FEET", or
        over the altitudes' top (own_altitudes)."""
        top = 41_000 if self.rules == "ifr" else 17_999
        out = {}
        for part in filter(None, (p.strip() for p in self.crossings.split(","))):
            ident, _, feet = part.partition(":")
            if not point_figure(part) or not 0 < float(feet) <= top:
                raise HTTPException(422, f"{part!r} is not a fix's crossing altitude: a fix and feet, as BXCMB:3000.")
            out[ident.upper()] = float(feet)
        return out

    def own_holds(self) -> list[vfr_holds.Hold]:
        """`holds`, each as wingtip.holds.parse reads it; a 422 for one that is
        not a hold."""
        out = []
        for part, hold in vfr_holds.parse_all(self.holds):
            if hold is None:
                raise HTTPException(422, f"{part!r} is not a hold: a point, its inbound course, R or L, its legs and how long, "
                                         "as VPBNG:270:R:1M:2T.")
            out.append(hold)
        return out

    def own_ground(self) -> dict[str, float]:
        """`ground` by ident; a 422 for one that is not "IDENT:MINUTES", or
        a stop of more than a day."""
        out = {}
        for part in filter(None, (p.strip() for p in self.ground.split(","))):
            ident, _, minutes = part.partition(":")
            if not point_figure(part) or not 0 <= float(minutes) <= 24 * 60:
                raise HTTPException(422, f"{part!r} is not a stop's time on the ground: an ident and minutes, as KJVL:45.")
            out[point_key(ident)] = float(minutes)
        return out

    def departure_runways(self) -> dict[str, str]:
        """The runway each field is left from (`runways`), by its ident."""
        return runway_picks(self.runways, "is not a runway left from: an ident and a runway, as KSTL:30R.")

    def landing_runways(self) -> dict[str, str]:
        """The runway each field is landed on (`patterns`), by its ident."""
        return runway_picks(self.patterns, "is not a runway landed on: an ident and a runway, as KUGN:23.")

    def drawn_procedures(self) -> list[tuple[str, dict]]:
        """The procedures picked (procedure_picks), each its field and its
        drawing (wingtip.procedures.procedure_drawing), read once for the
        request; one the CIFP does not have, or cannot be had, left out:
        its leg is flown as the route goes. A fix the pilot was given an
        altitude to cross at (own_crossings) is crossed at it, in place of
        the chart's window, for the descent and the path alike."""
        own = self.own_crossings()
        out = []
        for ident, procedure, transition, direct in self.procedure_picks():
            try:
                drawn = procedures.procedure_drawing(ident, procedure, transition)
            except RuntimeError:
                continue
            if drawn:
                fixes_ = [{**f, "min_ft": own[f["ident"]], "max_ft": own[f["ident"]]}
                          if f["ident"] in own and not f["missed"] else f for f in drawn.get("fixes", [])]
                drawn = {**drawn, "fixes": fixes_, **({"direct": direct} if direct else {})}
                out.append((ident, drawn))
        return out

    def alternate_airport(self) -> dict | None:
        """Under IFR, the alternate filed (`alternate`) as the airports
        table has it, with its ident; None under VFR or with none filed. A
        404 for one that is not an airport, before any planning (and
        before the nav log's stream starts, where it was an error line)."""
        if self.rules != "ifr" or not self.alternate.strip():
            return None
        try:
            alt = airports.get_airport(self.alternate)
        except ValueError as err:
            raise HTTPException(404, f"No airport goes by {self.alternate!r}.") from err
        return {**alt, "ident": self.alternate.strip().upper()}

    def asked(self) -> fp.Asked:
        """The request read for wingtip.flight_plan: each part that is not
        one refused now, a 422 (or a 404 for an alternate that is not an
        airport), before any of the planning is done for it."""
        return fp.Asked(
            profile=self.profile(), aircraft_key=self.aircraft_key, altitude_ft=self.altitude_ft,
            altitude_nearest=self.altitude_nearest, altitude_choice=self.altitude_choice,
            class_b_clearance=self.class_b_clearance, rules=self.rules, depart=self.depart,
            own_altitudes=self.own_altitudes(), drawn=self.drawn_procedures(),
            leave_runways=self.departure_runways(), land_runways=self.landing_runways(), wind_runways=self.wind_runways,
            ground=self.own_ground(), holds=self.own_holds(), checkpoints=self.checkpoints,
            alternate=self.alternate_airport(),
        )


def point_figure(part: str) -> bool:
    """Whether `part` is a point of the route and a figure, "VPBNG:4500":
    an ident, or the pilot's own point off a fix, "VPBNG/090/30" or packed
    "DLH090030", by the engine's form of one (wingtip_engine::route::points,
    which the web app's lib/identSchema asks too, either case here) -- as the
    saved flight's SaveFlightRequest.POINT takes it, where an altitude set
    on such a point was a 422 for the whole log -- and up to five figures."""
    ident, _, figure = part.partition(":")
    return ident.isascii() and engine("point_kind", text=ident.upper()) is not None and re.fullmatch(r"\d{1,5}", figure) is not None


def point_key(ident: str) -> str:
    """A point's ident as the route has it (Route.idents): a point off a
    fix in its one written form (wingtip.fixes.frd_ident), packed or not."""
    parts = fixes.parse_frd(ident)
    return fixes.frd_ident(*parts) if parts else ident.upper()


def runway_picks(text: str, not_one: str) -> dict[str, str]:
    """The runways picked at fields, "KSTL:30R,KMSN:36", by the field's FAA
    ident (_bare_field), as the engine reads them
    (wingtip_engine::route::picks); a 422 for one that is not "IDENT:RUNWAY",
    `not_one` saying what it is not."""
    out = {}
    for read in engine("runways_read", text=text):
        if read["pick"] is None:
            raise HTTPException(422, f"{read['part']!r} {not_one}")
        out[read["pick"]["field"]] = read["pick"]["runway"]
    return out


# How often the nav log stream says it is still working while the
# altitude plans are being made.
HEARTBEAT_S = 8


def chart_layers() -> list[ChartLayer]:
    """Every chart kind the map may draw, with its zoom range -- and,
    for an overlay, its sheets and where they are, which is how the
    map knows to offer the Chicago TAC over Chicago."""
    return [
        ChartLayer(
            kind=k.key, label=k.label, min_zoom=k.min_zoom, max_zoom=k.max_zoom, base=k.base, over=list(k.over),
            cycle=(cycle := charts.serving_cycle_of(k.key)), revision=charts.tiles_revision(cycle),
            scales=charts.tile_scales(k.key),
            sheets=[] if k.base else [
                ChartSheet(name=name, label=charts.sheet_label(k, name), west=w, south=s, east=e, north=n)
                for name, (w, s, e, n) in charts.sheets(k)
            ],
        )
        for k in charts.KINDS.values()
    ]


def _chart_info() -> dict:
    cycle = charts.serving_cycle()
    return {
        "max_zoom": VFR_SECTIONAL_MAX_ZOOM, "min_zoom": VFR_SECTIONAL_MIN_ZOOM, "chart_cycle": cycle,
        "chart_revision": charts.tiles_revision(cycle),
        "chart_layers": chart_layers(),
    }


@router.get("/api/chart")
def chart_info(response: Response) -> ChartInfo:
    """The chart the map draws, for a map with no route on it yet: the
    planner's page opens on a search bar over the chart, as Maps does.
    The map asks for no tile before this answers, so it may be kept
    (CHART_CACHE) and served from the CDN's edge."""
    response.headers["Cache-Control"] = CHART_CACHE
    return ChartInfo(**_chart_info())


@router.get("/api/route-profile")
def route_profile(dep: str, dest: str, stops: str = "") -> RouteProfile:
    """The route's side view: the ground under it every 2 nm and the
    Class B, C and D airspace it passes through, floor and ceiling, along
    the whole route through its stops (wingtip.profile) -- for the page to
    draw the plan's altitudes, climbs and descents over."""
    r = load_route(dep, dest, stops)
    shp_path = airspace.ensure_class_airspace_shapefile(altitude.DEFAULT_FAA_CACHE_DIR)
    return side_view([(a["lat"], a["lon"]) for a in r.airports], shp_path)


@router.get("/api/route-check")
def route_check(dep: str = "", dest: str = "", stops: str = "") -> RouteChecked:
    """Whether a route would plan, checked as a typed one is (load_route):
    a 404 naming an ident that is not one, a 422 for a stop at the point
    before it or too many stops. With an end missing, each ident given is
    checked alone. Nothing is read or planned. For the assistant's
    proposals of a change to the plan; the gateway forwards no app here."""
    if dep and dest:
        load_route(dep, dest, stops)
    else:
        resolve(*(ident for ident in (dep, dest) if ident))
        for stop in stops_of(stops):
            resolve_stop(stop)
    return RouteChecked(stops=stops_of(stops))


@router.get("/api/course")
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
        return {**end, "airspace_class": airspace.surface_class_at(end["lat"], end["lon"], shp),
                "pattern_altitude_ft": fp.field_pattern_ft(end["ident"], end)}

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


def named_checkpoints(r: Route) -> tuple[list, list, list]:
    """The route's checkpoints scored and picked (route_checkpoints), each
    selected one named as the route's ForeFlight pack names it, the pack's
    own naming (app.foreflight), for the web app's flight plan link to name
    them by (CONTPACK@LAKE_ZURICH): scored, selected and each hop's."""
    scored, selected, by_hop = route_checkpoints(r)
    names = foreflight.waypoint_names(r.dep_ident, r.dest_ident, foreflight.from_candidates(selected))
    for c, name in zip(selected, names):
        c["waypoint"] = name
    return scored, selected, by_hop


async def _read_ahead(
    ahead: Annotated[bool, Query(description="Asked ahead of the pilot -- a Recent or Saved route planned while "
                                 "the page is idle: its chart reads wait behind the route on screen's")] = False,
) -> None:
    """The request's chart reads as reads ahead (chart_model.READ_AHEAD).
    Async, so it is set in the request's own context, which the endpoint's
    thread and a streamed body's are copied from."""
    chart_model.READ_AHEAD.set(ahead)


@router.get("/api/checkpoints", dependencies=[Depends(_read_ahead)])
def checkpoints(dep: str, dest: str, stops: str = "") -> Checkpoints:
    """Scored candidates and the subset worth flying, hop by hop along
    the whole route: fast once each hop's chart has been read, a few
    seconds for its first time."""
    r = load_route(dep, dest, stops)
    scored, selected, _ = named_checkpoints(r)
    return Checkpoints(
        departure=r.departure, destination=r.destination, stops=r.stops, candidates=scored, selected=selected,
    )


@router.get(
    "/api/foreflight-pack/{route}/{file}",
    response_class=Response,
    responses={200: {"content": {"application/zip": {}}, "description": "The pack, a ZIP"}},
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
    headers = {
        "Content-Disposition": f'attachment; filename="{foreflight.file_name(list(r.idents))}"',
        "Accept-Ranges": "bytes",
    }
    try:
        wanted = foreflight.byte_range(request.headers.get("range"), len(body))
    except ValueError:
        return Response(status_code=416, headers={**headers, "Content-Range": f"bytes */{len(body)}"})
    if wanted is None:
        return Response(body, media_type="application/zip", headers=headers)
    start, end = wanted
    return Response(
        body[start:end + 1], status_code=206, media_type="application/zip",
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

    aircraft names a stock profile; cruise_tas_kt, fuel_burn_gph,
    usable_fuel_gal, climb_tas_kt, climb_fuel_burn_gph and
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
        aircraft={"name": q.aircraft, **asked.profile},
        **_chart_info(),
    )


#: The longest local flight planned: a day's flying.
LocalMinutes = Annotated[float, Query(gt=0, le=12 * 60)]


@router.get("/api/local-flight")
def local_flight(q: Annotated[PlanQuery, Depends()], duration_min: LocalMinutes = 60.0) -> Totals:
    """A flight that leaves and lands at the same airport -- the pattern,
    practice approaches, an hour's sightseeing: no course and no legs to
    plan, so its totals are the time aloft at the aeroplane's cruise burn,
    with the fuel check a route's has (the start and taxi allowance, the
    VFR reserve by day or by night, the usable fuel). Night is judged at
    the field at both ends of the time aloft, from now where no
    departure time is given (planning.flight_totals). A 422 for a route
    that is not one airport to itself."""
    r = load_route(q.dep, q.dest, q.stops)
    if r.dep_ident != r.dest_ident or len(r.idents) != 2:
        raise HTTPException(422, "A local flight leaves and lands at the same airport, with no stops.")
    profile = q.profile()
    fuel = round(profile["fuel_burn_gph"] * duration_min / 60, 1)
    depart = planning.now() if q.depart is None else q.depart if q.depart.tzinfo else q.depart.replace(tzinfo=timezone.utc)
    night = engine("night_at_either_end", start=list(r.start), depart_s=depart.timestamp(), end=list(r.start),
                   arrive_s=(depart + timedelta(minutes=duration_min)).timestamp())
    return Totals(
        distance_nm=0.0, ete_min=duration_min, fuel_gal=fuel, unflyable_legs=0, legs_without_wind=0,
        **engine("navlog_fuel_plan", total_fuel_gal=fuel, profile=profile, night=bool(night), rules=q.rules),
    )


@router.get("/api/navlog", dependencies=[Depends(_read_ahead)])
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

        runs = fp.hop_runs(r, by_hop, asked.depart, asked.profile, asked.ground, asked.holds)

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
                    yield line(NavLogStage(detail=(
                        f"Altitudes{where}, {elapsed:.0f} s, waiting on {named}…" if named
                        else f"Altitudes{where}, {elapsed:.0f} s, winds for each plan…"
                    )))
        finally:
            altitude_pool.shutdown(wait=False)
        outcome = fp.join_outcomes(runs, outcomes)

        aircraft_line = {"name": q.aircraft, **asked.profile}
        if isinstance(outcome, fp.Unflyable):
            why, detours = fp.unflyable_parts(outcome, runs)
            yield line(NavLogError(detail=why["title"], brief=why["brief"], reasons=why["reasons"],
                                   advice=why["advice"], retry=False,
                                   class_b=why["class_b"], detours=detours))
            return
        if isinstance(outcome, fp.NoWinds):
            # The selection stands -- terrain, airspace, the legal
            # altitudes -- even though the winds did not come: say what
            # was decided, then what failed.
            yield line(NavLogAltitude(
                flown=None,
                altitude_ft=None,
                altitude_selection=outcome.selection,
                options=outcome.options,
                aircraft=aircraft_line,
                altitude_figures=list(outcome.figures),
            ))
            yield line(NavLogError(detail=str(outcome.error)))
            return

        # Before any leg -- the checkpoints already on screen from
        # /api/checkpoints can show their own cruise altitude
        # immediately rather than waiting on the first leg to carry it.
        yield line(NavLogAltitude(
            flown=outcome.choice or "custom",
            altitude_ft=outcome.altitude_ft,
            altitude_selection=outcome.selection,
            options=outcome.options,
            aircraft=aircraft_line,
            cautions=list(outcome.cautions),
            class_b_detours=fp.class_b_detours_of(runs, outcome, asked),
            altitude_figures=list(outcome.figures),
        ))
        outcome, legs = fp.flown_as_picked(r, runs, outcome, asked)
        for leg in legs:
            yield line(NavLogLeg.model_validate(leg))

        yield line(NavLogDone(totals=fp.totals_of(r, runs, outcome, asked)))

    return ndjson(lines(), NavLogError)
