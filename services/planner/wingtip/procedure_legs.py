"""Which legs of a route are flown by the procedures picked -- out of a
field by its departure (SID), into one by its arrival (STAR) and its
approach -- or by a traffic pattern, and the ground those paths fly over.

The plan's legs are flown along these paths (wingtip.flight_plan's
with_procedures), so the floor each leg's altitude is chosen over reads the
ground under them too, where it read only the leg's own line from fix to
fix (the aviation audit's AV-2, 2026-11-14): an arrival flown out to its
first fix and round to the runway can be a hundred miles more than the leg
(C81 to O'Hare by BENKY6, 2026-10-19), over ground the leg never crossed.
"""

from __future__ import annotations

from . import procedure_paths
from .engine import ask as engine


def bare_field(ident: str) -> str:
    """A field's FAA ident: the CIFP names it by its ICAO ident (KDLH)
    where the route may have the FAA's (DLH), as lib/procedures' sameField:
    the engine's (wingtip_engine::route::points)."""
    return engine("bare_field", ident=ident)


def picked(drawn: list[tuple[str, dict]], kind: str, field_: str) -> dict | None:
    """The procedure of `kind` picked at `field_`, drawn, if one is."""
    return next((d for ident, d in drawn if d.get("kind") == kind and bare_field(ident) == bare_field(field_.upper())), None)


def legs_flown_by(r, legs_a_hop: list[int], drawn: list, runways: dict[str, str], landings: dict[str, str]):
    """Each leg flown by procedures or a pattern, as (hop, leg, flight,
    [departure, arrival, approach], leaves_by, lands_on): a flight's first
    leg out of its field by the departure picked there, or with none by
    the runway picked to leave from (`runways`, leaves_by); its last into
    the field it lands at by the arrival and the approach picked there, or
    with no approach by the runway picked to land on (`landings`,
    lands_on). One leg can be all of them. `legs_a_hop`, each hop's number
    of legs."""
    at = 0
    for flight in r.flights:
        n = len(flight.idents) - 1
        by: dict[tuple[int, int], list] = {}
        dep_field, dest_field = bare_field(flight.dep_ident.upper()), bare_field(flight.dest_ident.upper())
        departure = picked(drawn, "departure", flight.dep_ident) if flight.takes_off else None
        leaves_by = runways.get(dep_field) if flight.takes_off and not departure else None
        if (departure or leaves_by) and legs_a_hop[at]:
            by.setdefault((at, 0), [None, None, None])[0] = departure
        arrival = picked(drawn, "arrival", flight.dest_ident) if flight.lands else None
        approach = picked(drawn, "approach", flight.dest_ident) if flight.lands else None
        lands_on = landings.get(dest_field) if flight.lands and not approach else None
        if (arrival or approach or lands_on) and legs_a_hop[at + n - 1]:
            by.setdefault((at + n - 1, legs_a_hop[at + n - 1] - 1), [None, None, None])[1:3] = [arrival, approach]
        for (hop, i), picks in by.items():
            first, last = hop == at and i == 0, hop == at + n - 1 and i == legs_a_hop[hop] - 1
            yield hop, i, flight, picks, leaves_by if first else None, lands_on if last else None
        at += n


def paths_by_hop(r, runs: list, drawn: list, runways: dict[str, str]) -> list[tuple]:
    """Each hop's legs flown by a departure, an arrival or an approach, as
    ((leg, path's (lat, lon) points), ...) for its floor: the paths
    wingtip.procedure_paths.flown draws, before the altitude is chosen. A
    departure by its transition for the runway the pilot picked to leave
    from (`runways`, Asked.leave_runways); one the page picks into the wind
    comes after the altitude and is not known yet, and a transition differs
    only near the field, whose ground the leg reads anyway. The traffic
    patterns are left out: they are flown at the field, over its own
    ground, at pattern altitude, not the cruise."""
    out: list[list] = [[] for _ in runs]
    legs_a_hop = [len(run.fixes) - 1 for run in runs]
    for hop, i, flight, picks, _, _ in legs_flown_by(r, legs_a_hop, drawn, runways, {}):
        if not any(picks):
            continue
        a, b = runs[hop].fixes[i], runs[hop].fixes[i + 1]
        runway = runways.get(bare_field(flight.dep_ident.upper())) if picks[0] else None
        path = procedure_paths.flown((a["lat"], a["lon"]), (b["lat"], b["lon"]), *picks, runway=runway)
        if path:
            points = [tuple(p) for p in path["path"]]
            out[hop].append((i, tuple(p for k, p in enumerate(points) if k == 0 or p != points[k - 1])))
    return [tuple(paths) for paths in out]


def floors_along(floors: list, paths: tuple, read) -> list:
    """The legs' floors (`floors`, one a leg) with each leg flown along a
    procedure's path (`paths`, paths_by_hop's) floored over that path too:
    the floors under its pieces read as the leg's own are (`read`, a
    path's points to one floor a piece) and the highest kept, the engine's
    floor_along_path (14 CFR 91.119 under VFR, 91.177(a)(2) under IFR)."""
    if not floors or not paths:
        return floors
    out = list(floors)
    for leg, points in paths:
        if 0 <= leg < len(out):
            out[leg] = engine("floor_along_path", floors=[out[leg], *read(list(points))])
    return out
