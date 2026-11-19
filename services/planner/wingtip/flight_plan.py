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

import time
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError

# The parts of a flight each have a module of their own; this one runs them
# under the time limit, and the planner's callers ask for all of them here.
from .flight_detours import detours_of, terrain_way, unflyable_parts  # noqa: F401
from .flight_hops import _fixes, hop_runs, join_figures, join_outcomes, resolve_altitude, resolve_run  # noqa: F401
from .flight_legs import flown_legs, fuel_stops_of, on_airway, totals_of, with_holds  # noqa: F401
from .flight_outcomes import Asked, Flown, HopRun, NoWinds, Unflyable
from .flight_procedures import field_pattern_ft, wind_picks, with_procedures  # noqa: F401
from .planning import COMPUTE_LIMIT_S, StillComputing, altitude_waiting_on


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
        asked.rules,
        run.hop.dest_airport.get("airway"),
        run.paths,
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
        runs.extend(hop_runs(r, by_hop, asked.depart, asked.profile, asked.ground, asked.holds, asked.drawn, asked.leave_runways))
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
