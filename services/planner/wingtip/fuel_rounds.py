"""Add Fuel Stops' stops, checked before they are offered: the stops a
flight's fuel check suggests (wingtip.flight_legs.fuel_stops_of) are
chosen on the flight's figures as one flight, but once they are in, each
flight between two of them is planned on its own -- its own altitude,
winds and burn -- and that is the real check (14 CFR 91.151(a),
91.167(a)): the owner's KDSM to KCBK, at 6,500 ft into the wind, burnt
0.107 gal/nm where the one flight at 14,500 ft burnt 0.080, and landed
3 gal short (2026-11-20). So the route is planned again with the stops in,
and the stops those plans suggest put in too, until no flight is short or
ROUNDS plans have been made; each suggestion then carries every stop its
flight needs, in order, and whether the flights through them pass.

The web asked for each round from the browser (useSuggestedStops'
FUEL_ROUNDS, the simplicity audit of 2026-11-21, finding 3); here it is one
request for every app. The plans are the caller's (`replan`, the route's
address stops in, its totals out, None where it could not be planned):
wingtip knows nothing of the service's routes."""

from __future__ import annotations

from collections.abc import Callable

from .engine import ask as engine

#: The plans made after the first, at most: the owner's trip took two (its
#: first plan and two of the route with stops in, 2026-11-20). A bound, so
#: a route whose stops keep moving is never planned for ever.
ROUNDS = 3


def _same(a: str, b: str) -> bool:
    """Whether two idents are one field (the engine's same_field: KDSM and DSM)."""
    return bool(engine("same_field", a=a, b=b))


def _fuel(suggested: list[dict] | None) -> list[dict]:
    """The suggestions for fuel, those this checks: a break is the pilot's."""
    return [f for f in suggested or [] if f.get("reason", "fuel") == "fuel" and f.get("stops")]


def with_fuel_stops(dep: str, stops: list[str], suggested: list[dict], max_stops: int) -> tuple[list[str], list[str]] | None:
    """The route's stops with each flight's suggested stops put in after its
    own departure, as many as the route takes (`max_stops`), and those that
    went in; a field already in the route is not put in twice. None where
    none goes in. As the web's withFuelStops puts them in for the pilot."""
    route, added = list(stops), []
    for flight in suggested:
        idents = [s["ident"] for s in flight["stops"]]
        idents = [i for i in idents if not _same(i, dep) and not any(_same(s, i) for s in route)]
        room = max_stops - len(route)
        if room <= 0 or not idents:
            continue
        after = flight["departure"]
        at = 0 if _same(dep, after) else next((k + 1 for k, s in enumerate(route) if _same(s, after)), len(route))
        put = idents[:room]
        route[at:at] = put
        added.extend(put)
    return (route, added) if added else None


def _flights_of(totals: dict) -> list[dict]:
    """Each flight of a plan, its two ends and its totals: a route with no
    landing on the way is its one flight."""
    return totals.get("hops") or [{"departure": None, "destination": None, "totals": totals}]


def _between(points: list[str], departure: str, destination: str) -> tuple[int, int]:
    """Where a flight's two ends are among the route's points: its
    departure's first place, its destination's first after it."""
    start = next((k for k, p in enumerate(points) if _same(p, departure)), 0)
    end = next((k for k in range(start + 1, len(points)) if _same(points[k], destination)), len(points) - 1)
    return start, end


def _checked(flight: dict, points: list[str], added: list[str], found: dict[str, dict], plan: dict | None) -> dict:
    """One flight's suggestion with every stop it needs, in order, and
    whether the flights through them pass in the last plan (`passes`) or
    which is still short (`short`): no field in reach, or the rounds run
    out. Each stop's figures are that plan's where it was made -- the miles
    and minutes from the flight's departure, the fuel landed with -- as the
    stops' own were worked out on a flight that is no longer flown."""
    start, end = _between(points, flight["departure"], flight["destination"])
    idents = [p for p in points[start + 1 : end] if any(_same(p, a) for a in added)]
    stops = [dict(found[i]) for i in idents if i in found]
    passes, short = plan is not None, None
    if plan is not None:
        miles = minutes = 0.0
        legs = [h for h in _flights_of(plan) if h["departure"] is not None]
        on = [h for h in legs if any(_same(h["departure"], p) for p in points[start:end])]
        for hop in on:
            t = hop["totals"]
            miles += t.get("distance_nm") or 0.0
            minutes += t.get("ete_min") or 0.0
            stop = next((s for s in stops if _same(s["ident"], hop["destination"])), None)
            if stop is not None and t.get("lands_with_gal") is not None:
                stop.update(from_nm=round(miles, 1), minutes=round(minutes, 1), lands_with_gal=t["lands_with_gal"])
            if (t.get("fuel_margin_gal") or 0.0) < 0 and short is None:
                short = {"departure": hop["departure"], "destination": hop["destination"]}
        passes = short is None
    return {**flight, "stops": stops, "passes": passes, "short": short}


def converged(
    dep: str, stops: list[str], dest: str, suggested: list[dict], replan: Callable[[list[str]], dict | None], max_stops: int
) -> list[dict]:
    """Each flight's suggested stops with every stop the flights through
    them need too, planned again till none is short (ROUNDS): one step for
    the pilot's Add Fuel Stops. A suggestion's `passes` says the last plan
    of the route with its stops in has none of its flights short; where
    one is (no field in reach, the rounds run out, no room for another
    stop, or the plan could not be made), `short` names it, or `passes` is
    false with no plan to say. A break is left as it came."""
    first = _fuel(suggested)
    if not first:
        return suggested
    found = {s["ident"]: s for f in first for s in f["stops"]}
    route, added, plan, pending = list(stops), [], None, first
    for _ in range(ROUNDS):
        nxt = with_fuel_stops(dep, route, pending, max_stops)
        if nxt is None:
            break
        tried, put = nxt
        made = replan(tried)
        if made is None:
            # Not planned: the stops of the plans made stand, unchecked.
            route, added = tried, added + put
            plan = None
            break
        route, added, plan = tried, added + put, made
        pending = _fuel(made.get("fuel_stops"))
        found.update({s["ident"]: s for f in pending for s in f["stops"] if s["ident"] not in found})
        if not pending:
            break
    points = [dep, *route, dest]
    out = [_checked(f, points, added, found, plan) for f in first]
    return [*out, *(f for f in suggested if f not in first)]
