"""A waypoint's own altitude, Cross At or Start At (the profile's per-leg
altitude, the owner's pick of 2026-11-10; the web's and the phones'
`altitudes` and `altitude_starts`).

Cross At, the default, is done by the waypoint: the hop into it is flown
at its altitude. Start At begins at the waypoint: the hop out of it is
flown at its altitude, so the climb starts there (the engine's with_climbs
climbs from a hop's start; altitude_change places it for the apps'
profiles), and the hop into it is flown as planned. A Start At hop may
land: the nav log's descent to the pattern comes after it. A Start At
descent begins at the waypoint too: the hop's first leg is marked
`start_at` for the engine's navlog_with_descents (marked), which would
otherwise have it done by the waypoint. An airport's own altitude is its
pattern, never a hop's (flight_plan.pattern_altitude).

A point flown more than once (out to a VOR and back over it, a round trip
through a fix) has an altitude of its own at each visit: "VPBNG@2:4500"
is the second time the route is at VPBNG, its visit (visits), where a
bare "VPBNG:4500" is every visit, as the parameter was before it was
kept by visit (the web audit's WEB-2, 2026-11-14). A visit's own comes
before the bare one. Counted by visit, not by the point's place in the
route: the planner adds an airway's fixes to the route, and a stop added
before the point would move every place after it.
"""


def visits(idents) -> list[int]:
    """Each point's visit, 1 the first time the route is at it."""
    seen: dict[str, int] = {}
    out = []
    for ident in idents:
        seen[ident] = seen.get(ident, 0) + 1
        out.append(seen[ident])
    return out


def own_at(own: dict, ident: str, visit: int) -> float | None:
    """The altitude of the point `ident` at its `visit`: the visit's own,
    else the point's."""
    return own.get(f"{ident}@{visit}", own.get(ident))


def starts_at(starts: frozenset, ident: str, visit: int) -> bool:
    """Whether the point at its `visit` is a Start At one."""
    return f"{ident}@{visit}" in starts or ident in starts


def of_hop(hop, own_altitudes: dict, starts: frozenset, at: tuple = (1, 1)) -> float | None:
    """The altitude the hop is flown at by a waypoint's own, or None. `at`,
    the visits of the hop's two ends (visits)."""
    out_of = own_at(own_altitudes, hop.dep_ident, at[0])
    if starts_at(starts, hop.dep_ident, at[0]) and out_of is not None:
        return out_of
    if hop.lands or starts_at(starts, hop.dest_ident, at[1]):
        return None
    return own_at(own_altitudes, hop.dest_ident, at[1])


def marked(legs: list[dict], hop, own_altitudes: dict, starts: frozenset, at: tuple = (1, 1)) -> list[dict]:
    """The hop's legs, the first marked `start_at` where the hop is flown
    at a Start At waypoint's own altitude (of_hop): a descent to it begins
    at the waypoint and runs on from it at three to one (the engine's
    navlog_with_descents), as its climb does (with_climbs)."""
    if legs and starts_at(starts, hop.dep_ident, at[0]) and own_at(own_altitudes, hop.dep_ident, at[0]) is not None:
        return [{**legs[0], "start_at": True}, *legs[1:]]
    return legs
