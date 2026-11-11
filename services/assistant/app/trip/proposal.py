"""The trip proposal built from the planner's own figures (app.trip.tools'
propose_trip): each leg checked as a typed route is (GET /api/route-check),
planned as the nav log plans it (GET /api/plan: the altitude, the
distance, the time, the fuel and the cautions), its airspace read (GET
/api/route-profile) and its departure set in the go window the planner
found; then the pilot's constraints checked against those figures -- a
deadline, a Class B to keep out of, a fuel price -- each one not met said
in plain words. Warn, never limit (docs/decisions/0008): a constraint not
met is said, and the plan is still proposed for the pilot to judge."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from ..generated import planner_client as planner
from .schemas import TripChange, TripLeg, TripProposal, TripWindow

if TYPE_CHECKING:
    from .tools import TripToolbox

#: The price question's answer: the app reads no fuel price feed (the
#: market-gap check, 2026-11-09: pump prices come from AirNav's and
#: ForeFlight's FBO data, which the app does not have).
NO_PRICES = "The app has no fuel prices: no fuel price feed is read, so a price limit cannot be applied."


def local_or_utc(text: str | None, zone: ZoneInfo) -> datetime | None:
    """An ISO time: one with an offset as given, one without on the pilot's clock."""
    if not text:
        return None
    when = datetime.fromisoformat(text.strip().replace("Z", "+00:00"))
    return when if when.tzinfo else when.replace(tzinfo=zone)


def utc(when: datetime) -> str:
    return when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _feet(ft: float | None) -> str:
    return "the surface" if not ft else f"{ft:,.0f} ft"


def airspace(dep: str, dest: str, stops: str, aircraft: str) -> dict:
    """The Class B, C and D a route passes ({"passes": [words], "class_b":
    [names]}), and where it enters a Class B, the waypoints the planner
    finds round it (its plan with the clearance, class_b_detours)."""
    profile = planner.route_profile(dep=dep, dest=dest, stops=stops or None)
    passes, class_b = [], []
    for a in profile.airspace or []:
        passes.append(f"{a.name} (Class {a.class_}), {_feet(a.floor_ft)} to {_feet(a.ceiling_ft)}, {a.from_nm:g} to {a.to_nm:g} nm along")
        if a.class_ == "B" and a.name not in class_b:
            class_b.append(a.name)
    detours = []
    if class_b:
        cleared = planner.plan(dep=dep, dest=dest, stops=stops or None, aircraft=aircraft or None, class_b_clearance=True)
        detours = [
            {"ident": d.ident, "via": d.via, "added_nm": d.added_nm, "description": d.description} for d in cleared.class_b_detours or []
        ]
    return {"passes": passes, "class_b": class_b, "detours": detours}


def _window(box: TripToolbox, dep: str, dest: str, when: datetime) -> TripWindow | None:
    """The go window, of those the planner found for the route, the
    departure hour is in."""
    for w in box.windows.get((dep, dest), []):
        if w.start and w.last and w.start <= when <= w.last + timedelta(minutes=59):
            return TripWindow(start=utc(w.start), last=utc(w.last), hours=w.hours or 0)
    return None


def leg(box: TripToolbox, kind: str, dep: str, dest: str, stops: str, altitude_ft: float | None, depart: str) -> TripLeg:
    c = box.context
    when = local_or_utc(depart, box.zone)
    if when is None:
        raise ValueError(f"the {kind} leg has no departure time")
    dep, dest = dep.strip().upper(), dest.strip().upper()
    checked = planner.route_check(dep=dep, dest=dest, stops=stops)
    route = list(checked.stops or [])
    planned = planner.plan(
        dep=dep,
        dest=dest,
        stops=",".join(route) or None,
        aircraft=c.aircraft or None,
        altitude_ft=altitude_ft,
        depart=utc(when),
        rules=c.rules,
    )  # type: ignore[arg-type]
    totals = planned.totals
    ete = totals.ete_min if totals else None
    # The arrival is the departure and the nav log's ETE (with the stops'
    # time on the ground, which the totals carry): the planner's figure.
    arrive = when + timedelta(minutes=ete + (totals.ground_min or 0)) if ete is not None and totals else None
    plan_id = f"plan:{dep}-{dest}" + (f"-{'-'.join(route)}" if route else "")
    box.source(
        plan_id,
        f"The plan {dep} to {dest}" + (f" via {','.join(route)}" if route else ""),
        f"{totals and totals.distance_nm} nm, {ete} min, {totals and totals.fuel_gal} gal at {planned.altitude_ft} ft, leaving {utc(when)}",
    )
    passes = airspace(dep, dest, ",".join(route), c.aircraft)
    cautions = [f"{x.from_ident}-{x.to_ident}: {'; '.join(x.reasons or [])}" for x in planned.altitude_cautions or [] if x.reasons]
    sources = [plan_id] + ([f"window:{dep}-{dest}"] if (dep, dest) in box.windows else [])
    return TripLeg(
        kind=kind,
        change=TripChange(dep=dep, dest=dest, stops=route, altitude_ft=planned.altitude_ft, depart=utc(when)),
        altitude_ft=planned.altitude_ft,
        distance_nm=totals and totals.distance_nm,
        ete_min=ete,
        fuel_gal=totals and totals.fuel_gal,
        arrive=arrive and utc(arrive),
        depart_local=box.local(when) or "",
        arrive_local=box.local(arrive),
        window=_window(box, dep, dest, when),
        airspace=passes["passes"],
        cautions=cautions,
        sources=sources,
    )


def build(
    box: TripToolbox,
    dep: str,
    dest: str,
    depart: str,
    stops: str,
    altitude_ft: float | None,
    return_depart: str | None,
    return_stops: str,
    return_altitude_ft: float | None,
    back_by: str | None,
    avoid_class_b: bool,
    max_fuel_price: float | None,
    why: str,
    unmet: list[str],
) -> TripProposal:
    """The proposal, its legs planned and the pilot's constraints checked
    against their figures; each one not met said, the model's first."""
    legs = [leg(box, "outbound", dep, dest, stops, altitude_ft, depart)]
    if return_depart:
        legs.append(leg(box, "return", dest, dep, return_stops, return_altitude_ft, return_depart))
    notes = [u.strip() for u in unmet if u.strip()]
    deadline = local_or_utc(back_by, box.zone)
    last = legs[-1]
    if deadline and last.arrive and datetime.fromisoformat(last.arrive.replace("Z", "+00:00")) > deadline:
        notes.append(f"The {last.kind} leg lands {last.arrive_local}, after {box.local(deadline)}.")
    if avoid_class_b:
        for one in legs:
            inside = [a.split(" (Class B)")[0] for a in one.airspace if "(Class B)" in a]
            if inside:
                notes.append(f"The {one.kind} leg still passes through the {', '.join(inside)}; plan under or round it.")
    if max_fuel_price is not None:
        notes.append(NO_PRICES)
    for one in legs:
        if one.window is None and (one.change.dep, one.change.dest) in box.windows:
            notes.append(f"The {one.kind} leg leaves outside the go hours the forecasts give.")
    return TripProposal(legs=legs, rationale=why.strip(), unmet=list(dict.fromkeys(notes)))
