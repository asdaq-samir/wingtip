"""The nav log as a stream (/api/navlog): altitude and the dead-reckoning
legs as newline-delimited JSON, the slow half of the plan, asked for
beside the course and the checkpoints so none of it delays the chart.
The flight is put together by wingtip.flight_plan, as app.routers.plan's
whole plan is; this module answers one line at a time."""

from concurrent.futures import ThreadPoolExecutor
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from wingtip import flight_plan as fp

from .. import fuel_replan
from ..router_basics import line, load_route, ndjson
from ..schemas.nav_log import NavLogAltitude, NavLogDone, NavLogError, NavLogLeg, NavLogStage
from ..checkpoint_scoring import route_checkpoints
from ..plan_query import PlanQuery
from ..gateway import PUBLIC
from ..plan_dependencies import read_ahead

router = APIRouter()

# How often the nav log stream says it is still working while the
# altitude plans are being made.
HEARTBEAT_S = 8


@router.get("/api/navlog", dependencies=[Depends(read_ahead)], openapi_extra=PUBLIC)
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
                    detail=why["title"], brief=why["brief"], reasons=why["reasons"], advice=why["advice"], retry=False, detours=detours
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
                detours=fp.detours_of(runs, outcome, asked),
                altitude_figures=list(outcome.figures),
            )
        )
        outcome, legs = fp.flown_as_picked(r, runs, outcome, asked)
        for leg in legs:
            yield line(NavLogLeg.model_validate(leg))

        totals = fp.totals_of(r, runs, outcome, asked)
        # Its fuel stops checked by planning the route with them in
        # (app.fuel_replan), which takes a plan or more: said, so the line
        # is not silent meanwhile.
        if totals.get("fuel_stops"):
            yield line(NavLogStage(detail="Checking fuel stops…"))
            totals = fuel_replan.checked(q, asked, totals)
        yield line(NavLogDone(totals=totals))

    return ndjson(lines(), NavLogError)
