"""The nav log's own arithmetic: the cruise altitude (remembered per
route) and the totals, with the caches that hold them. The course line
and the hops' joins are route_join's, what is said of an altitude that is
not legal altitude_cautions', the cache single_flight_cache's. The
legs are wingtip.navlog's, and the flight put together from them
wingtip.flight_plan's. Moved here from the planner's wingtip.planning
(2026-11-09) with the flight's assembly, which needs it: nothing here
serves HTTP."""

import math
import time
from datetime import datetime, timedelta, timezone


from . import altitude as altitude_module
from . import navlog, weather
from .config import PLAN_LIMIT_S
from .engine import ask as engine
from .winds_aloft import winds_key_for

# The parts of the nav log's arithmetic that have a module of their own, which
# the planner and its tests ask for here.
from .altitude_cautions import (  # noqa: F401
    altitude_anyway,
    no_altitude,
    own_altitude_caution,
    prohibited_caution,
)
from .route_join import course_line, join_selections, route_line, route_totals  # noqa: F401
from .single_flight_cache import SingleFlightTTLCache, StillComputing, describe_stages  # noqa: F401


# How long a caller waits on a computation that is already running before
# saying so, and after which that computation counts as abandoned: the
# planner's one bound, wingtip.config's (see there).
COMPUTE_LIMIT_S = PLAN_LIMIT_S


def now() -> datetime:
    """The time a plan with no departure time leaves at: now. One place,
    so a test can set the hour."""
    return datetime.now(timezone.utc)


def flight_totals(
    leg_list: list,
    profile: dict | None,
    r,
    depart: datetime | None,
    rules: str = "vfr",
    alternate: dict | None = None,
    tanks: tuple[float | None, float | None] = (None, None),
) -> dict:
    """The legs' totals plus the fuel check, the engine's (navlog_totals,
    navlog_fuel_plan). Night is judged at both ends
    -- the departure at the departure time, the arrival at the
    destination that many minutes later -- with no departure time taken
    as now, as the winds are: a plan made at 21:00 for "now" leaves at
    night and carries 14 CFR 91.151(a)(2)'s 45 minutes, where it was the
    day's 30 for want of a time. Under IFR the reserve is 45 minutes
    whatever the hour (14 CFR 91.167(a)(3)), and `alternate`, the leg on to
    the alternate (alternate_leg), is flown before it (14 CFR
    91.167(a)(2)). `tanks` is the pilot's own fuel leaving (None, full)
    and what the flight before landed with (None at the departure): the
    fuel check is against what is in the tanks (navlog_fuel_plan)."""
    t = engine("navlog_totals", legs=leg_list)
    # When the plan was made and the winds it flies, for the nav log to
    # say: planned for "now", its winds go out of date as the day goes on.
    t["planned_at"] = now().isoformat().replace("+00:00", "Z")
    t["winds"] = weather.winds_period(winds_key_for(depart))
    depart = now() if depart is None else depart if depart.tzinfo else depart.replace(tzinfo=timezone.utc)
    # 14 CFR 1.1's night at the departure, and at the destination on
    # arrival where the time aloft is known: the engine's (sun.rs).
    arrival = depart + timedelta(minutes=t["ete_min"]) if t["ete_min"] is not None else depart
    end = r.end if t["ete_min"] is not None else r.start
    night = engine("night_at_either_end", start=list(r.start), depart_s=depart.timestamp(), end=list(end), arrive_s=arrival.timestamp())
    t.update(
        engine(
            "navlog_fuel_plan",
            total_fuel_gal=t["fuel_gal"],
            profile=profile,
            night=bool(night),
            rules=rules,
            alternate_gal=(alternate or {}).get("fuel_gal") or 0.0,
            fill_gal=tanks[0],
            left_gal=tanks[1],
        )
    )
    # 14 CFR 61.57(b)'s night-passenger period, an hour after sunset to an
    # hour before sunrise, anywhere on the way: its own window, not 1.1's
    # night (the engine's passenger_night_on_the_way, sun.rs), so a summer
    # night in Alaska with no 1.1 night still raises the risk assessment's
    # night-currency caution.
    t["night_passengers"] = engine(
        "passenger_night_on_the_way", start=list(r.start), end=list(end), depart_s=depart.timestamp(), minutes=t["ete_min"] or 0.0
    )
    # 14 CFR 91.209(a)'s position lights, sunset to sunrise, anywhere on
    # the way: earlier than 1.1's night, so a squawk deferred for day
    # flight grounds a flight landing twenty minutes after sunset (the
    # engine's lights_on_the_way, sun.rs).
    t["lights"] = engine("lights_on_the_way", start=list(r.start), end=list(end), depart_s=depart.timestamp(), minutes=t["ete_min"] or 0.0)
    t["alternate"] = alternate
    return t


