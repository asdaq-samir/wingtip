"""Each hop's altitude decided: the altitude plan the engine picks for a
hop, a flight's hops made as runs and each run resolved to what it flies
(or why it cannot), and the hops' outcomes joined into the flight's."""

from __future__ import annotations

import logging
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from . import navlog, own_altitude
from . import holds as vfr_holds
from .engine import ask as engine
from .procedure_legs import paths_by_hop
from .planning import (
    altitude_anyway,
    altitude_plans,
    cruise_altitude,
    flight_window,
    join_selections,
    own_altitude_caution,
    prohibited_caution,
    winds_key_for,
)
from .weather import WeatherServiceError

from .flight_outcomes import Asked, Flown, HopRun, NoWinds, Unflyable, departure_elevation, ground_min_at

log = logging.getLogger(__name__)


def resolve_altitude(
    r,
    fix_list: list,
    profile: dict | None,
    aircraft: str,
    altitude_ft: float | None,
    choice: str,
    fcst_hr: str = "06",
    window: tuple | None = None,
    rules: str = "vfr",
    nearest: bool = False,
    paths: tuple = (),
) -> Flown | Unflyable | NoWinds:
    """What the log flies, decided once for /api/plan and /api/navlog
    alike. `fcst_hr` is the winds key for the departure (see
    winds_key_for), `window` the flight's own hours the go/no-go
    forecast is read over (see flight_window).

    The four plans are made beside a pilot's own altitude as well, as
    what the planner would have flown. With `nearest` (the wheel's pick)
    the altitude is flown where each leg may fly it, else at that leg's
    nearest legal one: the figures the wheel showed for it, and no leg
    under its floor or on the wrong thousands for its course. `paths`,
    the legs flown along a procedure's path (HopRun.paths)."""
    selection = cruise_altitude(
        r.start,
        r.end,
        profile,
        aircraft,
        fixes=_fixes(fix_list),
        fcst_hr=fcst_hr,
        window=window,
        rules=rules,
        airway=r.dest_airport.get("airway"),
        paths=paths,
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
    # No airplane, no fastest or economical plan; no climb fuel flow, no
    # economical one (the engine's navlog_plans): else the lowest is flown.
    choice = choice if choice in plans else "lowest"
    legs = plans[choice]["legs"]
    return Flown(selection, options, choice, legs[0]["altitude_ft"], legs, figures=figures)


def _fixes(fix_list: list) -> list:
    return [(f["lat"], f["lon"]) for f in fix_list]


def hop_runs(
    r,
    by_hop: list,
    depart: datetime | None,
    profile: dict | None,
    ground: dict[str, float] | None = None,
    held: list[vfr_holds.Hold] | None = None,
    drawn: list | None = None,
    leave_runways: dict[str, str] | None = None,
) -> list[HopRun]:
    """Each hop of `r` ready to plan, `by_hop` its selected checkpoints.
    A hop after the first is flown when the ones before it are done, at
    cruise speed, and after the time on the ground at each stop it lands
    at (`ground`, by ident, else TURNAROUND_MIN) -- an estimate, to the
    hour its winds and forecast are read for. The first is the route's
    own: a route without stops is planned exactly as it always was. A
    hold (`held`) is flown on the hop leaving its point, so the hops after
    it leave the later by its minutes (as with_holds puts them there); a
    round trip's field is held at on arrival, after the last hop. The
    procedures picked (`drawn`, Asked.drawn; `leave_runways`) give each
    hop the paths its floor is read under (HopRun.paths).

    With no airplane (`profile` None) no flight's time is known: every hop
    is read for the departure's hour, and the holds add nothing."""
    ground = ground or {}
    runs, elapsed_h = [], 0.0
    tas = max(profile["cruise_tas_kt"], 1.0) if profile else None
    idents = [ident.upper() for ident in r.idents]
    seen = own_altitude.visits(idents)
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
                visits=(seen[i], seen[i + 1]),
            )
        )
        if tas is None:
            continue
        elapsed_h += hop.length_nm / tas + holding.get(hop.dep_ident.upper(), 0.0) / 60
        if hop.lands and i < len(r.hops) - 1:
            elapsed_h += ground_min_at(ground, hop.dest_ident) / 60
    if not drawn:
        return runs
    return [replace(run, paths=paths) for run, paths in zip(runs, paths_by_hop(r, runs, drawn, leave_runways or {}))]


def resolve_run(run: HopRun, asked: Asked) -> Flown | Unflyable | NoWinds:
    """One hop's altitude and legs (resolve_altitude), as asked."""
    own = own_altitude.of_hop(run.hop, asked.own_altitudes, asked.altitude_starts, run.visits)  # a waypoint's own
    return resolve_altitude(
        run.hop,
        run.fixes,
        asked.profile,
        asked.aircraft_key,
        asked.altitude_ft if own is None else own,
        asked.altitude_choice,
        run.fcst_hr,
        run.window,
        asked.rules,
        nearest=asked.altitude_nearest and own is None,
        paths=run.paths,
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
