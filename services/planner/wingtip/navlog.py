"""The nav log, as the planner asks the engine for it (wingtip_route::navlog,
#482 phase 4): every figure -- the wind triangle, the airplane in each
leg's air, the climbs and descents, the four altitude plans, the fuel
plan -- is the engine's, the same the web app and the phones ask. This
module is the edge that feeds it: it looks up the air each leg is flown
in, the winds and temperatures aloft at the leg's midpoint at each
altitude it may be flown at, at the time the airplane gets there
(wingtip.weather, wingtip.winds_aloft), and the magnetic variation there
(wingtip.magnetic), since the engine never fetches.

Compass heading (magnetic corrected for an airplane's compass deviation)
is not worked: that needs a deviation card the profiles do not carry.
"""

from itertools import pairwise

from .engine import ask as engine
from .geo import distance_nm
from .magnetic import magnetic_variation_deg
from .winds_aloft import air_at, later

# 14 CFR 91.151(a): VFR needs fuel to the destination plus 30 minutes at
# normal cruise by day, 45 at night -- the engine's figures
# (wingtip_flight::flight::reserve_min), for the planner's fuel stops.
DAY_RESERVE_MIN = engine("reserve_min", ifr=False, night=False)
NIGHT_RESERVE_MIN = engine("reserve_min", ifr=False, night=True)


def fixes(dep_ident: str, dest_ident: str, start: tuple, end: tuple, selected: list) -> list:
    """The nav log flies departure -> checkpoints -> destination. The
    airports are the ends of the flight, so they bound the legs even
    though neither is a checkpoint candidate."""
    return (
        [{"name": dep_ident, "category": "departure", "lat": start[0], "lon": start[1]}]
        + selected
        + [{"name": dest_ident, "category": "destination", "lat": end[0], "lon": end[1]}]
    )


def engine_fix(f: dict) -> dict:
    """What the engine reads of a fix: a checkpoint carries its model's
    scores and more besides."""
    return {"name": f.get("name"), "category": f.get("category"), "lat": float(f["lat"]), "lon": float(f["lon"])}


def _air(lat: float, lon: float, altitudes: list, fcst_hr: str | None) -> list[dict]:
    """The air at each of a leg's altitudes over a point, asked at once
    (winds_aloft.air_at: one engine call a leg, not one an altitude): the
    wind (None where none is known, a no-wind estimate then, not a calm)
    and the temperature (None where none is, a standard day then)."""
    return [
        {"altitude_ft": ft, "wind": a["wind"], "oat_c": None if a["temp_c"] is None else float(a["temp_c"])}
        for ft, a in zip(altitudes, air_at(lat, lon, altitudes, fcst_hr))
    ]


def leg_air(fix_list: list, altitudes: list, fcst_hr: str | None = None, tas_kt: float | None = None) -> list:
    """Each leg's air, as the engine's `air` takes it: its variation, and
    its air at each of its `altitudes` (a list a leg), looked up at the
    leg's midpoint, at the time the airplane is there: the departure's
    winds key (`fcst_hr`, winds_aloft.winds_key_for) and the time to the
    midpoint at `tas_kt` -- the cruise speed with no wind, near enough to
    pick between the forecast's hours two hours apart; the departure's
    time without one. Raises wingtip.weather.WeatherServiceError where the
    winds cannot be read."""
    out, flown_nm = [], 0.0
    for (a, b), at in zip(pairwise(fix_list), altitudes):
        lat, lon = (a["lat"] + b["lat"]) / 2, (a["lon"] + b["lon"]) / 2
        leg_nm = float(distance_nm(a["lat"], a["lon"], b["lat"], b["lon"]))
        when = later(fcst_hr, (flown_nm + leg_nm / 2) / tas_kt * 3600 if tas_kt else 0.0)
        flown_nm += leg_nm
        out.append({"variation_deg": float(magnetic_variation_deg(lat, lon)), "at": _air(lat, lon, at, when)})
    return out


def _cruise_kt(profile: dict | None) -> float | None:
    tas = (profile or {}).get("cruise_tas_kt")
    return float(tas) if tas and tas > 0 else None


def legs(fix_list: list, altitude_ft: float, profile: dict, fcst_hr: str | None = None) -> list:
    """One leg between each consecutive pair of fixes, all at
    `altitude_ft`, each in its own winds at its own time from the
    departure's winds key `fcst_hr` (winds_aloft.winds_key_for)."""
    flown = [engine_fix(f) for f in fix_list]
    air = leg_air(flown, [[altitude_ft]] * (len(flown) - 1), fcst_hr, _cruise_kt(profile))
    return engine("navlog_legs", fixes=flown, altitude_ft=altitude_ft, profile=profile, air=air)


def leg_from(start: tuple, end: tuple, altitude_ft: float, profile: dict, fcst_hr: str | None = None) -> dict:
    """The leg from one (lat, lon) to another (the diversion's), its time
    and fuel null where it cannot be flown."""
    (air,) = leg_air([{"lat": start[0], "lon": start[1]}, {"lat": end[0], "lon": end[1]}], [[altitude_ft]], fcst_hr)
    return engine(
        "navlog_leg",
        start={"lat": start[0], "lon": start[1]},
        end={"lat": end[0], "lon": end[1]},
        altitude_ft=altitude_ft,
        profile=profile,
        variation_deg=air["variation_deg"],
        **{k: air["at"][0][k] for k in ("wind", "oat_c")},
    )


class AltitudePlans(dict):
    """The four plans by kind (the engine's navlog_plans), and
    `by_altitude`: the route flown at each altitude any leg may fly, for
    the altitude wheel; `legs_at(target)`, the legs those figures are of."""

    by_altitude: list = []

    def legs_at(self, target: float) -> list | None:
        return None


def altitude_profiles(
    fix_list: list, segments: list, aircraft_profile: dict, fcst_hr: str | None = None, departure_elevation_ft: float | None = None
) -> AltitudePlans:
    """The lowest, highest, fastest and most economical ways to fly the
    fixes over each leg's legal altitudes (`segments`,
    wingtip.altitude.select_cruise_altitude's own, one a leg), with the
    climbs from `departure_elevation_ft` -- the engine's navlog_plans,
    in the air at every altitude its plans may fly (navlog_candidates).
    Empty where some leg has no legal altitude at all."""
    flown = [engine_fix(f) for f in fix_list]
    given_segments = [{"candidates_ft": s.get("candidates_ft")} for s in segments]
    # The candidates are the altitude selection's, the engine's own
    # select_cruise_altitude (#482 phase 3) as wingtip.altitude asks it.
    candidates = engine("navlog_candidates", segments=given_segments, legs=len(flown) - 1, profile=aircraft_profile)
    if candidates is None:
        return AltitudePlans()
    given = {
        "fixes": flown,
        "segments": given_segments,
        "profile": aircraft_profile,
        "departure_elevation_ft": departure_elevation_ft,
        "air": leg_air(flown, candidates, fcst_hr, _cruise_kt(aircraft_profile)),
    }
    made = engine("navlog_plans", **given)
    plans = AltitudePlans(made["plans"])
    plans.by_altitude = made["by_altitude"]
    # The legs for an altitude picked on the wheel: flown as its figures
    # were worked out, every leg legal (wingtip.flight_plan).
    plans.legs_at = lambda target: engine("navlog_legs_at", **given, target_ft=target)
    return plans
