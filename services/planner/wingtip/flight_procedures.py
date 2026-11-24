"""The runways, procedures and circuits a flight's legs are flown by:
a field's pattern altitude, the end an approach is flown to, the legs the
procedures picked add, and the runway each field's wind picks for a first
plan (wind_picks)."""

from __future__ import annotations

import logging
from dataclasses import replace
from datetime import datetime, timedelta, timezone

from . import airports, faa_data, geo, pattern, planning, procedure_paths, runway_wind, weather
from .config import DATA_DIR
from .engine import ask as engine
from .procedure_legs import bare_field, legs_flown_by
from .procedure_legs import picked as _picked

from .flight_outcomes import Asked, Flown, HopRun, ground_min_at

log = logging.getLogger(__name__)


def field_pattern_ft(ident: str, airport: dict) -> float | None:
    """A field's traffic pattern altitude above sea level as a pilot flies
    it: the engine's pattern_altitude (`flown_ft`, to the nearest hundred
    feet) from the field's elevation and the FAA's published height above
    it, else AC 90-66C's 1,000 ft (wingtip.faa_data.published_pattern_agl_ft,
    NASR APT_BASE's TPA). None where its elevation is not known."""
    elevation_ft = airport.get("elevation_ft")
    if elevation_ft is None:
        return None
    published = faa_data.published_pattern_agl_ft(ident, DATA_DIR / "raw" / "faa_nasr")
    return engine("pattern_altitude", elevation_ft=elevation_ft, published_agl_ft=published)["flown_ft"]


def pattern_altitude(flight, own: dict[str, float] | None = None) -> float | None:
    """The altitude a flight comes down to: the traffic pattern's at the
    field it lands at -- the pilot's own for it (Asked.own_altitudes), else
    field_pattern_ft. None where it ends in the air, or the field's
    elevation is not known."""
    if not flight.lands:
        return None
    if own and flight.dest_ident in own:
        return own[flight.dest_ident]
    return field_pattern_ft(flight.dest_ident, flight.dest_airport)


def approach_end(flight, drawn: list[tuple[str, dict]], cruise_ft: float | None = None) -> dict | None:
    """Where a flight landing by the instrument approach picked for its
    field comes down to, as the engine's navlog_with_descents takes it
    (`end_altitude_ft`, `end_before_nm`, `end_fix`): the engine's
    navlog_approach_end, the first fix of the approach with an altitude
    under the cruise (`cruise_ft`). None where no approach is picked there
    (`drawn`, Asked.drawn), no fix is under the cruise, or the CIFP cannot
    be had: down to the pattern."""
    if not flight.lands:
        return None
    approach = _picked(drawn, "approach", flight.dest_ident)
    if approach is None:
        return None
    field_ = flight.dest_airport
    fix_list = [{k: f.get(k) for k in ("ident", "lat", "lon", "min_ft", "max_ft", "missed")} for f in approach["fixes"]]
    return engine("navlog_approach_end", fixes=fix_list, cruise_ft=cruise_ft, field={"lat": field_["lat"], "lon": field_["lon"]})


