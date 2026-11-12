"""A flight put together: each hop's altitude decided, its legs flown as
the pilot picked them -- the procedures, the runways and their patterns,
the holds, the points' own altitudes -- the tops of climb and descent
placed, and the totals with the fuel check and any fuel stops. The
planner's /api/plan, /api/navlog and the Go / No-Go (app.routers) ask
this with the request read (Asked); every figure in it is the engine's
(wingtip_native.call), and this module only looks up what the engine is
handed -- the chart's checkpoints, the winds, the runways, the
procedures' paths -- and joins its answers. Moved here from
app.routers.plan (2026-11-09), so the router only reads the request,
calls and answers.

A route may land at stops on the way: each flight between two landings
-- a hop -- is planned as a route of its own, with its own altitude
plan, climb from the field and fuel check, the hops planned at once, and
the nav log runs on through each stop. A route is any object with
Route's members (app.router_basics.Route): `idents`, `airports`, `hops`,
`flights`, `start`, `end`, `takes_off`, `lands` and the rest."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta, timezone

from . import (
    airports,
    elevation,
    faa_data,
    fixes,
    fuelstops,
    geo,
    magnetic,
    navlog,
    own_altitude,
    pattern,
    places,
    planning,
    procedure_paths,
    runway_wind,
    terrain_detour,
    weather,
)
from . import holds as vfr_holds
from .config import DATA_DIR
from .engine import ask as engine
from .planning import (
    COMPUTE_LIMIT_S,
    StillComputing,
    alternate_leg,
    altitude_anyway,
    altitude_plans,
    altitude_waiting_on,
    class_b_detours,
    class_b_ways,
    cruise_altitude,
    flight_totals,
    flight_window,
    join_selections,
    no_altitude,
    own_altitude_caution,
    prohibited_caution,
    route_totals,
    winds_key_for,
)
from .units import M_TO_FT
from .weather import WeatherServiceError

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Asked:
    """What a flight is planned with, read from the request by its caller
    (app.routers.plan's PlanQuery.asked, which refuses what is not one).

    `profile` is the airplane's (wingtip.aircraft.aircraft_profile) and
    `aircraft_key` what the altitude selection is cached by (its name and any
    ceiling of the pilot's own); `profile` None is no airplane (no `aircraft`
    asked): the route's own figures, and none that needs an airplane.
    `altitude_ft`, a pilot's own cruise, is flown on every leg -- or,
    `altitude_nearest` (the wheel's pick), at each leg's legal altitude nearest
    it; without it the plan `altitude_choice` is flown. `own_altitudes` are
    points' own altitudes by ident, `drawn` the procedures picked as drawn
    (wingtip.procedures.procedure_drawing), `leave_runways` and `land_runways`
    the runways picked by field, `wind_runways` whether the rest are picked
    into the wind (wind_picks), `ground` the minutes on the ground at stops,
    `holds` the pilot's holds, `checkpoints` whether the legs run by the
    chart's checkpoints, and `alternate` the IFR alternate filed, as the
    airports table has it with its ident."""

    profile: dict | None
    aircraft_key: str
    altitude_ft: float | None = None
    altitude_nearest: bool = False
    altitude_choice: str = "fastest"
    class_b_clearance: bool = False
    rules: str = "vfr"
    depart: datetime | None = None
    own_altitudes: dict = field(default_factory=dict)
    altitude_starts: frozenset = frozenset()  # the Start At points (wingtip.own_altitude)
    drawn: list = field(default_factory=list)
    leave_runways: dict = field(default_factory=dict)
    land_runways: dict = field(default_factory=dict)
    wind_runways: bool = False
    ground: dict = field(default_factory=dict)
    holds: list = field(default_factory=list)
    checkpoints: bool = True
    alternate: dict | None = None


def departure_elevation(r) -> float | None:
    """The field the climb starts from, when the airports table knows
    it; a present position's own altitude, the GPS's, where it has one --
    a Direct-To in the air climbs from where the airplane is, not from the
    ground or level at the first leg's altitude; None starts the log level
    at the first leg's altitude -- as a hop out of a waypoint does, flown
    through at cruise.

    Never under the ground at the position (USGS 3DEP, wingtip.elevation: the
    first of the route's terrain samples, read already for its floor): a
    phone indoors gave its GPS altitude as 0 ft MSL where the ground is
    730 ft, and the log climbed from under it. Where the ground cannot be
    read, the GPS's altitude as it is."""
    if r.takes_off:
        return r.departure.get("elevation_ft")
    altitude_ft = r.dep_airport.get("altitude_ft")
    if altitude_ft is None:
        return None
    point = (r.dep_airport["lat"], r.dep_airport["lon"])
    try:
        ground_ft = elevation.get_elevations_m([point])[point] * M_TO_FT
    except Exception:  # noqa: BLE001 -- the ground unread is the GPS's word alone, not a failed plan
        return altitude_ft
    return max(altitude_ft, round(ground_ft))


@dataclass(frozen=True)
class Flown:
    """Legs to fly: the chosen plan's (`choice`), or at a pilot's own
    altitude (`choice` None), with the selection and the four plans
    beside them either way (`options`, each as the engine gives it with
    its `kind`). `legs` of a plan is the planner's cached list: read it,
    never change it. `by_hop`, a route with stops' legs hop by hop (one
    list for a route without), for each hop's totals."""

    selection: dict
    options: list
    choice: str | None
    altitude_ft: float
    legs: list
    by_hop: tuple = ()
    #: For each hop flown at a pilot's own altitude, what is wrong with it
    #: (own_altitude_caution).
    cautions: tuple = ()
    #: The route flown at each altitude the wheel offers (the planner's
    #: AltitudeFigure).
    figures: tuple = ()

    @property
    def hop_legs(self) -> list:
        return list(self.by_hop) or [self.legs]


@dataclass(frozen=True)
class Unflyable:
    """Some leg has no legal cruising altitude; the selection says why.
    `between`, the hop of a route with stops it is on."""

    selection: dict
    between: tuple[str, str] | None = None


@dataclass(frozen=True)
class NoWinds:
    """The winds the legs need could not be read. The selection -- and
    the plans, when it was only a pilot's own altitude that failed --
    still stand, and a caller can report them before the failure."""

    selection: dict
    options: list
    error: WeatherServiceError
    figures: tuple = ()


def resolve_altitude(
    r,
    fix_list: list,
    profile: dict | None,
    aircraft: str,
    altitude_ft: float | None,
    choice: str,
    fcst_hr: str = "06",
    window: tuple | None = None,
    class_b_cleared: bool = False,
    rules: str = "vfr",
    nearest: bool = False,
) -> Flown | Unflyable | NoWinds:
    """What the log flies, decided once for /api/plan and /api/navlog
    alike. `fcst_hr` is the winds key for the departure (see
    winds_key_for), `window` the flight's own hours the go/no-go
    forecast is read over (see flight_window).

    The four plans are made beside a pilot's own altitude as well, as
    what the planner would have flown. With `nearest` (the wheel's pick)
    the altitude is flown where each leg may fly it, else at that leg's
    nearest legal one: the figures the wheel showed for it, and no leg
    under its floor or on the wrong thousands for its course."""
    selection = cruise_altitude(
        r.start,
        r.end,
        profile,
        aircraft,
        fixes=_fixes(fix_list),
        fcst_hr=fcst_hr,
        window=window,
        class_b_cleared=class_b_cleared,
        rules=rules,
        airway=r.dest_airport.get("airway"),
    )
    try:
        plans = altitude_plans(fix_list, selection, profile, aircraft, fcst_hr, departure_elevation(r))
        failure = None
    except WeatherServiceError as err:
        plans, failure = {}, err
    options = [{"kind": kind, **{k: v for k, v in plan.items() if k not in ("legs", "totals")}} for kind, plan in plans.items()]
    figures = tuple(getattr(plans, "by_altitude", []))
    if altitude_ft is not None and nearest and plans:
        return Flown(selection, options, None, altitude_ft, plans.legs_at(altitude_ft), figures=figures)
    if altitude_ft is not None:
        try:
            legs = engine(
                "navlog_with_climbs",
                legs=navlog.legs(fix_list, altitude_ft, profile, fcst_hr),
                start_altitude_ft=departure_elevation(r),
                profile=profile,
            )
        except WeatherServiceError as err:
            return NoWinds(selection, options, err, figures)
        caution = own_altitude_caution(selection, legs, (r.dep_ident, r.dest_ident), profile)
        return Flown(selection, options, None, altitude_ft, legs, cautions=(caution,) if caution else (), figures=figures)
    if failure is not None:
        return NoWinds(selection, options, failure, figures)
    if not plans:
        # No legal altitude: flown anyway, at the lowest over the terrain,
        # with what it breaks said beside it, at the owner's "I don't want
        # to put hard limits on anything" (2026-10-23). Unflyable only where
        # the floor itself is not known.
        anyway = altitude_anyway(selection)
        if anyway is None:
            return Unflyable(selection)
        try:
            legs = engine(
                "navlog_with_climbs",
                legs=navlog.legs(fix_list, anyway, profile, fcst_hr),
                start_altitude_ft=departure_elevation(r),
                profile=profile,
            )
        except WeatherServiceError as err:
            return NoWinds(selection, options, err, figures)
        between = (r.dep_ident, r.dest_ident)
        caution = own_altitude_caution(selection, legs, between, profile) or {
            "from_ident": between[0],
            "to_ident": between[1],
            "altitude_ft": anyway,
            "reasons": [],
        }
        caution = {**caution, "reasons": [*prohibited_caution(selection), *caution["reasons"]]}
        return Flown(selection, options, None, anyway, legs, cautions=(caution,) if caution["reasons"] else (), figures=figures)
    # With no airplane there is no fastest or most economical plan (the
    # engine's navlog_plans makes the band's two): the lowest is flown.
    choice = choice if choice in plans else "lowest"
    legs = plans[choice]["legs"]
    return Flown(selection, options, choice, legs[0]["altitude_ft"], legs, figures=figures)


def _fixes(fix_list: list) -> list:
    return [(f["lat"], f["lon"]) for f in fix_list]


@dataclass(frozen=True)
class HopRun:
    """One hop's planning, as a route without stops is planned: its fixes,
    the winds forecast period and go/no-go window it is flown in, and the
    departure time its fuel reserve is judged by (None, as the route's,
    when none was given)."""

    hop: object
    fixes: list
    fcst_hr: str
    window: tuple
    depart: datetime | None


#: The time on the ground at a stop where the pilot gave none, min: a
#: turnaround -- taxi in, fuel, a break, taxi out -- at the owner's pick of
#: the audit's choices (2026-10-20), the engine's (planning_figures), which
#: the web asks too for the rows it draws before the nav log's legs say
#: each stop's (Leg.ground_min).
TURNAROUND_MIN = float(engine("planning_figures")["turnaround_min"])


def ground_min_at(ground: dict[str, float] | None, ident: str) -> float:
    """The minutes on the ground at the stop `ident`: the pilot's own
    (Asked.ground), else TURNAROUND_MIN. The one rule the hops' start
    times, the legs and the totals all go by."""
    return (ground or {}).get(ident.upper(), TURNAROUND_MIN)


def hop_runs(
    r,
    by_hop: list,
    depart: datetime | None,
    profile: dict | None,
    ground: dict[str, float] | None = None,
    held: list[vfr_holds.Hold] | None = None,
) -> list[HopRun]:
    """Each hop of `r` ready to plan, `by_hop` its selected checkpoints.
    A hop after the first is flown when the ones before it are done, at
    cruise speed, and after the time on the ground at each stop it lands
    at (`ground`, by ident, else TURNAROUND_MIN) -- an estimate, to the
    hour its winds and forecast are read for. The first is the route's
    own: a route without stops is planned exactly as it always was. A
    hold (`held`) is flown on the hop leaving its point, so the hops after
    it leave the later by its minutes (as with_holds puts them there); a
    round trip's field is held at on arrival, after the last hop.

    With no airplane (`profile` None) no flight's time is known: every hop
    is read for the departure's hour, and the holds add nothing."""
    ground = ground or {}
    runs, elapsed_h = [], 0.0
    tas = max(profile["cruise_tas_kt"], 1.0) if profile else None
    idents = [ident.upper() for ident in r.idents]
    holding = {}
    for hold in held if tas else ():
        if hold.fix in idents[:-1] and not (hold.fix == idents[0] == idents[-1] and hold.fix not in idents[1:-1]):
            holding[hold.fix] = holding.get(hold.fix, 0.0) + vfr_holds.held_minutes(hold, tas)
    for i, (hop, selected) in enumerate(zip(r.hops, by_hop)):
        if i == 0:
            when = depart
        else:
            start = datetime.now(timezone.utc) if depart is None else (depart if depart.tzinfo else depart.replace(tzinfo=timezone.utc))
            when = start + timedelta(hours=elapsed_h)
        runs.append(
            HopRun(
                hop,
                navlog.fixes(hop.dep_ident, hop.dest_ident, hop.start, hop.end, selected),
                winds_key_for(when),
                flight_window(when, hop.length_nm, tas),
                # A later flight's own time, now's flights' too: its night was
                # judged at now, as the first's is.
                when if depart is not None or i > 0 else None,
            )
        )
        if tas is None:
            continue
        elapsed_h += hop.length_nm / tas + holding.get(hop.dep_ident.upper(), 0.0) / 60
        if hop.lands and i < len(r.hops) - 1:
            elapsed_h += ground_min_at(ground, hop.dest_ident) / 60
    return runs


def resolve_run(run: HopRun, asked: Asked) -> Flown | Unflyable | NoWinds:
    """One hop's altitude and legs (resolve_altitude), as asked."""
    own = own_altitude.of_hop(run.hop, asked.own_altitudes, asked.altitude_starts)  # a waypoint's own
    return resolve_altitude(
        run.hop,
        run.fixes,
        asked.profile,
        asked.aircraft_key,
        asked.altitude_ft if own is None else own,
        asked.altitude_choice,
        run.fcst_hr,
        run.window,
        asked.class_b_clearance,
        asked.rules,
        nearest=asked.altitude_nearest and own is None,
    )


def join_options(options_by_hop: list[list[dict]], lengths: list[float]) -> list[dict]:
    """The four plans of a route with stops: each the same plan flown on
    every hop, its steps in turn and its costs summed -- the tailwind
    weighted by each hop's length. None where a hop's plans could not be
    made. The engine's (navlog_join_plans)."""
    return engine("navlog_join_plans", by_hop=[list(options) for options in options_by_hop], lengths=list(lengths))


def join_figures(figures_by_hop: list[tuple], lengths: list[float]) -> tuple:
    """A route with stops' figures at each altitude, from each hop's: every
    altitude any hop offers, each hop at it or, where it does not offer
    it, at its own nearest (the lower on a tie), as a pilot who picks it
    flies that hop; times and fuel summed, the wind weighed by each hop's
    length. One hop's as they are. A hop with no legal altitude to offer
    leaves the others' altitudes on the ruler, their times and fuel
    unknown and none flown everywhere. The engine's (navlog_join_figures)."""
    return tuple(engine("navlog_join_figures", by_hop=[list(figures) for figures in figures_by_hop], lengths=list(lengths)))


def join_outcomes(runs: list[HopRun], outcomes: list) -> Flown | Unflyable | NoWinds:
    """What a route with stops flies, from each hop's own outcome: the
    first hop with no legal altitude makes the route unflyable, and says
    which hop; a winds outage on any hop stops the legs, the selection
    standing; otherwise the legs run on through each stop."""
    if len(outcomes) == 1:
        return outcomes[0]
    for run, outcome in zip(runs, outcomes):
        if isinstance(outcome, Unflyable):
            return Unflyable(outcome.selection, between=(run.hop.dep_ident, run.hop.dest_ident))
    lengths = [run.hop.length_nm for run in runs]
    offsets = [sum(lengths[:i]) for i in range(len(lengths))]
    selection = join_selections([o.selection for o in outcomes], offsets)
    options = join_options([o.options for o in outcomes], lengths)
    figures = join_figures([o.figures for o in outcomes], lengths)
    for outcome in outcomes:
        if isinstance(outcome, NoWinds):
            return NoWinds(selection, options, outcome.error, figures)
    # The plan the route flies is the one its hops are flown on, a hop
    # into a waypoint at its own altitude (resolve_run) or not.
    planned = next((o for o in outcomes if o.choice is not None), outcomes[0])
    return Flown(
        selection,
        options,
        planned.choice,
        planned.altitude_ft,
        [leg for o in outcomes for leg in o.legs],
        tuple(o.legs for o in outcomes),
        tuple(c for o in outcomes for c in o.cautions),
        figures,
    )


def unflyable_parts(outcome: Unflyable, runs: list[HopRun]) -> tuple[dict, list[dict]]:
    """no_altitude's words for a route with no legal altitude, and the
    waypoints round the Class B airspace that stops it, best first
    (class_b_detours), each with its place in the stops: on the hop it
    fails on."""
    at = next((i for i, run in enumerate(runs) if (run.hop.dep_ident, run.hop.dest_ident) == outcome.between), 0)
    hop = runs[at].hop
    ways = class_b_detours(outcome.selection, hop.start, hop.end)
    why = no_altitude(outcome.selection, outcome.between, ways[0] if ways else None, _stuck_where(outcome.selection, hop))
    out = [{**way, "stop_index": at, "description": _where(way["ident"])} for way in ways]
    if not ways:
        round_way = terrain_way(outcome.selection, hop)
        if round_way:
            out.append({**round_way, "stop_index": at})
            why = {
                **why,
                "advice": "Go round the high ground by the way suggested, or set a cruise altitude of your own to plan it anyway.",
            }
    return why, out


def terrain_way(selection: dict, hop) -> dict | None:
    """Where the airplane's service ceiling is what stops the route over
    high ground, the way round it (wingtip.terrain_detour): the points to fly
    by, as a detour of its own, with how much longer it makes the hop.
    None where something else stops it (clouds, Class B) or there is no
    way round in reach. At the owner's ask ("Suggest a way around the
    terrain ... Yes build it", 2026-10-23)."""
    stuck = next((s for s in selection.get("segments", []) if not s.get("candidates_ft")), None)
    ceiling = (stuck or {}).get("service_ceiling_ft")
    if not ceiling:
        return None
    try:
        points = terrain_detour.way_round(hop.start, hop.end, ceiling)
    except Exception:  # noqa: BLE001 -- the tiles out of reach: no suggestion, the problem said as before
        return None
    if not points:
        return None
    path = [hop.start, *((p["lat"], p["lon"]) for p in points), hop.end]
    flown = sum(geo.distance_nm(a[0], a[1], b[0], b[1]) for a, b in zip(path, path[1:]))
    return {
        "ident": points[0]["ident"],
        "kind": "Around the high ground",
        "added_nm": round(float(flown - hop.length_nm), 1),
        "description": " · ".join(p["ident"] for p in points),
        "via": [p["ident"] for p in points],
    }


def ways_round_of(runs: list[HopRun], outcome: Flown) -> list[dict]:
    """For each hop flown at no legal altitude (altitude_anyway), the ways
    round what stops it that the problem offered when it refused (the
    Class B's waypoints, the way round the high ground), for the pilot to
    take or not."""
    if not any("candidates_ft" in seg and not seg["candidates_ft"] for seg in outcome.selection.get("segments", [])):
        return []
    out, start = [], 0.0
    for run in runs:
        end = start + run.hop.length_nm
        mine = [seg for seg in outcome.selection.get("segments", []) if start - 0.05 <= seg.get("from_nm", -1) < end - 0.05]
        start = end
        if not any("candidates_ft" in seg and not seg["candidates_ft"] for seg in mine):
            continue
        _, ways = unflyable_parts(Unflyable({**outcome.selection, "segments": mine}, (run.hop.dep_ident, run.hop.dest_ident)), runs)
        out.extend(ways)
    return out


def class_b_detours_of(runs: list[HopRun], outcome: Flown, asked: Asked) -> list[dict]:
    """With the Class B clearance, the waypoints that keep each hop out of
    the Class B it enters at its highest cruise altitude (class_b_ways),
    each with its place in the stops as unflyable_parts gives them: what
    "Avoid Class B" adds. None without the clearance -- the route is then
    planned under or round it already -- or with no Class B on the way.
    Without a pilot's own altitude, the ways round a hop flown at no legal
    altitude first (ways_round_of)."""
    out = [] if asked.altitude_ft is not None else ways_round_of(runs, outcome)
    if not asked.class_b_clearance or not any(t.get("class") == "B" for t in outcome.selection.get("airspace_transits", [])):
        return out
    for at, (run, legs) in enumerate(zip(runs, outcome.hop_legs)):
        heights = [leg["altitude_ft"] for leg in legs if leg.get("altitude_ft") is not None]
        if not heights:
            continue
        ways = class_b_ways(run.hop.start, run.hop.end, max(heights))
        out.extend({**way, "stop_index": at, "description": _where(way["ident"])} for way in ways)
    return out


def _stuck_where(selection: dict, hop) -> str | None:
    """Where on the hop the altitude runs out, by the route's own points
    as the pilot entered them, at the pilot's ask: the middle of the first
    stretch with no legal altitude, from the nearer of the hop's ends --
    "540 nm past KDLH", "120 nm before KBUR" -- for the one line that says
    what stops the plan."""
    stuck = next((s for s in selection.get("segments", []) if not s.get("candidates_ft")), None)
    if stuck is None or stuck.get("from_nm") is None or stuck.get("to_nm") is None:
        return None
    middle = (stuck["from_nm"] + stuck["to_nm"]) / 2
    left = max(0.0, hop.length_nm - middle)
    return f"{middle:,.0f} nm past {hop.dep_ident}" if middle <= left else f"{left:,.0f} nm before {hop.dest_ident}"


def field_pattern_ft(ident: str, airport: dict) -> float | None:
    """A field's traffic pattern altitude above sea level as a pilot flies
    it: the engine's pattern_altitude (`flown_ft`, to the nearest hundred
    feet) from the field's elevation and the FAA's published height above
    it, else AC 90-66C's 1,000 ft (wingtip.faa_data.published_pattern_agl_ft,
    NASR APT_BASE's TPA). None where its elevation is not known."""
    elevation_ft = airport.get("elevation_ft")
    if elevation_ft is None:
        return None
    published = faa_data.published_pattern_agl_ft(ident, DATA_DIR / "raw" / "faa_nasr")
    return engine("pattern_altitude", elevation_ft=elevation_ft, published_agl_ft=published)["flown_ft"]


def pattern_altitude(flight, own: dict[str, float] | None = None) -> float | None:
    """The altitude a flight comes down to: the traffic pattern's at the
    field it lands at -- the pilot's own for it (Asked.own_altitudes), else
    field_pattern_ft. None where it ends in the air, or the field's
    elevation is not known."""
    if not flight.lands:
        return None
    if own and flight.dest_ident in own:
        return own[flight.dest_ident]
    return field_pattern_ft(flight.dest_ident, flight.dest_airport)


def approach_end(flight, drawn: list[tuple[str, dict]], cruise_ft: float | None = None) -> dict | None:
    """Where a flight landing by the instrument approach picked for its
    field comes down to, as the engine's navlog_with_descents takes it
    (`end_altitude_ft`, `end_before_nm`, `end_fix`): the engine's
    navlog_approach_end, the first fix of the approach with an altitude
    under the cruise (`cruise_ft`). None where no approach is picked there
    (`drawn`, Asked.drawn), no fix is under the cruise, or the CIFP cannot
    be had: down to the pattern."""
    if not flight.lands:
        return None
    approach = _picked(drawn, "approach", flight.dest_ident)
    if approach is None:
        return None
    field_ = flight.dest_airport
    fix_list = [{k: f.get(k) for k in ("ident", "lat", "lon", "min_ft", "max_ft", "missed")} for f in approach["fixes"]]
    return engine("navlog_approach_end", fixes=fix_list, cruise_ft=cruise_ft, field={"lat": field_["lat"], "lon": field_["lon"]})


def bare_field(ident: str) -> str:
    """A field's FAA ident: the CIFP names it by its ICAO ident (KDLH)
    where the route may have the FAA's (DLH), as lib/procedures' sameField:
    the engine's (wingtip_engine::route::points)."""
    return engine("bare_field", ident=ident)


def _picked(drawn: list[tuple[str, dict]], kind: str, field_: str) -> dict | None:
    """The procedure of `kind` picked at `field_`, drawn, if one is."""
    return next((d for ident, d in drawn if d.get("kind") == kind and bare_field(ident) == bare_field(field_.upper())), None)


def with_procedures(
    r,
    runs: list[HopRun],
    outcome: Flown,
    drawn: list[tuple[str, dict]],
    runways: dict[str, str] | None = None,
    landings: dict[str, str] | None = None,
) -> Flown:
    """The legs with the procedures picked flown (`drawn`, Asked.drawn): a
    flight's first leg out of its field by the departure picked there, its
    last into the field it lands at by the arrival and the approach picked
    there, each along their path from the leg's start
    (wingtip.procedure_paths.flown), a departure by its transition for the
    runway the pilot leaves from (`runways`) -- an arrival flown out to its
    first fix and round to the runway can be a hundred miles more than the
    leg it is flown in place of (C81 to O'Hare by BENKY6, 2026-10-19). The
    miles more are flown at the leg's ground speed and cruise burn, added
    to its time and fuel, so the totals, the fuel required (14 CFR 91.151,
    91.167) and the times at each point after are those of the flight
    flown. The leg keeps the route's own distance, which the chart, the
    side view and the tops of climb and descent are laid along, and says
    its path and the miles more (`procedure`) for the dry run to fly. New
    legs: the plan's own are the planner's cache's (Flown).

    With no departure picked, a flight leaves by the runway picked to
    leave from (`runways`): along it and its upwind, then out of the
    pattern straight on or at 45° (wingtip.pattern.departure_circuit, AIM
    4-3-3). With no approach, it lands by the traffic pattern for the
    runway picked to land on (`landings`): in at 45° to the downwind, then
    base and final (wingtip.pattern.arrival_circuit, AIM 4-3-3, AC 90-66C) --
    where it was flown straight to the middle of the field, with the
    pattern drawn round it on the map and not flown (the owner,
    2026-10-27: "is it not flying that and landing?")."""
    runways, landings = runways or {}, landings or {}
    if not drawn and not runways and not landings:
        return outcome
    hops = [[dict(leg) for leg in legs] for legs in outcome.hop_legs]
    at = 0
    for flight in r.flights:
        n = len(flight.idents) - 1
        # Each leg flown by procedures, and by which: out by a departure,
        # in by an arrival and an approach; one leg can be all three.
        by: dict[tuple[int, int], list] = {}
        dep_field, dest_field = bare_field(flight.dep_ident.upper()), bare_field(flight.dest_ident.upper())
        departure = _picked(drawn, "departure", flight.dep_ident) if flight.takes_off else None
        leaves_by = runways.get(dep_field) if flight.takes_off and not departure else None
        if (departure or leaves_by) and hops[at]:
            by.setdefault((at, 0), [None, None, None, None])[0] = departure
        arrival = _picked(drawn, "arrival", flight.dest_ident) if flight.lands else None
        approach = _picked(drawn, "approach", flight.dest_ident) if flight.lands else None
        lands_on = landings.get(dest_field) if flight.lands and not approach else None
        if (arrival or approach or lands_on) and hops[at + n - 1]:
            by.setdefault((at + n - 1, len(hops[at + n - 1]) - 1), [None, None, None, None])[1:3] = [arrival, approach]
        for (hop, i), picks in by.items():
            leg, fixes_ = hops[hop][i], runs[hop].fixes
            start, end = fixes_[i], fixes_[i + 1]
            first, last = hop == at and i == 0, hop == at + n - 1 and i == len(hops[hop]) - 1
            # Out of the pattern the way to the flight's next field, as the
            # map draws it (web lib/trafficPattern's departurePattern).
            takeoff = _circuit_out(flight.dep_ident, flight.dep_airport, leaves_by, flight.end) if first and leaves_by else None
            landing = _circuit_in(flight.dest_ident, flight.dest_airport, lands_on) if last and lands_on else None
            path = procedure_paths.flown(
                (start["lat"], start["lon"]),
                (end["lat"], end["lon"]),
                *picks[:3],
                runway=runways.get(dep_field) if picks[0] else None,
                takeoff_circuit=takeoff,
                landing_circuit=landing,
            )
            if path is not None and leg.get("tas_kt") is None:
                # No airplane: the path and its miles more, flown in no
                # time and on no fuel anyone knows.
                more_nm = max(0.0, path["nm"] - leg["distance_nm"])
                leg["procedure"] = {**path, "nm": round(path["nm"], 1), "more_nm": round(more_nm, 1), "more_min": None, "more_gal": None}
                continue
            if path is None or not leg["groundspeed_kt"] or leg["ete_min"] is None:
                continue
            # Never fewer miles than the leg: a path that cuts a corner of
            # the route is planned as the route.
            more_nm = max(0.0, path["nm"] - leg["distance_nm"])
            more_min = more_nm / leg["groundspeed_kt"] * 60
            more_gal = more_min / 60 * leg["fuel_burn_gph"]
            leg["ete_min"] = round(leg["ete_min"] + more_min, 1)
            if leg["fuel_gal"] is not None:
                leg["fuel_gal"] = round(leg["fuel_gal"] + more_gal, 2)
            leg["procedure"] = {
                **path,
                "nm": round(path["nm"], 1),
                "more_nm": round(more_nm, 1),
                "more_min": round(more_min, 1),
                "more_gal": round(more_gal, 2),
            }
        at += n
    return replace(outcome, legs=[leg for legs in hops for leg in legs], by_hop=tuple(hops) if outcome.by_hop else ())


#: How far ahead a field's time is before its runway is taken from a
#: forecast, not the report now (web ProceduresRoute's FORECAST_AFTER_MS,
#: the owner's pick of 2026-10-20).
FORECAST_AFTER_S = 60 * 60
#: A forecast's time, to the ten minutes, as the page asks for it.
FORECAST_STEP_S = 10 * 60


def wind_picks(r, outcome: Flown, asked: Asked) -> tuple[dict[str, str], dict[str, str]]:
    """The runways left from and landed on: the pilot's own picks
    (Asked.leave_runways, land_runways) and, with `wind_runways`, at every
    other field the runway into the wind the page picks for it as its
    weather comes in -- the field's own report's within FORECAST_AFTER_S
    of now (wingtip.runway_wind.runway_in_use), or with none of its own or
    a variable one, the nearest report's (_wind_of, wind_pick); the
    forecast's for the time the flight is there after that (wind_pick, its
    own TAF or the nearest's, wingtip.weather.forecast_wind) -- so a first
    plan flies its patterns and is the plan the page then asks for, where
    its time jumped as the picks came (KOSH-KGRB 20.8 min, then 33 with
    both patterns, 2026-10-28). The times: the departure (`depart`, now
    when not given), each landing the legs' ETEs on from it and each
    stop's minutes on the ground."""
    leave, land = asked.leave_runways, asked.land_runways
    if not asked.wind_runways:
        return leave, land
    now = planning.now()
    start = now if asked.depart is None else asked.depart if asked.depart.tzinfo else asked.depart.replace(tzinfo=timezone.utc)
    hops = outcome.hop_legs
    wanted_at: list[tuple[str, str, dict, dict, datetime]] = []  # (which, field, airport, its picks, when)
    at, t = 0, start
    for flight in r.flights:
        n = len(flight.idents) - 1
        if flight.takes_off:
            wanted_at.append(("leave", flight.dep_ident, flight.dep_airport, leave, t))
        t = t + timedelta(minutes=sum(leg["ete_min"] or 0 for legs in hops[at : at + n] for leg in legs))
        if flight.lands:
            wanted_at.append(("land", flight.dest_ident, flight.dest_airport, land, t))
        t = t + timedelta(minutes=ground_min_at(asked.ground, flight.dest_ident))
        at += n
    wanted = [a for a in wanted_at if bare_field(a[1].upper()) not in a[3] and not a[2].get("fix") and a[2].get("lat") is not None]
    if not wanted:
        return leave, land
    sources = {ident: (airport.get("ident") or ident).upper() for _, ident, airport, _, _ in wanted}
    try:
        reports = weather.metar_for_idents(list(dict.fromkeys([*sources.values(), *(i.upper() for i in sources)])))
    except weather.WeatherServiceError:
        reports = {}
    leave, land = dict(leave), dict(land)
    for which, ident, airport, _, when in wanted:
        report = reports.get(sources[ident]) or reports.get(ident.upper()) if reports else None
        try:
            winded = runway_wind.with_winds(airports.get_runways(sources[ident]), report, airport["lat"], airport["lon"])
            ways = pattern.with_traffic(winded, ident, airport["lat"], airport["lon"])
            if (when - now).total_seconds() > FORECAST_AFTER_S:
                at_s = round(when.timestamp() / FORECAST_STEP_S) * FORECAST_STEP_S
                end = runway_wind.wind_pick(ways, weather.forecast_wind(airport["lat"], airport["lon"], at_s, sources[ident]))
            else:
                end = runway_wind.runway_in_use(ways) or runway_wind.wind_pick(ways, _wind_of(report, airport, sources[ident]))
        except (OSError, ValueError, weather.WeatherServiceError):
            continue
        if end:
            (leave if which == "leave" else land).setdefault(bare_field(ident.upper()), end)
    return leave, land


def _wind_of(report: dict | None, airport: dict, source: str) -> dict | None:
    """The wind a field's runway is picked by where its own report put
    none on a runway (wind_picks): its own report's variable wind, else the
    nearest report's within reach (wingtip.weather.nearest_report), as the
    airport's card gives the page them (`metar`, `nearby_metar`)."""
    if report is None:
        near = weather.nearest_report(airport["lat"], airport["lon"], exclude=source)
        report = near and near.get("metar")
    return {"dir_true_deg": report.get("wind_dir_true_deg"), "speed_kt": report.get("wind_speed_kt")} if report else None


def _field_runway(ident: str, airport: dict, end: str) -> dict | None:
    """The runway at a field with the end `end`, its ends' places and
    traffic as the map has them (wingtip.pattern.with_traffic)."""
    if airport.get("fix") or airport.get("lat") is None:
        return None
    try:
        ways = pattern.with_traffic(airports.get_runways(airport.get("ident") or ident), ident, airport["lat"], airport["lon"])
    except (OSError, ValueError):
        return None
    key = pattern.end_key(end)
    return next((w for w in ways if any(pattern.end_key(e["ident"]) == key for e in w.get("runway_ends") or [])), None)


def _circuit_out(ident: str, airport: dict, end: str, toward: tuple) -> dict | None:
    """The way out by runway `end` and its upwind (wingtip.pattern.departure_circuit)."""
    runway = _field_runway(ident, airport, end)
    return pattern.departure_circuit(runway, end, toward) if runway else None


def _circuit_in(ident: str, airport: dict, end: str) -> dict | None:
    """The traffic pattern flown to land on runway `end`
    (wingtip.pattern.arrival_circuit), at the field's pattern altitude
    (field_pattern_ft) down to its elevation."""
    runway = _field_runway(ident, airport, end)
    return pattern.arrival_circuit(runway, end, field_pattern_ft(ident, airport), airport.get("elevation_ft")) if runway else None


def with_holds(r, runs: list[HopRun], outcome: Flown, held: list[vfr_holds.Hold]) -> Flown:
    """The legs with the pilot's holds flown (Asked.holds): each at its
    point, on the leg that leaves it -- at the destination, the leg into
    it -- its minutes (wingtip.holds.held_minutes) at the leg's true airspeed
    and cruise burn added to the leg's time and fuel, so the totals and the
    fuel required (14 CFR 91.151, 91.167) are the flight's with the hold.
    The leg says its hold for the map and the dry run: the entry from the
    course flown to the point (AIM 5-3-8), one turn round the racetrack in
    true degrees, and the minutes and fuel. New legs, as with_procedures'.
    With no airplane (no leg's true airspeed) a hold is not flown: its
    racetrack and fuel are an airplane's."""
    if not held or all(leg.get("tas_kt") is None for leg in outcome.legs):
        return outcome
    hops = [[dict(leg) for leg in legs] for legs in outcome.hop_legs]
    idents = [ident.upper() for ident in r.idents]
    for hold in held:
        # A stop's first, then the destination's, then the departure's: a
        # round trip's field is both ends, and a hold set at it is the
        # arrival's -- matched as the departure, its minutes and fuel went
        # on the first flight out and the last flight's fuel came up short.
        at = next((k for k, ident in enumerate(idents[:-1]) if k > 0 and ident == hold.fix and hops[k]), None)
        if at is None and idents[0] == hold.fix and idents[-1] != hold.fix and hops[0]:
            at = 0
        if at is not None:
            (k, i), fix = (at, 0), runs[at].fixes[0]
            before = hops[at - 1][-1] if at > 0 and hops[at - 1] else hops[at][0]
        elif idents[-1] == hold.fix and hops[-1]:
            (k, i), fix = (len(hops) - 1, len(hops[-1]) - 1), runs[-1].fixes[-1]
            before = hops[-1][-1]
        else:
            continue
        # Flown on the leg by the engine (navlog_hold): its minutes and fuel
        # added, its entry from the course flown to the point (AIM 5-3-8
        # j.3) and its racetrack in true degrees -- the hold's inbound
        # course is magnetic, the variation at its point east positive. A
        # leg that cannot be flown comes back as it was.
        hops[k][i] = engine(
            "navlog_hold",
            leg=hops[k][i],
            before=before,
            at_end=at is None,
            hold={
                "fix": hold.fix,
                "inbound": hold.inbound_deg,
                "right": hold.right,
                "leg_min": hold.leg_min,
                "leg_nm": hold.leg_nm,
                "turns": hold.turns,
                "minutes": hold.minutes,
            },
            fix={"lat": fix["lat"], "lon": fix["lon"]},
            variation_deg=magnetic.magnetic_variation_deg(fix["lat"], fix["lon"]),
        )
    return replace(outcome, legs=[leg for legs in hops for leg in legs], by_hop=tuple(hops) if outcome.by_hop else ())


def flown_legs(r, runs: list[HopRun], outcome: Flown, asked: Asked) -> list:
    """The legs a pilot flies, with each flight's tops of climb and
    descent placed (the engine's navlog_with_descents): from one landing to the next,
    through any waypoints, down to the pattern at the end of each --
    `own_altitudes`, a pilot's own patterns by ident -- or to an approach's first
    fix, where one is picked for the field (`drawn`, approach_end), and
    from a Start At point on where one is lower (own_altitude.marked). The
    last leg of each flight but the route's last carries the minutes on
    the ground at the stop it lands at (`ground_min`, ground_min_at), the
    figure the web times the rows after it by."""
    out, at, own, drawn, ground = [], 0, asked.own_altitudes, asked.drawn, asked.ground
    flights = r.flights
    for k, flight in enumerate(flights):
        hops = len(flight.idents) - 1
        legs = [
            leg
            for i, legs in enumerate(outcome.hop_legs[at : at + hops], start=at)
            for leg in own_altitude.marked(on_airway(legs, r.airports[i + 1]), runs[i].hop, own, asked.altitude_starts)
        ]
        fix_list = [fix for j, run in enumerate(runs[at : at + hops]) for fix in (run.fixes if j == 0 else run.fixes[1:])]
        approach = approach_end(flight, drawn or [], legs[-1]["altitude_ft"] if legs else None)
        end = approach or {"end_altitude_ft": pattern_altitude(flight, own)}
        out.extend(engine("navlog_with_descents", legs=legs, fixes=[navlog.engine_fix(f) for f in fix_list], **end))
        if out and k < len(flights) - 1:
            out[-1] = {**out[-1], "ground_min": ground_min_at(ground, flight.dest_ident)}
        at += hops
    return out


def on_airway(legs: list[dict], end: dict) -> list[dict]:
    """A hop's legs, each carrying the airway segment the hop flies, where
    it is one: the route's point it ends at holds the segment flown into it
    (app.router_basics.with_airways), and every leg of the hop is along it."""
    segment = end.get("airway")
    return [{**leg, "airway": segment} for leg in legs] if segment else legs


def _where(ident: str) -> str | None:
    fix = fixes.find_fix(ident)
    return places.describe(fix["lat"], fix["lon"]) if fix else None


def totals_of(r, runs: list[HopRun], outcome: Flown, asked: Asked) -> dict:
    """The trip's totals: each flight's own, from one landing to the next
    through any waypoints (Route.flights), with its fuel check, joined
    (wingtip.planning.route_totals). Under IFR with an alternate filed
    (Asked.alternate), the last flight's check carries the leg on to it
    (alternate_leg)."""
    per_flight, flown, at = [], [], 0
    for i, flight in enumerate(r.flights):
        hops = len(flight.idents) - 1
        legs = [leg for legs in outcome.hop_legs[at : at + hops] for leg in legs]
        flown.append((legs, runs[at].depart))
        leg_on = None
        if asked.rules == "ifr" and asked.alternate and i == len(r.flights) - 1 and legs:
            dest = {"ident": r.dest_ident, "lat": r.end[0], "lon": r.end[1]}
            leg_on = alternate_leg(dest, asked.alternate, legs[-1]["altitude_ft"], asked.profile, runs[-1].fcst_hr)
        per_flight.append(flight_totals(legs, asked.profile, flight, runs[at].depart, asked.rules, leg_on))
        at += hops
    totals = route_totals(per_flight, r.flights)
    totals["fuel_stops"] = fuel_stops_of(r, per_flight, flown)
    # The time on the ground at the stops (hop_runs), for the arrival.
    totals["ground_min"] = sum(ground_min_at(asked.ground, f.dest_ident) for f in r.flights[:-1])
    return totals


def fuel_stops_of(r, per_flight: list[dict], flown: list[tuple[list[dict], datetime | None]]) -> list[dict]:
    """Where each flight the tanks do not hold could land for fuel, at the
    owner's ask ("suggest fuel stops just like Tesla suggests"): the
    engine's navlog_fuel_stop_need says whether it needs one and the
    figures to look by -- the worst burn a mile over a tankful's stretch,
    the detour, the reserve by day or night (14 CFR 91.151(a)) -- and
    wingtip.fuelstops.suggest finds the stops that make it and other fields
    for the first. Fuel alone, at the owner's ask ("only suggest fuel stops
    in the plan, not food etc. That can be done by the pilot by tapping the
    button along the route", 2026-10-23): the map's Stops is where a meal
    or a rest is picked. None where every flight's fuel check passes, or
    where the usable fuel or the flight's figures are not known."""
    out = []
    for flight, t, (legs, depart) in zip(r.flights, per_flight, flown):
        # The engine has no clock: no departure time leaves now.
        depart = planning.now() if depart is None else depart if depart.tzinfo else depart.replace(tzinfo=timezone.utc)
        need = engine(
            "navlog_fuel_stop_need",
            totals={
                k: t.get(k)
                for k in (
                    "fuel_margin_gal",
                    "usable_fuel_gal",
                    "distance_nm",
                    "fuel_gal",
                    "ete_min",
                    "taxi_gal",
                    "reserve_gal",
                    "rules",
                    "night",
                )
            },
            legs=[{"distance_nm": leg.get("distance_nm"), "fuel_gal": leg.get("fuel_gal")} for leg in legs],
            start={"lat": flight.start[0], "lon": flight.start[1]},
            end={"lat": flight.end[0], "lon": flight.end[1]},
            depart_s=depart.timestamp(),
        )
        if need is None:
            continue
        try:
            stops, choices = fuelstops.suggest(flight.start, flight.end, **need, skip=set(r.idents))
        except (OSError, ValueError, KeyError):
            # The airport tables missing or unreadable: the fuel check
            # still says the flight is short, with no stop offered.
            log.warning("No fuel stops for %s-%s", flight.dep_ident, flight.dest_ident, exc_info=True)
            continue
        if stops:
            out.append(
                {
                    "departure": flight.dep_ident,
                    "destination": flight.dest_ident,
                    "usable_gal": need["usable_gal"],
                    "reason": "fuel",
                    "stops": [s.as_dict() for s in stops],
                    "choices": [c.as_dict() for c in choices],
                }
            )
    return out


def waited(future: Future, tick_s: float, stages: Callable[[], list]):
    """Waits on `future` for at most COMPUTE_LIMIT_S, yielding the seconds
    waited every `tick_s`; returns its result, or raises StillComputing
    naming `stages()`. The one bounded wait, which plan_within_limit runs
    quietly and the nav log's stream turns into heartbeats; the work goes
    on in the background past the limit and its answer is cached, so
    asking again gets it."""
    started = time.monotonic()
    while True:
        try:
            return future.result(timeout=tick_s)
        except FuturesTimeoutError:
            elapsed = time.monotonic() - started
            if elapsed >= COMPUTE_LIMIT_S:
                raise StillComputing(elapsed, stages()) from None
            yield elapsed


def _result(waiting):
    """A waited run to its end, reporting nothing."""
    while True:
        try:
            next(waiting)
        except StopIteration as done:
            return done.value


def running_stages(run: HopRun, asked: Asked) -> list:
    running = waiting_on(run, asked)
    return [running] if running else []


def waiting_on(run: HopRun, asked: Asked) -> str:
    """What the hop's altitude selection is still waiting on, in words; ""
    when nothing of it is running (wingtip.planning.altitude_waiting_on)."""
    return altitude_waiting_on(
        run.hop.start,
        run.hop.end,
        asked.aircraft_key,
        _fixes(run.fixes),
        run.fcst_hr,
        run.window,
        asked.class_b_clearance,
        asked.rules,
        run.hop.dest_airport.get("airway"),
    )


def plan_within_limit(
    r, asked: Asked, pick_checkpoints: Callable[[], tuple]
) -> tuple[list, list, list[HopRun], Flown | NoWinds | Unflyable]:
    """The checkpoints scored and picked (`pick_checkpoints`, the
    caller's chart reader: scored, selected and each hop's selected), each
    hop's run and the altitude chosen, all inside the one bound
    (COMPUTE_LIMIT_S), scoring included. For /api/plan and the Go / No-Go;
    the nav log streams its own, a stage line at each step."""
    runs: list[HopRun] = []

    def work():
        scored, selected, by_hop = pick_checkpoints() if asked.checkpoints else ([], [], [[] for _ in r.hops])
        runs.extend(hop_runs(r, by_hop, asked.depart, asked.profile, asked.ground, asked.holds))
        return scored, selected, join_outcomes(runs, [resolve_run(run, asked) for run in runs])

    pool = ThreadPoolExecutor(max_workers=1)
    try:
        scored, selected, outcome = _result(
            waited(
                pool.submit(work),
                COMPUTE_LIMIT_S,
                lambda: [stage for run in runs for stage in running_stages(run, asked)] if runs else ["chart"],
            )
        )
    finally:
        pool.shutdown(wait=False)
    return scored, selected, runs, outcome


def flown_as_picked(r, runs: list[HopRun], outcome: Flown, asked: Asked) -> tuple[Flown, list[dict]]:
    """The altitude chosen flown as the pilot picked it: the procedures
    and the runways (wind_picks), the holds, and each point's own
    altitude -- the plan's legs, one sequence for /api/plan, /api/navlog
    and the Go / No-Go, where the Go / No-Go's copy had missed the
    landing runways."""
    outcome = with_holds(r, runs, with_procedures(r, runs, outcome, asked.drawn, *wind_picks(r, outcome, asked)), asked.holds)
    return outcome, flown_legs(r, runs, outcome, asked)
