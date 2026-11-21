"""The fuel stops a plan suggests, checked by planning the route again with
them in (wingtip.fuel_rounds), for /api/plan and /api/navlog: the route
through the stops is the pilot's own query with its stops changed, planned
as the page will plan it once they are in -- the same altitude choice,
departure, airplane, tanks, holds and checkpoints -- so a stop offered is
one whose flights pass, and every app adds them in one step."""

import logging

from fastapi import HTTPException
from wingtip import flight_plan as fp
from wingtip import fuel_rounds
from wingtip.flight_outcomes import Asked
from wingtip.planning import StillComputing

from .checkpoint_scoring import route_checkpoints
from .plan_query import PlanQuery
from .router_basics import MAX_STOPS, load_route, stops_of

log = logging.getLogger(__name__)


def replanned(q: PlanQuery, asked: Asked, stops: list[str]) -> dict | None:
    """The totals of the query's route through `stops`, its own fuel stops
    suggested, as the first plan's were; None where it cannot be planned
    (not a route, no altitude, no winds, past the time limit, or the data
    it reads missing): the check is the plan's addition, and its failing
    leaves the stops offered unchecked, never the plan unanswered."""
    try:
        r = load_route(q.dep, q.dest, stops)
        _, _, runs, outcome = fp.plan_within_limit(r, asked, lambda: route_checkpoints(r))
        if not isinstance(outcome, fp.Flown):
            return None
        outcome, _ = fp.flown_as_picked(r, runs, outcome, asked)
        return fp.totals_of(r, runs, outcome, asked)
    except (HTTPException, StillComputing, LookupError, ValueError, OSError):
        log.warning("Fuel stops not checked for %s-%s via %s", q.dep, q.dest, ",".join(stops), exc_info=True)
        return None


def checked(q: PlanQuery, asked: Asked, totals: dict) -> dict:
    """The totals with their fuel stops checked (fuel_rounds.converged): each
    flight's with every stop its flights need, and whether they pass."""
    suggested = totals.get("fuel_stops") or []
    if not suggested:
        return totals
    stops = fuel_rounds.converged(q.dep, stops_of(q.stops), q.dest, suggested, lambda s: replanned(q, asked, s), MAX_STOPS)
    return {**totals, "fuel_stops": stops}