def alternate_leg(dest: dict, alternate: dict, altitude_ft: float, profile: dict | None, fcst_hr: str) -> dict:
    """The leg from the destination on to the IFR alternate, for 14 CFR
    91.167(a)(2)'s fuel: the engine's (navlog_alternate_leg), flown at the
    route's last altitude in its winds, or in still air where the winds
    cannot be read, which says so."""
    places = [{"lat": dest["lat"], "lon": dest["lon"]}, {"lat": alternate["lat"], "lon": alternate["lon"]}]
    try:
        (leg_air,) = navlog.leg_air(places, [[altitude_ft]], fcst_hr)
        air = {"variation_deg": leg_air["variation_deg"], "wind": leg_air["at"][0]["wind"], "oat_c": leg_air["at"][0]["oat_c"]}
    except weather.WeatherServiceError:
        air = None
    return engine(
        "navlog_alternate_leg",
        dest={"ident": dest["ident"], "lat": dest["lat"], "lon": dest["lon"]},
        alternate={"ident": alternate["ident"], "lat": alternate["lat"], "lon": alternate["lon"]},
        altitude_ft=altitude_ft,
        profile=profile,
        air=air,
    )


# The altitude selection re-ran its whole stack -- terrain sampling
# (USGS EPQS, network), the airspace shapefile, and three separate
# aviationweather.gov calls -- on every single nav-log request, for a
# result that only moves when the weather does. The terrain and airspace
# halves are static per route outright; the weather half already runs on
# aviationweather.gov products reissued a few times a day, and
# wingtip.weather's own winds cache uses this same 15-minute TTL. On a bad
# aviationweather.gov day (504s, retries) one uncached selection was
# observed taking over two minutes -- a price worth paying once per
# route per quarter hour, not on every page load.
# cachetools rather than a dict and a timestamp per entry: it holds the
# expiry itself, and -- the reason it matters here -- maxsize bounds it.
# The key includes every fix of the route, so a plain dict grew by a row
# for every distinct set of checkpoints a pilot tried and never gave one
# back. That is a leak in a process meant to stay up.
#
# Single-flight (see SingleFlightTTLCache above): the two-minute-worst-
# case number above is exactly what two identical requests on a cache
# miss used to both pay, concurrently, before this was single-flight --
# the same route opened in two tabs, or a client's own retry racing the
# request it gave up on.
_ALTITUDE_TTL_S = 900
_ALTITUDE_CACHE = SingleFlightTTLCache(maxsize=512, ttl=_ALTITUDE_TTL_S)


def _altitude_key(
    start: tuple,
    end: tuple,
    aircraft: str,
    fixes: list | None,
    fcst_hr: str,
    window: tuple | None = None,
    rules: str = "vfr",
    airway: dict | None = None,
    paths: tuple = (),
) -> tuple:
    return (
        round(start[0], 4),
        round(start[1], 4),
        round(end[0], 4),
        round(end[1], 4),
        aircraft,
        tuple((round(lat, 4), round(lon, 4)) for lat, lon in fixes) if fixes else None,
        fcst_hr,
        (round(window[0]), round(window[1])) if window else None,
        rules,
        tuple(sorted(airway.items())) if airway else None,
        paths,
    )


def flight_window(depart: datetime | None, distance_nm: float, cruise_tas_kt: float | None) -> tuple:
    """(start, end) in unix seconds: from the hour the departure falls in
    (now, when none is given) to an hour past the arrival at cruise TAS.
    The go/no-go forecast is read over this rather than at the moment of
    asking. Whole hours, so one hour's requests share a cached selection.
    With no airplane (`cruise_tas_kt` None) the arrival is not known: the
    departure's hour and the next."""
    if depart is None:
        start = time.time()
    else:
        start = (depart if depart.tzinfo else depart.replace(tzinfo=timezone.utc)).timestamp()
    start -= start % 3600
    hours = (distance_nm / max(cruise_tas_kt, 1.0) if cruise_tas_kt is not None else 0.0) + 1.0
    return (start, start + math.ceil(hours) * 3600)