def with_procedures(
    r,
    runs: list[HopRun],
    outcome: Flown,
    drawn: list[tuple[str, dict]],
    runways: dict[str, str] | None = None,
    landings: dict[str, str] | None = None,
) -> Flown:
    """The legs with the procedures picked flown (`drawn`, Asked.drawn): a
    flight's first leg out of its field by the departure picked there, its
    last into the field it lands at by the arrival and the approach picked
    there, each along their path from the leg's start
    (wingtip.procedure_paths.flown), a departure by its transition for the
    runway the pilot leaves from (`runways`) -- an arrival flown out to its
    first fix and round to the runway can be a hundred miles more than the
    leg it is flown in place of (C81 to O'Hare by BENKY6, 2026-10-19). The
    miles more are flown at the leg's ground speed and cruise burn, added
    to its time and fuel, so the totals, the fuel required (14 CFR 91.151,
    91.167) and the times at each point after are those of the flight
    flown. The leg keeps the route's own distance, which the chart, the
    side view and the tops of climb and descent are laid along, and says
    its path and the miles more (`procedure`) for the dry run to fly. New
    legs: the plan's own are the planner's cache's (Flown).

    With no departure picked, a flight leaves by the runway picked to
    leave from (`runways`): along it and its upwind, then out of the
    pattern straight on or at 45° (wingtip.pattern.departure_circuit, AIM
    4-3-3). With no approach, it lands by the traffic pattern for the
    runway picked to land on (`landings`): in at 45° to the downwind, then
    base and final (wingtip.pattern.arrival_circuit, AIM 4-3-3, AC 90-66C) --
    where it was flown straight to the middle of the field, with the
    pattern drawn round it on the map and not flown (the owner,
    2026-10-27: "is it not flying that and landing?")."""
    runways, landings = runways or {}, landings or {}
    if not drawn and not runways and not landings:
        return outcome
    hops = [[dict(leg) for leg in legs] for legs in outcome.hop_legs]
    for hop, i, flight, picks, leaves_by, lands_on in legs_flown_by(r, [len(legs) for legs in hops], drawn, runways, landings):
        leg, fixes_ = hops[hop][i], runs[hop].fixes
        start, end = fixes_[i], fixes_[i + 1]
        # Out of the pattern the way to the flight's next field, as the
        # map draws it (web lib/trafficPattern's departurePattern).
        takeoff = _circuit_out(flight.dep_ident, flight.dep_airport, leaves_by, flight.end) if leaves_by else None
        landing = _circuit_in(flight.dest_ident, flight.dest_airport, lands_on) if lands_on else None
        path = procedure_paths.flown(
            (start["lat"], start["lon"]),
            (end["lat"], end["lon"]),
            *picks,
            runway=runways.get(bare_field(flight.dep_ident.upper())) if picks[0] else None,
            takeoff_circuit=takeoff,
            landing_circuit=landing,
        )
        if path is not None and leg.get("tas_kt") is None:
            # No airplane: the path and its miles more, flown in no
            # time and on no fuel anyone knows.
            more_nm = max(0.0, path["nm"] - leg["distance_nm"])
            leg["procedure"] = {**path, "nm": round(path["nm"], 1), "more_nm": round(more_nm, 1), "more_min": None, "more_gal": None}
            continue
        if path is None or not leg["groundspeed_kt"] or leg["ete_min"] is None:
            continue
        # Never fewer miles than the leg: a path that cuts a corner of
        # the route is planned as the route.
        more_nm = max(0.0, path["nm"] - leg["distance_nm"])
        more_min = more_nm / leg["groundspeed_kt"] * 60
        more_gal = more_min / 60 * leg["fuel_burn_gph"]
        leg["ete_min"] = round(leg["ete_min"] + more_min, 1)
        if leg["fuel_gal"] is not None:
            leg["fuel_gal"] = round(leg["fuel_gal"] + more_gal, 2)
        leg["procedure"] = {
            **path,
            "nm": round(path["nm"], 1),
            "more_nm": round(more_nm, 1),
            "more_min": round(more_min, 1),
            "more_gal": round(more_gal, 2),
            "fix_min": fix_minutes(path, picks, leg["ete_min"], leg["groundspeed_kt"]),
        }
    return replace(outcome, legs=[leg for legs in hops for leg in legs], by_hop=tuple(hops) if outcome.by_hop else ())


def fix_minutes(path: dict, picks, ete_min: float, groundspeed_kt: float) -> dict[str, float]:
    """The minutes from a leg's start to each fix of the procedures it is
    flown by (`picks`, legs_flown_by's departure, arrival and approach), by
    ident, for FPL's list to give each fix its time as it gives a stop's
    (the owner, 2026-11-24: "Each fix should show altitude and eta on the
    right side to look similar to other stops"). Along the flown path at
    the leg's ground speed, as its miles more are timed (with_procedures):
    a departure's fixes from the leg's start, where the airplane is at its
    time, an arrival's and an approach's back from the leg's end, where it
    is at the leg's ETE, so the climb out of the field, flown slower than
    the ground speed, is not counted in their times. Where the path passes
    a fix twice (a course reversal round it), its first time; a fix not on
    the path (left out by a Direct to) and a missed approach's, none."""
    points = path["path"]
    total = path["nm"]
    minutes: dict[str, float] = {}
    for which, drawing in zip(("departure", "arrival", "approach"), picks):
        for fix in (drawing or {}).get("fixes", []):
            if fix.get("missed") or fix["ident"] in minutes:
                continue
            at = next(
                (i for i, p in enumerate(points) if geo.distance_nm(*p, fix["lat"], fix["lon"]) < procedure_paths.SAME_PLACE_NM), None
            )
            if at is None:
                continue
            along = procedure_paths.length_nm(points[: at + 1])
            flown = along / groundspeed_kt * 60 if which == "departure" else ete_min - (total - along) / groundspeed_kt * 60
            minutes[fix["ident"]] = round(max(0.0, min(flown, ete_min)), 1)
    return minutes


#: How far ahead a field's time is before its runway is taken from a
#: forecast, not the report now (web ProceduresRoute's FORECAST_AFTER_MS,
#: the owner's pick of 2026-10-20).
FORECAST_AFTER_S = 60 * 60
#: A forecast's time, to the ten minutes, as the page asks for it.
FORECAST_STEP_S = 10 * 60


