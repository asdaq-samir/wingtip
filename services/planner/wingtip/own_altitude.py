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
"""


def of_hop(hop, own_altitudes: dict, starts: frozenset) -> float | None:
    """The altitude the hop is flown at by a waypoint's own, or None."""
    if hop.dep_ident in starts and hop.dep_ident in own_altitudes:
        return own_altitudes[hop.dep_ident]
    if hop.lands or hop.dest_ident in starts:
        return None
    return own_altitudes.get(hop.dest_ident)


def marked(legs: list[dict], hop, own_altitudes: dict, starts: frozenset) -> list[dict]:
    """The hop's legs, the first marked `start_at` where the hop is flown
    at a Start At waypoint's own altitude (of_hop): a descent to it begins
    at the waypoint and runs on from it at three to one (the engine's
    navlog_with_descents), as its climb does (with_climbs)."""
    if legs and hop.dep_ident in starts and hop.dep_ident in own_altitudes:
        return [{**legs[0], "start_at": True}, *legs[1:]]
    return legs