def cruise_altitude(
    start: tuple,
    end: tuple,
    profile: dict | None,
    aircraft: str,
    fixes: list | None = None,
    fcst_hr: str = "06",
    window: tuple | None = None,
    rules: str = "vfr",
    airway: dict | None = None,
    paths: tuple = (),
) -> dict:
    """`fixes`, the nav log's own (lat, lon) fixes, add the leg-by-leg
    segments the stepped plans need; they are part of the key, since a
    different set of checkpoints is a different set of legs. So is the
    forecast period, since the freezing level is read from it, and
    `rules`, "ifr" for a flight under IFR, and `airway`, the airway segment
    a hop is flown along, and `paths`, its legs flown by a procedure
    (wingtip.altitude). Raises StillComputing when the same selection has
    been running longer than COMPUTE_LIMIT_S."""
    pending: set = set()

    def compute():
        # The keywords only when they differ from the defaults: a
        # route-wide call keeps the original one.
        given = {"fixes": fixes, "fcst_hr": fcst_hr, "window": window, "rules": rules}
        given |= {"airway": airway, "paths": paths}
        extra = {k: v for k, v in given.items() if v and v != {"fcst_hr": "06", "rules": "vfr"}.get(k)}
        return altitude_module.select_cruise_altitude(start, end, profile, pending=pending, **extra)

    return _ALTITUDE_CACHE.get_or_compute(
        _altitude_key(start, end, aircraft, fixes, fcst_hr, window, rules, airway, paths), compute, COMPUTE_LIMIT_S, pending
    )


def altitude_waiting_on(
    start: tuple,
    end: tuple,
    aircraft: str,
    fixes: list | None,
    fcst_hr: str,
    window: tuple | None = None,
    rules: str = "vfr",
    airway: dict | None = None,
    paths: tuple = (),
) -> str:
    """What the selection cruise_altitude() would be joining is still
    waiting on, in words -- "" when nothing of it is running, which is
    also the case once it is done and the plans' winds are what remains."""
    running = _ALTITUDE_CACHE.running(_altitude_key(start, end, aircraft, fixes, fcst_hr, window, rules, airway, paths))
    return "" if running is None else describe_stages(running[1])


# The four plans read the winds at every legal altitude of every leg,
# and the winds product is reissued a few times a day and held by
# wingtip.weather for the same 15 minutes -- so the plans are held as long,
# per route, fixes and aeroplane, and switching between them is free.
# Single-flight for the same reason _ALTITUDE_CACHE is.
_PLANS_CACHE = SingleFlightTTLCache(maxsize=512, ttl=_ALTITUDE_TTL_S)


def altitude_plans(
    fix_list: list, selection: dict, profile: dict | None, aircraft: str, fcst_hr: str = "06", departure_elevation_ft: float | None = None
) -> dict:
    """The four plans (wingtip.navlog.altitude_profiles), held per route,
    fixes and airplane; with none (`profile` None), the lowest and highest
    alone."""
    figures = profile or {}
    key = (
        aircraft,
        figures.get("cruise_tas_kt"),
        figures.get("fuel_burn_gph"),
        *(figures.get(k) for k in ("climb_tas_kt", "climb_fuel_burn_gph", "descent_ias_kt", "descent_fuel_burn_gph")),
        figures.get("cruise_power_pct"),
        fcst_hr,
        departure_elevation_ft,
        tuple((round(f["lat"], 4), round(f["lon"], 4)) for f in fix_list),
        tuple(tuple(s["candidates_ft"]) for s in selection.get("segments", [])),
    )

    def compute():
        return navlog.altitude_profiles(
            fix_list, selection.get("segments", []), profile, fcst_hr, departure_elevation_ft=departure_elevation_ft
        )

    return _PLANS_CACHE.get_or_compute(key, compute, COMPUTE_LIMIT_S)