def wind_picks(r, outcome: Flown, asked: Asked) -> tuple[dict[str, str], dict[str, str]]:
    """The runways left from and landed on: the pilot's own picks
    (Asked.leave_runways, land_runways) and, with `wind_runways`, at every
    other field the runway into the wind the page picks for it as its
    weather comes in -- the field's own report's within FORECAST_AFTER_S
    of now (wingtip.runway_wind.runway_in_use), or with none of its own or
    a variable one, the nearest report's (_wind_of, wind_pick); the
    forecast's for the time the flight is there after that (wind_pick, its
    own TAF or the nearest's, wingtip.weather.forecast_wind) -- so a first
    plan flies its patterns and is the plan the page then asks for, where
    its time jumped as the picks came (KOSH-KGRB 20.8 min, then 33 with
    both patterns, 2026-10-28). The times: the departure (`depart`, now
    when not given), each landing the legs' ETEs on from it and each
    stop's minutes on the ground."""
    leave, land = asked.leave_runways, asked.land_runways
    if not asked.wind_runways:
        return leave, land
    now = planning.now()
    start = now if asked.depart is None else asked.depart if asked.depart.tzinfo else asked.depart.replace(tzinfo=timezone.utc)
    hops = outcome.hop_legs
    wanted_at: list[tuple[str, str, dict, dict, datetime]] = []  # (which, field, airport, its picks, when)
    at, t = 0, start
    for flight in r.flights:
        n = len(flight.idents) - 1
        if flight.takes_off:
            wanted_at.append(("leave", flight.dep_ident, flight.dep_airport, leave, t))
        t = t + timedelta(minutes=sum(leg["ete_min"] or 0 for legs in hops[at : at + n] for leg in legs))
        if flight.lands:
            wanted_at.append(("land", flight.dest_ident, flight.dest_airport, land, t))
        t = t + timedelta(minutes=ground_min_at(asked.ground, flight.dest_ident))
        at += n
    wanted = [a for a in wanted_at if bare_field(a[1].upper()) not in a[3] and not a[2].get("fix") and a[2].get("lat") is not None]
    if not wanted:
        return leave, land
    sources = {ident: (airport.get("ident") or ident).upper() for _, ident, airport, _, _ in wanted}
    try:
        reports = weather.metar_for_idents(list(dict.fromkeys([*sources.values(), *(i.upper() for i in sources)])))
    except weather.WeatherServiceError:
        reports = {}
    leave, land = dict(leave), dict(land)
    for which, ident, airport, _, when in wanted:
        report = reports.get(sources[ident]) or reports.get(ident.upper()) if reports else None
        try:
            winded = runway_wind.with_winds(airports.get_runways(sources[ident]), report, airport["lat"], airport["lon"])
            ways = pattern.with_traffic(winded, ident, airport["lat"], airport["lon"])
            if (when - now).total_seconds() > FORECAST_AFTER_S:
                at_s = round(when.timestamp() / FORECAST_STEP_S) * FORECAST_STEP_S
                end = runway_wind.wind_pick(ways, weather.forecast_wind(airport["lat"], airport["lon"], at_s, sources[ident]))
            else:
                end = runway_wind.runway_in_use(ways) or runway_wind.wind_pick(ways, _wind_of(report, airport, sources[ident]))
        except (OSError, ValueError, weather.WeatherServiceError):
            continue
        if end:
            (leave if which == "leave" else land).setdefault(bare_field(ident.upper()), end)
    return leave, land


def _wind_of(report: dict | None, airport: dict, source: str) -> dict | None:
    """The wind a field's runway is picked by where its own report put
    none on a runway (wind_picks): its own report's variable wind, else the
    nearest report's within reach (wingtip.weather.nearest_report), as the
    airport's card gives the page them (`metar`, `nearby_metar`)."""
    if report is None:
        near = weather.nearest_report(airport["lat"], airport["lon"], exclude=source)
        report = near and near.get("metar")
    return {"dir_true_deg": report.get("wind_dir_true_deg"), "speed_kt": report.get("wind_speed_kt")} if report else None


def _field_runway(ident: str, airport: dict, end: str) -> dict | None:
    """The runway at a field with the end `end`, its ends' places and
    traffic as the map has them (wingtip.pattern.with_traffic)."""
    if airport.get("fix") or airport.get("lat") is None:
        return None
    try:
        ways = pattern.with_traffic(airports.get_runways(airport.get("ident") or ident), ident, airport["lat"], airport["lon"])
    except (OSError, ValueError):
        return None
    key = pattern.end_key(end)
    return next((w for w in ways if any(pattern.end_key(e["ident"]) == key for e in w.get("runway_ends") or [])), None)


def _circuit_out(ident: str, airport: dict, end: str, toward: tuple) -> dict | None:
    """The way out by runway `end` and its upwind (wingtip.pattern.departure_circuit)."""
    runway = _field_runway(ident, airport, end)
    return pattern.departure_circuit(runway, end, toward) if runway else None


def _circuit_in(ident: str, airport: dict, end: str) -> dict | None:
    """The traffic pattern flown to land on runway `end`
    (wingtip.pattern.arrival_circuit), at the field's pattern altitude
    (field_pattern_ft) down to its elevation."""
    runway = _field_runway(ident, airport, end)
    return pattern.arrival_circuit(runway, end, field_pattern_ft(ident, airport), airport.get("elevation_ft")) if runway else None
