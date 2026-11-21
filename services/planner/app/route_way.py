"""A route that goes somewhere, for the plan and the nav log."""

from fastapi import HTTPException

from .router_basics import SAME_PLACE_NM, Route, load_route


def load_way(dep: str, dest: str, stops: str | list | None = None) -> Route:
    """load_route for a route that goes somewhere. A departure that is its
    own destination with no stop between (C81 to C81, or KOSH to OSH, one
    field by two of its idents) is a local flight, which /api/local-flight
    plans by its time aloft: as a route it is one hop of no length, which
    the altitude plans divided by (as RFD to KRFD did, 2026-10-07). A 422
    that says so, not a route of nothing."""
    r = load_route(dep, dest, stops)
    if len(r.idents) == 2 and r.length_nm < SAME_PLACE_NM:
        raise HTTPException(
            422,
            f"{r.idents[0]} and {r.idents[1]} are the same place: a local flight has no route to plan. Add a stop for a round trip.",
        )
    return r
