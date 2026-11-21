"""A flight's legs finished and added up: the pilot's holds put in,
the legs flown as picked with their tops of climb and descent, the
totals, and the fuel stops the flight needs."""

from __future__ import annotations

import logging
from dataclasses import replace
from datetime import datetime, timezone

from . import fuelstops, magnetic, navlog, own_altitude, planning
from . import holds as vfr_holds
from .engine import ask as engine
from .planning import alternate_leg, flight_totals, route_totals

from .flight_outcomes import Asked, Flown, HopRun, ground_min_at
from .flight_procedures import approach_end, pattern_altitude

log = logging.getLogger(__name__)


def with_holds(r, runs: list[HopRun], outcome: Flown, held: list[vfr_holds.Hold]) -> Flown:
    """The legs with the pilot's holds flown (Asked.holds): each at its
    point, on the leg that leaves it -- at the destination, the leg into
    it -- its minutes (wingtip.holds.held_minutes) at the leg's true airspeed
    and cruise burn added to the leg's time and fuel, so the totals and the
    fuel required (14 CFR 91.151, 91.167) are the flight's with the hold.
    The leg says its hold for the map and the dry run: the entry from the
    course flown to the point (AIM 5-3-8), one turn round the racetrack in
    true degrees, and the minutes and fuel. New legs, as with_procedures'.
    With no airplane (no leg's true airspeed) a hold is not flown: its
    racetrack and fuel are an airplane's."""
    if not held or all(leg.get("tas_kt") is None for leg in outcome.legs):
        return outcome
    hops = [[dict(leg) for leg in legs] for legs in outcome.hop_legs]
    idents = [ident.upper() for ident in r.idents]
    for hold in held:
        # A stop's first, then the destination's, then the departure's: a
        # round trip's field is both ends, and a hold set at it is the
        # arrival's -- matched as the departure, its minutes and fuel went
        # on the first flight out and the last flight's fuel came up short.
        at = next((k for k, ident in enumerate(idents[:-1]) if k > 0 and ident == hold.fix and hops[k]), None)
        if at is None and idents[0] == hold.fix and idents[-1] != hold.fix and hops[0]:
            at = 0
        if at is not None:
            (k, i), fix = (at, 0), runs[at].fixes[0]
            before = hops[at - 1][-1] if at > 0 and hops[at - 1] else hops[at][0]
        elif idents[-1] == hold.fix and hops[-1]:
            (k, i), fix = (len(hops) - 1, len(hops[-1]) - 1), runs[-1].fixes[-1]
            before = hops[-1][-1]
        else:
            continue
        # Flown on the leg by the engine (navlog_hold): its minutes and fuel
        # added, its entry from the course flown to the point (AIM 5-3-8
        # j.3) and its racetrack in true degrees -- the hold's inbound
        # course is magnetic, the variation at its point east positive. A
        # leg that cannot be flown comes back as it was.
        hops[k][i] = engine(
            "navlog_hold",
            leg=hops[k][i],
            before=before,
            at_end=at is None,
            hold={
                "fix": hold.fix,
                "inbound": hold.inbound_deg,
                "right": hold.right,
                "leg_min": hold.leg_min,
                "leg_nm": hold.leg_nm,
                "turns": hold.turns,
                "minutes": hold.minutes,
            },
            fix={"lat": fix["lat"], "lon": fix["lon"]},
            variation_deg=magnetic.magnetic_variation_deg(fix["lat"], fix["lon"]),
        )
    return replace(outcome, legs=[leg for legs in hops for leg in legs], by_hop=tuple(hops) if outcome.by_hop else ())


def flown_legs(r, runs: list[HopRun], outcome: Flown, asked: Asked) -> list:
    """The legs a pilot flies, with each flight's tops of climb and
    descent placed (the engine's navlog_with_descents): from one landing to the next,
    through any waypoints, down to the pattern at the end of each --
    `own_altitudes`, a pilot's own patterns by ident -- or to an approach's first
    fix, where one is picked for the field (`drawn`, approach_end), and
    from a Start At point on where one is lower (own_altitude.marked). The
    last leg of each flight but the route's last carries the minutes on
    the ground at the stop it lands at (`ground_min`, ground_min_at), the
    figure the web times the rows after it by."""
    out, at, own, drawn, ground = [], 0, asked.own_altitudes, asked.drawn, asked.ground
    flights = r.flights
    for k, flight in enumerate(flights):
        hops = len(flight.idents) - 1
        legs = [
            leg
            for i, legs in enumerate(outcome.hop_legs[at : at + hops], start=at)
            for leg in own_altitude.marked(on_airway(legs, r.airports[i + 1]), runs[i].hop, own, asked.altitude_starts, runs[i].visits)
        ]
        fix_list = [fix for j, run in enumerate(runs[at : at + hops]) for fix in (run.fixes if j == 0 else run.fixes[1:])]
        approach = approach_end(flight, drawn or [], legs[-1]["altitude_ft"] if legs else None)
        end = approach or {"end_altitude_ft": pattern_altitude(flight, own)}
        out.extend(engine("navlog_with_descents", legs=legs, fixes=[navlog.engine_fix(f) for f in fix_list], profile=asked.profile, **end))
        if out and k < len(flights) - 1:
            out[-1] = {**out[-1], "ground_min": ground_min_at(ground, flight.dest_ident)}
        at += hops
    return out


