"""Whose rules the route is under and the Air Defense Identification
Zones it meets, worked out once with the course (/api/course) so the web
app's module no longer carries the countries' outlines (the engine's
route_jurisdiction and route_adiz, Natural Earth's 1:50m countries and
14 CFR 99.41-99.49's zones; round 5's WebAssembly cuts). The rules are
the engine's; here they are asked of the route's own points, departure,
stops and destination, each leg between two checked every 2 nm, and the
answers set on the course: each point's warning and the warning of the leg
that leaves it, and the Brief's one line for each. Warn, never limit
(decision 0053): every figure is still by the FAA's rules."""

from wingtip.engine import ask as engine


def borders(points: list[dict]) -> tuple[list[dict], dict | None, dict | None]:
    """The route's points, each with its own warning outside the United
    States (`outside_caution`, 14 CFR 1.1 and 91.703(a)) and the leg's on
    from it (`leg_caution`), and the Brief's lines: outside the United
    States, and the ADIZs met (14 CFR part 99), each None where none."""
    if not points:
        return points, None, None
    named = [{"lat": p["lat"], "lon": p["lon"], "name": p["ident"]} for p in points]
    where = engine("route_jurisdiction", points=named)
    zones = engine("route_adiz", points=[{"lat": p["lat"], "lon": p["lon"]} for p in points])
    legs = where["legs"]
    marked = [
        {**p, "outside_caution": at["caution"], "leg_caution": legs[i]["caution"] if i < len(legs) else None}
        for i, (p, at) in enumerate(zip(points, where["points"]))
    ]
    return marked, where["brief"], zones["brief"]