def on_airway(legs: list[dict], end: dict) -> list[dict]:
    """A hop's legs, each carrying the airway segment the hop flies, where
    it is one: the route's point it ends at holds the segment flown into it
    (app.router_basics.with_airways), and every leg of the hop is along it."""
    segment = end.get("airway")
    return [{**leg, "airway": segment} for leg in legs] if segment else legs


def totals_of(r, runs: list[HopRun], outcome: Flown, asked: Asked) -> dict:
    """The trip's totals: each flight's own, from one landing to the next
    through any waypoints (Route.flights), with its fuel check, joined
    (wingtip.planning.route_totals). Under IFR with an alternate filed
    (Asked.alternate), the last flight's check carries the leg on to it
    (alternate_leg). Each flight's check is against the fuel in the tanks
    as it leaves (Asked.tanks: the pilot's own, at engine start or fuelled
    to at a stop, never under what the flight before landed with; else
    full), as FPL's fuel gauges walk the tanks (fuel_in_tanks)."""
    per_flight, flown, at, left = [], [], 0, None
    for i, flight in enumerate(r.flights):
        hops = len(flight.idents) - 1
        legs = [leg for legs in outcome.hop_legs[at : at + hops] for leg in legs]
        flown.append((legs, runs[at].depart))
        leg_on = None
        if asked.rules == "ifr" and asked.alternate and i == len(r.flights) - 1 and legs:
            dest = {"ident": r.dest_ident, "lat": r.end[0], "lon": r.end[1]}
            leg_on = alternate_leg(dest, asked.alternate, legs[-1]["altitude_ft"], asked.profile, runs[-1].fcst_hr)
        tanks = (asked.tanks.get(flight.dep_ident.upper()), left)
        per_flight.append(flight_totals(legs, asked.profile, flight, runs[at].depart, asked.rules, leg_on, tanks))
        left = per_flight[-1].get("lands_with_gal")
        at += hops
    totals = route_totals(per_flight, r.flights)
    totals["fuel_stops"] = fuel_stops_of(r, per_flight, flown)
    # The time on the ground at the stops (hop_runs), for the arrival.
    totals["ground_min"] = sum(ground_min_at(asked.ground, f.dest_ident) for f in r.flights[:-1])
    return totals


def fuel_stops_of(r, per_flight: list[dict], flown: list[tuple[list[dict], datetime | None]]) -> list[dict]:
    """Where each flight the tanks do not hold could land for fuel, at the
    owner's ask ("suggest fuel stops just like Tesla suggests"): the
    engine's navlog_fuel_stop_need says whether it needs one and the
    figures to look by -- the worst burn a mile over a tankful's stretch,
    the detour, the reserve by day or night (14 CFR 91.151(a)) -- and
    wingtip.fuelstops.suggest finds the stops that make it and other fields
    for the first. Fuel alone, at the owner's ask ("only suggest fuel stops
    in the plan, not food etc. That can be done by the pilot by tapping the
    button along the route", 2026-10-23): the map's Stops is where a meal
    or a rest is picked. None where every flight's fuel check passes, or
    where the usable fuel or the flight's figures are not known."""
    out = []
    for flight, t, (legs, depart) in zip(r.flights, per_flight, flown):
        # The engine has no clock: no departure time leaves now.
        depart = planning.now() if depart is None else depart if depart.tzinfo else depart.replace(tzinfo=timezone.utc)
        need = engine(
            "navlog_fuel_stop_need",
            totals={
                k: t.get(k)
                for k in (
                    "fuel_margin_gal",
                    "usable_fuel_gal",
                    "on_board_gal",
                    "distance_nm",
                    "fuel_gal",
                    "ete_min",
                    "taxi_gal",
                    "reserve_gal",
                    "rules",
                    "night",
                )
            },
            legs=[{"distance_nm": leg.get("distance_nm"), "fuel_gal": leg.get("fuel_gal")} for leg in legs],
            start={"lat": flight.start[0], "lon": flight.start[1]},
            end={"lat": flight.end[0], "lon": flight.end[1]},
            depart_s=depart.timestamp(),
        )
        if need is None:
            continue
        try:
            stops, choices = fuelstops.suggest(flight.start, flight.end, **need, skip=set(r.idents))
        except (OSError, ValueError, KeyError):
            # The airport tables missing or unreadable: the fuel check
            # still says the flight is short, with no stop offered.
            log.warning("No fuel stops for %s-%s", flight.dep_ident, flight.dest_ident, exc_info=True)
            continue
        if stops:
            out.append(
                {
                    "departure": flight.dep_ident,
                    "destination": flight.dest_ident,
                    "usable_gal": need["usable_gal"],
                    "reason": "fuel",
                    "stops": [s.as_dict() for s in stops],
                    "choices": [c.as_dict() for c in choices],
                }
            )
    return out
