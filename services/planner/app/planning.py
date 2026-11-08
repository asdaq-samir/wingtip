"""The nav log's own arithmetic: the cruise altitude (remembered per
route), the course line, and the aircraft it is all computed for. The
legs are wingtip.navlog's."""
import math
import threading
import time
from datetime import datetime, timedelta, timezone

from cachetools import TTLCache
from fastapi import HTTPException

from wingtip import aircraft as aircraft_module
from wingtip import altitude as altitude_module
from wingtip import airspace, geo, navlog, sun, weather
from wingtip.config import PLAN_LIMIT_S
from wingtip.engine import ask as engine


# How long a caller waits on a computation that is already running before
# saying so, and after which that computation counts as abandoned: the
# planner's one bound, wingtip.config's (see there).
COMPUTE_LIMIT_S = PLAN_LIMIT_S

# What the stages of wingtip.altitude's selection are called to a pilot, by
# the part of their label before the dot.
_STAGE_NAMES = {
    "terrain": "the terrain and obstacles",
    "airspace": "the airspace",
    "weather": "aviationweather.gov",
    "magnetic_variation_deg": "the magnetic variation",
    "sua": "the FAA's special-use airspace",
    "chart": "the chart reader",
}


def describe_stages(stages) -> str:
    """"the terrain and obstacles and aviationweather.gov" -- what a
    computation is still waiting on, in words a pilot can act on."""
    names = sorted({_STAGE_NAMES.get(stage.split(".")[0], stage) for stage in stages})
    if not names:
        return ""
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


class StillComputing(RuntimeError):
    """A computation for this key has been running longer than the limit.
    The message says for how long and on what it is still waiting;
    whatever it finishes with is cached for the next request."""

    def __init__(self, elapsed_s: float, stages):
        waiting = describe_stages(stages)
        super().__init__(
            f"Still working after {elapsed_s:.0f} s"
            + (f", waiting on {waiting}" if waiting else "")
            + ". Try again in a minute: the answer is kept once it arrives."
        )
        self.elapsed_s = elapsed_s
        self.stages = sorted(stages)


class _Flight:
    """One computation in progress: when it started, the stages it has
    said are still running, and the event its waiters wait on."""

    def __init__(self, pending: set | None):
        self.started = time.monotonic()
        self.pending = pending if pending is not None else set()
        self.done = threading.Event()

    def age(self) -> float:
        return time.monotonic() - self.started


class SingleFlightTTLCache:
    """A TTLCache where a miss is computed once per key, even under
    concurrent callers.

    The lock used to protect only the dict: check the cache, release the
    lock, compute on a miss, re-take the lock to store it. That leaves
    the computation itself unguarded, so two requests for the same
    not-yet-cached route -- the same plan loaded from two tabs, a retry
    racing the original -- both pay for the whole terrain/airspace/
    weather stack, which is exactly the cost this cache exists to avoid
    paying twice. The second caller now waits on the first caller's
    result instead of repeating it.

    A per-key event, not one lock for the whole cache: two different
    routes must still compute in parallel, only two callers of the
    *same* route serialise.

    And the wait is bounded (`limit_s`). It used to wait for as long as
    the first computation took, and one that never finished -- seen on
    2026-09-23, after a Docker restart, with every later nav log for the
    route streaming "still waiting" until the service was restarted --
    held every later caller with it. A caller now gives up after the
    limit with StillComputing, saying what the computation is waiting
    on; and a computation older than the limit counts as abandoned, so
    the next caller starts a fresh one rather than joining it.
    """

    def __init__(self, maxsize: int, ttl: float):
        self._cache: TTLCache = TTLCache(maxsize=maxsize, ttl=ttl)
        self._lock = threading.Lock()
        self._inflight: dict[object, _Flight] = {}
        # key -> a computation given up on as abandoned that has not
        # finished yet (see get_or_compute).
        self._abandoned: dict[object, _Flight] = {}

    def get(self, key):
        """Read-only access, for a caller that wants to see a cached
        value without joining anyone else's in-flight computation."""
        with self._lock:
            return self._cache.get(key)

    def running(self, key) -> tuple[float, list] | None:
        """How long the computation for `key` has been running and which
        of its stages are still going, or None when none is."""
        with self._lock:
            flight = self._inflight.get(key)
            return None if flight is None else (flight.age(), sorted(flight.pending))

    def clear(self):
        """Same shape as TTLCache.clear(), so the test fixture that
        resets every cache between tests does not need to know this one
        is not a bare TTLCache."""
        with self._lock:
            self._cache.clear()
            self._inflight.clear()
            self._abandoned.clear()

    def get_or_compute(self, key, compute, limit_s: float | None = None, pending: set | None = None):
        """The cached value, or `compute()`'s -- computed once however
        many callers ask at the same time. `pending` is the set `compute`
        reports its running stages in (see wingtip.altitude._timed), shown to
        anyone waiting on it; `limit_s` bounds the wait (see above)."""
        with self._lock:
            hit = self._cache.get(key)
            if hit is not None:
                return hit
            flight = self._inflight.get(key)
            if flight is not None and limit_s is not None and flight.age() > limit_s:
                # Abandoned. A fresh computation replaces it -- once. The
                # abandoned one cannot be stopped and keeps its threads,
                # and when what it is stuck on is shared (a lock, a hung
                # download) the fresh one sticks on it too; replacing
                # every limit_s piled up another stuck computation each
                # time. While an abandoned one is still running, a caller
                # is told what it waits on instead.
                previous = self._abandoned.get(key)
                if previous is not None and not previous.done.is_set():
                    raise StillComputing(flight.age(), flight.pending)
                self._abandoned[key] = flight
                flight = None
            if flight is None:
                flight = _Flight(pending)
                self._inflight[key] = flight
                leader = True
            else:
                leader = False

        if not leader:
            remaining = None if limit_s is None else max(0.0, limit_s - flight.age())
            if not flight.done.wait(timeout=remaining):
                raise StillComputing(flight.age(), flight.pending)
            with self._lock:
                hit = self._cache.get(key)
            if hit is not None:
                return hit
            # The leader's own compute() raised, so nothing was stored --
            # fall through and try again rather than propagate an
            # unrelated caller's exception, or the leader's transient
            # network error, to every follower that was only waiting on
            # a lock.
            return self.get_or_compute(key, compute, limit_s, pending)

        try:
            value = compute()
        except BaseException:
            self._finish(key, flight)
            raise
        with self._lock:
            # The current flight owns the slot. One replaced as abandoned
            # only fills an empty one: it used to overwrite the newer
            # flight's answer with its own, from inputs at least limit_s
            # older, and a fresh TTL.
            if self._inflight.get(key) is flight or key not in self._cache:
                self._cache[key] = value
        self._finish(key, flight)
        return value

    def _finish(self, key, flight: _Flight) -> None:
        """Wakes this flight's waiters, and forgets it -- unless a later
        caller has already replaced it as abandoned, whose own flight
        must stay."""
        with self._lock:
            if self._abandoned.get(key) is flight:
                del self._abandoned[key]
            if self._inflight.get(key) is flight:
                del self._inflight[key]
        flight.done.set()


def aircraft_profile(
    name: str, cruise_tas_kt: float | None = None, fuel_burn_gph: float | None = None,
    usable_fuel_gal: float | None = None, climb_tas_kt: float | None = None,
    climb_fuel_burn_gph: float | None = None, cruise_power_pct: float | None = None,
    service_ceiling_ft: float | None = None,
) -> dict:
    """One of data/aircraft's profiles, with a pilot's own aeroplane's
    numbers on top when given: the profile supplies the service ceiling
    the altitude selection needs unless the pilot set their own, the
    overrides supply what the legs, their climbs and the fuel check need."""
    # One of the stock profiles by its bare name, never a path: the name
    # is the request's, and the loader opens one with a suffix as it is.
    path = aircraft_module.profile_path(name)
    if path is None:
        raise HTTPException(422, f"No aircraft profile is named {name!r}.")
    profile = aircraft_module.load_aircraft_profile(path)
    overrides = {
        "cruise_tas_kt": cruise_tas_kt, "fuel_burn_gph": fuel_burn_gph, "usable_fuel_gal": usable_fuel_gal,
        "climb_tas_kt": climb_tas_kt, "climb_fuel_burn_gph": climb_fuel_burn_gph,
        "cruise_power_pct": cruise_power_pct, "service_ceiling_ft": service_ceiling_ft,
    }
    profile.update({k: v for k, v in overrides.items() if v is not None})
    return profile


def now() -> datetime:
    """The time a plan with no departure time leaves at: now. One place,
    so a test can set the hour."""
    return datetime.now(timezone.utc)


def flight_totals(leg_list: list, profile: dict, r, depart: datetime | None, rules: str = "vfr",
                  alternate: dict | None = None) -> dict:
    """The legs' totals plus the fuel check, the engine's (navlog_totals,
    navlog_fuel_plan). Night is judged at both ends
    -- the departure at the departure time, the arrival at the
    destination that many minutes later -- with no departure time taken
    as now, as the winds are: a plan made at 21:00 for "now" leaves at
    night and carries 14 CFR 91.151(a)(2)'s 45 minutes, where it was the
    day's 30 for want of a time. Under IFR the reserve is 45 minutes
    whatever the hour (14 CFR 91.167(a)(3)), and `alternate`, the leg on to
    the alternate (alternate_leg), is flown before it (14 CFR
    91.167(a)(2))."""
    t = engine("navlog_totals", legs=leg_list)
    # When the plan was made and the winds it flies, for the nav log to
    # say: planned for "now", its winds go out of date as the day goes on.
    t["planned_at"] = now().isoformat().replace("+00:00", "Z")
    t["winds"] = weather.winds_period(forecast_hour_for(depart))
    depart = now() if depart is None else depart if depart.tzinfo else depart.replace(tzinfo=timezone.utc)
    night = sun.is_night(r.start[0], r.start[1], depart)
    if t["ete_min"] is not None:
        arrival = depart + timedelta(minutes=t["ete_min"])
        night = night or sun.is_night(r.end[0], r.end[1], arrival)
    t.update(engine("navlog_fuel_plan", total_fuel_gal=t["fuel_gal"], profile=profile, night=bool(night), rules=rules,
                    alternate_gal=(alternate or {}).get("fuel_gal") or 0.0))
    t["alternate"] = alternate
    return t


def alternate_leg(dest: dict, alternate: dict, altitude_ft: float, profile: dict, fcst_hr: str) -> dict:
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
    return engine("navlog_alternate_leg", dest={"ident": dest["ident"], "lat": dest["lat"], "lon": dest["lon"]},
                  alternate={"ident": alternate["ident"], "lat": alternate["lat"], "lon": alternate["lon"]},
                  altitude_ft=altitude_ft, profile=profile, air=air)


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


def _altitude_key(start: tuple, end: tuple, aircraft: str, fixes: list | None, fcst_hr: str,
                  window: tuple | None = None, class_b_cleared: bool = False, rules: str = "vfr",
                  airway: dict | None = None) -> tuple:
    return (
        round(start[0], 4), round(start[1], 4), round(end[0], 4), round(end[1], 4), aircraft,
        tuple((round(lat, 4), round(lon, 4)) for lat, lon in fixes) if fixes else None, fcst_hr,
        (round(window[0]), round(window[1])) if window else None, class_b_cleared, rules,
        tuple(sorted(airway.items())) if airway else None,
    )


def flight_window(depart: datetime | None, distance_nm: float, cruise_tas_kt: float) -> tuple:
    """(start, end) in unix seconds: from the hour the departure falls in
    (now, when none is given) to an hour past the arrival at cruise TAS.
    The go/no-go forecast is read over this rather than at the moment of
    asking. Whole hours, so one hour's requests share a cached selection."""
    if depart is None:
        start = time.time()
    else:
        start = (depart if depart.tzinfo else depart.replace(tzinfo=timezone.utc)).timestamp()
    start -= start % 3600
    hours = distance_nm / max(cruise_tas_kt, 1.0) + 1.0
    return (start, start + math.ceil(hours) * 3600)


def cruise_altitude(
    start: tuple, end: tuple, profile: dict, aircraft: str, fixes: list | None = None, fcst_hr: str = "06",
    window: tuple | None = None, class_b_cleared: bool = False, rules: str = "vfr", airway: dict | None = None,
) -> dict:
    """`fixes`, the nav log's own (lat, lon) fixes, add the leg-by-leg
    segments the stepped plans need; they are part of the key, since a
    different set of checkpoints is a different set of legs. So is the
    forecast period, since the freezing level is read from it, and
    `class_b_cleared`, a pilot who will have a Class B clearance,
    `rules`, "ifr" for a flight under IFR, and `airway`, the airway segment
    a hop is flown along (wingtip.altitude).
    Raises StillComputing when the same selection has been running longer
    than COMPUTE_LIMIT_S."""
    pending: set = set()

    def compute():
        # The keywords only when they differ from the defaults: a
        # route-wide call keeps the original one.
        extra = {}
        if fixes:
            extra["fixes"] = fixes
        if fcst_hr != "06":
            extra["fcst_hr"] = fcst_hr
        if window is not None:
            extra["window"] = window
        if class_b_cleared:
            extra["class_b_cleared"] = True
        if rules != "vfr":
            extra["rules"] = rules
        if airway:
            extra["airway"] = airway
        return altitude_module.select_cruise_altitude(start, end, profile, pending=pending, **extra)

    return _ALTITUDE_CACHE.get_or_compute(
        _altitude_key(start, end, aircraft, fixes, fcst_hr, window, class_b_cleared, rules, airway), compute,
        COMPUTE_LIMIT_S,
        pending,
    )


def altitude_waiting_on(start: tuple, end: tuple, aircraft: str, fixes: list | None, fcst_hr: str,
                        window: tuple | None = None, class_b_cleared: bool = False, rules: str = "vfr",
                        airway: dict | None = None) -> str:
    """What the selection cruise_altitude() would be joining is still
    waiting on, in words -- "" when nothing of it is running, which is
    also the case once it is done and the plans' winds are what remains."""
    running = _ALTITUDE_CACHE.running(
        _altitude_key(start, end, aircraft, fixes, fcst_hr, window, class_b_cleared, rules, airway))
    return "" if running is None else describe_stages(running[1])


# The four plans read the winds at every legal altitude of every leg,
# and the winds product is reissued a few times a day and held by
# wingtip.weather for the same 15 minutes -- so the plans are held as long,
# per route, fixes and aeroplane, and switching between them is free.
# Single-flight for the same reason _ALTITUDE_CACHE is.
_PLANS_CACHE = SingleFlightTTLCache(maxsize=512, ttl=_ALTITUDE_TTL_S)


def altitude_plans(
    fix_list: list, selection: dict, profile: dict, aircraft: str, fcst_hr: str = "06",
    departure_elevation_ft: float | None = None,
) -> dict:
    key = (
        aircraft, profile.get("cruise_tas_kt"), profile.get("fuel_burn_gph"),
        profile.get("climb_tas_kt"), profile.get("climb_fuel_burn_gph"), profile.get("cruise_power_pct"),
        fcst_hr, departure_elevation_ft,
        tuple((round(f["lat"], 4), round(f["lon"], 4)) for f in fix_list),
        tuple(tuple(s["candidates_ft"]) for s in selection.get("segments", [])),
    )

    def compute():
        return navlog.altitude_profiles(
            fix_list, selection.get("segments", []), profile, fcst_hr, departure_elevation_ft=departure_elevation_ft,
        )

    return _PLANS_CACHE.get_or_compute(key, compute, COMPUTE_LIMIT_S)


def forecast_hour_for(depart: datetime | None) -> str:
    """The winds forecast period for a departure time -- now, when none
    is given. A naive time is taken as UTC, the way the API documents.

    The product whose own "for use" window holds the departure: each of
    the 6-, 12- and 24-hour forecasts is to be used between the FOR USE
    times its header gives, set by the clock, not by hours ahead (AC
    00-45H, table 5-21). Planned at 1400Z for 2230Z, eight and a
    half hours out, the hours-ahead rule flew the 6-hour product (for use
    1400-2100Z) where the 12-hour one (2100-0600Z) applies. The rule by
    hours stays where no header can be read."""
    if depart is None:
        return weather.forecast_hour(None)
    if depart.tzinfo is None:
        depart = depart.replace(tzinfo=timezone.utc)
    for fcst_hr in ("06", "12", "24"):
        period = weather.winds_period(fcst_hr)
        if period and _utc(period["use_from"]) <= depart < _utc(period["use_to"]):
            return fcst_hr
    return weather.forecast_hour((depart - datetime.now(timezone.utc)).total_seconds() / 3600)


def _utc(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def own_altitude_caution(selection: dict, legs: list, between: tuple[str, str], profile: dict | None = None) -> dict | None:
    """What is wrong with an altitude the pilot set for a hop -- the whole
    route's Custom one, or a waypoint's own -- against the band the planner
    worked out for each of its legs, which the pilot's altitude is flown
    over unchecked: under the terrain and obstacles' floor (14 CFR 91.119's
    minimum safe altitudes, floor_caution), off the hemispheric
    rule more than 3,000 ft above the ground (14 CFR 91.159), into Class B
    without the clearance planned for (14 CFR 91.131), over the aircraft's
    service ceiling, or inside the cloud clearance under a forecast base
    (14 CFR 91.155). Under IFR (the selection's `rules`): under the
    minimum IFR altitude (14 CFR 91.177(a)), or off the thousands the
    direction of flight takes (91.179(b)). A warning, never a refusal: the
    pilot may have reasons the planner cannot see -- ATC may assign
    otherwise -- and it says why rather than stopping them. None when
    nothing is."""
    reasons: list[str] = []
    altitude = None
    if selection.get("rules") == "ifr":
        return _own_ifr_altitude_caution(selection, legs, between, profile)
    for leg, segment in zip(legs, selection.get("segments", [])):
        altitude = leg["altitude_ft"]
        rule_from = segment.get("hemispheric_rule_from_ft")
        shelf, ceiling = segment.get("airspace_ceiling_ft"), segment.get("service_ceiling_ft")
        clouds = segment.get("cloud_ceiling_ft")
        found = []
        under = floor_caution(segment, altitude)
        if under:
            found.append(under)
        if rule_from is not None and altitude > rule_from and segment.get("eastbound") is not None:
            east = segment["eastbound"]
            if (altitude - (1500 if east else 500)) % 2000:
                found.append(f"{'Eastbound' if east else 'Westbound'} above {rule_from:,.0f} ft flies "
                             f"{'odd' if east else 'even'} thousands plus 500 (14 CFR 91.159)")
        if shelf is not None and altitude >= shelf:
            found.append(f"Into Class B from {max(shelf, 0):,.0f} ft: it needs a clearance (14 CFR 91.131)")
        if ceiling is not None and altitude > ceiling:
            found.append(f"Over the aircraft's {ceiling:,.0f} ft service ceiling")
        if clouds is not None and altitude > clouds:
            found.append(f"Inside the cloud clearance under {clouds:,.0f} ft (14 CFR 91.155)")
        reasons += [r for r in found if r not in reasons]
    highest = max((leg["altitude_ft"] for leg in legs), default=None)
    if highest is not None and highest >= CLASS_A_FT:
        reasons.append("At or over 18,000 ft MSL: Class A, flown under IFR with a clearance alone (14 CFR 71.33, 91.135)")
    reasons += oxygen_caution(highest, profile)
    if not reasons or altitude is None:
        return None
    return {"from_ident": between[0], "to_ident": between[1], "altitude_ft": altitude, "reasons": reasons}


#: The DOF's own abbreviations of an obstacle's type (its TYPE column), in
#: words; the rest are words already ("TOWER", "WINDMILL") and are said in
#: lower case.
_OBSTACLE_WORDS = {
    "T-L TWR": "transmission line tower", "BLDG": "building", "BLDG-TWR": "building tower",
    "CTRL TWR": "control tower", "GEN UTIL": "utility structure", "ELEC SYS": "electrical structure",
    "MET": "meteorological tower",
}


def floor_caution(segment: dict, altitude: float) -> str | None:
    """What a leg flown at `altitude` breaks of 14 CFR 91.119 under VFR, in
    a pilot's words: the rule, what the floor rests on and how far under it
    the leg is ("300 ft under the 2,500 ft 14 CFR 91.119(b) asks over a
    congested area: 1,000 ft over the highest obstacle within 2,000 ft,
    here a 1,500 ft tower"). Against the rule's own figure, the
    obstacle's top and its clearance, not the floor rounded up to the
    next 100 ft (wingtip.terrain): 2,480 ft over a 1,480 ft tower keeps
    91.119(b). A planner without those says the floor alone, as it did.
    None where the leg keeps it."""
    floor, highest, clearance = segment.get("floor_ft"), segment.get("highest_ft"), segment.get("obstacle_clearance_ft")
    if highest is None or clearance is None:
        if floor is not None and altitude < floor:
            return f"Under the {floor:,.0f} ft the terrain and obstacles need (14 CFR 91.119)"
        return None
    need = highest + clearance
    if altitude >= need:
        return None
    kind = segment.get("obstacle_type")
    # "an 800 ft tower", "an 11,000 ft ...": the article as the figure is said.
    figure = f"{highest:,.0f}"
    article = "an" if figure.startswith("8") or figure[:3] in ("11,", "18,") else "a"
    what = (f"{article} {figure} ft {_OBSTACLE_WORDS.get(kind, kind.lower()) if kind else 'obstacle'}"
            if segment.get("highest_is_obstacle") else f"the ground at {highest:,.0f} ft")
    # 91.119(b) over a congested area, and where the towns could not be
    # read (congested None), since the planner then took its 1,000 ft.
    if clearance >= 1000:
        where = "over a congested area" if segment.get("congested") else "where a congested area could not be ruled out"
        return (f"{need - altitude:,.0f} ft under the {need:,.0f} ft 14 CFR 91.119(b) asks {where}: "
                f"{clearance:,.0f} ft over the highest obstacle within 2,000 ft, here {what}")
    return f"{need - altitude:,.0f} ft under the {need:,.0f} ft 14 CFR 91.119(c) asks: {clearance:,.0f} ft over {what}"


#: Class A's floor, feet MSL (14 CFR 71.33(a)): no VFR flight in it (91.135).
CLASS_A_FT = 18_000.0


def oxygen_caution(highest_ft: float | None, profile: dict | None) -> list[str]:
    """What 14 CFR 91.211(a) asks of a flight up to `highest_ft` in an
    airplane with no pressurised cabin, its cabin at the altitude flown:
    over 12,500 ft MSL the crew's oxygen for any of it past 30 minutes,
    over 14,000 ft for all of it, over 15,000 ft every occupant's. None
    where the profile carries oxygen or a pressurised cabin, as the plans
    do (the engine's navlog plans, wingtip_route::navlog::plans::OXYGEN_CAP_FT)."""
    if highest_ft is None or highest_ft <= 12_500 or (profile or {}).get("supplemental_oxygen") or (profile or {}).get("pressurized"):
        return []
    if highest_ft > 15_000:
        return ["Over 15,000 ft MSL: oxygen for the crew the whole time there and for every occupant (14 CFR 91.211(a)(2), (3))"]
    if highest_ft > 14_000:
        return ["Over 14,000 ft MSL: oxygen for the crew the whole time there (14 CFR 91.211(a)(2))"]
    return ["Over 12,500 ft MSL: oxygen for the crew for any of it past 30 minutes (14 CFR 91.211(a)(1))"]


def _own_ifr_altitude_caution(selection: dict, legs: list, between: tuple[str, str], profile: dict | None = None) -> dict | None:
    """own_altitude_caution for a flight under IFR."""
    reasons: list[str] = []
    altitude = None
    for leg, segment in zip(legs, selection.get("segments", [])):
        altitude = leg["altitude_ft"]
        floor, ceiling = segment.get("floor_ft"), segment.get("service_ceiling_ft")
        found = []
        if floor is not None and altitude < floor:
            found.append(f"Under the {floor:,.0f} ft minimum IFR altitude: {segment.get('obstacle_clearance_ft', 1000):,.0f} ft "
                         f"over the highest obstacle within 4 nm (14 CFR 91.177(a))")
        if segment.get("eastbound") is not None:
            east = segment["eastbound"]
            if altitude % 1000 or (altitude // 1000) % 2 != (1 if east else 0):
                found.append(f"{'Eastbound' if east else 'Westbound'} under IFR flies {'odd' if east else 'even'} "
                             f"thousands, unless ATC assigns otherwise (14 CFR 91.179)")
        if ceiling is not None and altitude > ceiling:
            found.append(f"Over the aircraft's {ceiling:,.0f} ft service ceiling")
        reasons += [r for r in found if r not in reasons]
    reasons += oxygen_caution(max((leg["altitude_ft"] for leg in legs), default=None), profile)
    if not reasons or altitude is None:
        return None
    return {"from_ident": between[0], "to_ident": between[1], "altitude_ft": altitude, "reasons": reasons}


def altitude_anyway(selection: dict) -> float | None:
    """The altitude a route with no legal one is flown at anyway, at the
    owner's "I don't want to put hard limits on anything. A warning tick or
    a label is enough" (2026-10-23): the engine's `altitude_anyway` (the
    floor everywhere on the course's own altitudes, 14 CFR 91.159 or
    91.179(b)), for own_altitude_caution to say what stops it there."""
    return engine("altitude_anyway", selection=_engine_selection(selection))


def _engine_selection(selection: dict) -> dict:
    """The members of a selection the engine's words read: its rules, its
    course and floor, its segments, its Class B transits and its
    special-use airspace -- not the weather's hazards and the rest."""
    keys = ("rules", "course_magnetic_deg", "floor_ft", "hemispheric_rule_from_ft", "segments",
            "airspace_transits", "special_use")
    return {k: selection[k] for k in keys if k in selection}


def prohibited_caution(selection: dict) -> list[str]:
    """Prohibited airspace on the way, as a warning: nobody flies in it
    without its using agency's authorization (14 CFR 73.83), which an ATC
    clearance is not."""
    return [f"Through {a['name']}, prohibited airspace (14 CFR 73.83)"
            for a in selection.get("special_use", []) if a.get("type") == "P"]


def no_altitude(
    selection: dict, between: tuple[str, str] | None = None, via: dict | None = None, where: str | None = None,
) -> dict:
    """Why no plan has an altitude, in a pilot's words (the engine's
    `no_altitude`): a headline saying where along the route it fails, the
    reasons there as short sentences -- the terrain's floor, the first
    altitude above it on that course, what stops the climb -- what to do
    about it, `class_b` where Class B airspace is what stops it, and
    `detail`, all of it as one message for /api/plan's 422. `between`, the
    hop of a route with stops it fails on; `via`, the best waypoint round
    the Class B (class_b_detours); `where`, the place it binds by the
    route's own points ("540 nm past KDLH")."""
    return engine(
        "no_altitude", selection=_engine_selection(selection), between=list(between) if between else None,
        via={"ident": via["ident"], "added_nm": via["added_nm"]} if via else None, where=where,
    )


def class_b_detours(selection: dict, start: tuple, end: tuple) -> list[dict]:
    """Where Class B airspace is what leaves a leg of the flight from
    `start` to `end` no altitude, the waypoints that keep both legs out of
    it (wingtip.airspace.detour_waypoints), best first -- out of the parts low
    enough to stop the lowest altitude the leg's ground allows; none
    otherwise."""
    stuck = next((s for s in selection.get("segments", []) if not s.get("candidates_ft")), None)
    if stuck is None or stuck.get("airspace_ceiling_ft") is None or stuck.get("band_ceiling_ft") != stuck["airspace_ceiling_ft"]:
        return []
    lowest = engine(
        "legal_cruising_altitudes", floor_ft=stuck["floor_ft"], magnetic_course_deg=stuck.get("course_magnetic_deg", 0.0),
        rule_from_ft=stuck.get("hemispheric_rule_from_ft"))
    if not lowest:
        return []
    shp_path = airspace.ensure_class_airspace_shapefile(altitude_module.DEFAULT_FAA_CACHE_DIR)
    return airspace.detour_waypoints(start, end, shp_path, lowest[0])


#: class_b_ways by leg and altitude: each altitude picked on the wheel is
#: a new plan, and the detours were worked out again for every one, a
#: third of a second of each pick (py-spy, 2026-10-20). The airspace
#: changes only with the FAA's chart cycle; six hours is well inside one.
_CLASS_B_WAYS: TTLCache = TTLCache(maxsize=512, ttl=6 * 3600)


def class_b_ways(start: tuple, end: tuple, cruise_ft: float) -> list[dict]:
    """Where a leg planned with the Class B clearance (the default, at the
    owner's pick, 2026-10-20) enters Class B at its cruise altitude, the
    waypoints that keep it out at that altitude (wingtip.airspace.
    detour_waypoints), best first: the pilot's "Avoid Class B". None where
    it passes under, over or round it."""
    key = (round(start[0], 4), round(start[1], 4), round(end[0], 4), round(end[1], 4), cruise_ft)
    if key in _CLASS_B_WAYS:
        return _CLASS_B_WAYS[key]
    shp_path = airspace.ensure_class_airspace_shapefile(altitude_module.DEFAULT_FAA_CACHE_DIR)
    ways = airspace.detour_waypoints(start, end, shp_path, cruise_ft) if airspace.class_b_entered(start, end, shp_path, cruise_ft) else []
    _CLASS_B_WAYS[key] = ways
    return ways


def course_line(start: tuple, end: tuple, step_nm: float = 5.0) -> list:
    """The course line as [[lat, lon], ...], following the great circle.

    Stepped with the bearing recomputed toward the destination at every
    point, which is what makes it the actual great circle: hold the
    initial bearing constant instead and you trace a different path that
    sits a couple of miles off true course at the midpoint of a 300 nm
    leg. That matters because candidate positions come from great-circle
    cross-track distance, so a line drawn any other way would show
    on-course checkpoints as visibly off it.
    """
    total = geo.distance_nm(start[0], start[1], end[0], end[1])
    points, current, travelled = [list(start)], start, 0.0
    while travelled + step_nm < total:
        bearing = geo.bearing_deg(current[0], current[1], end[0], end[1])
        current = geo.destination_point(current[0], current[1], bearing, step_nm)
        travelled += step_nm
        points.append(list(current))
    points.append(list(end))
    return points


def route_line(r) -> list:
    """The course line of a route with any number of stops: each hop's
    great circle (course_line) in turn, a stop once where two meet."""
    points: list = []
    for hop in r.hops:
        hop_line = course_line(hop.start, hop.end)
        points += hop_line if not points else hop_line[1:]
    return points


def _least(values):
    known = [v for v in values if v is not None]
    return min(known) if known else None


def _either(values) -> bool | None:
    """True where any is, unknown where any is unknown, False otherwise:
    a hop's "could not be checked" must not read as the route's "fine"."""
    values = list(values)
    return True if any(v is True for v in values) else None if any(v is None for v in values) else False


def join_selections(selections: list[dict], offsets: list[float]) -> dict:
    """One altitude breakdown for a route with stops, from each hop's
    (wingtip.altitude.select_cruise_altitude): the hops' segments in turn,
    along the whole route, with what they cross; and the route-wide
    figures the most limiting of the hops', as a hop's are the most
    limiting of its legs' -- the highest floor, the lowest ceilings and
    cloud. Legal for the whole route is what is legal on every hop. The
    magnetic course is the first hop's, the one flown out on."""
    if len(selections) == 1:
        return selections[0]

    def shifted(items, keys, offset):
        return [{**item, **{k: round(item[k] + offset, 1) for k in keys if item.get(k) is not None}} for item in items]

    special_use, legs_before = [], 0
    for sel, offset in zip(selections, offsets):
        for area in sel.get("special_use", []):
            special_use.append({
                **area, "along_track_nm": round(area["along_track_nm"] + offset, 1),
                "legs": [i + legs_before for i in area.get("legs", [])],
            })
        legs_before += len(sel.get("segments", []))
    clouds = [(sel["cloud_base_ft"], sel.get("cloud_station")) for sel in selections if sel.get("cloud_base_ft") is not None]
    cloud_base_ft, cloud_station = min(clouds) if clouds else (None, None)
    candidates = sorted(set.intersection(*(set(sel.get("candidates_ft", [])) for sel in selections)))

    def least(key):
        return _least(sel.get(key) for sel in selections)

    def either(key):
        return _either(sel.get(key) for sel in selections)

    return {
        **selections[0],
        "recommended_ft": candidates[0] if candidates else None,
        "candidates_ft": candidates,
        "hemispheric_rule_from_ft": least("hemispheric_rule_from_ft"),
        "floor_ft": max(sel["floor_ft"] for sel in selections),
        "airspace_ceiling_ft": least("airspace_ceiling_ft"),
        "service_ceiling_ft": least("service_ceiling_ft"),
        "cloud_base_ft": cloud_base_ft,
        "cloud_station": cloud_station,
        "cloud_ceiling_ft": least("cloud_ceiling_ft"),
        "cloud_clearance_kept": all(sel.get("cloud_clearance_kept", True) for sel in selections),
        "airspace_transits": [t for sel, offset in zip(selections, offsets)
                              for t in shifted(sel.get("airspace_transits", []), ("along_track_nm",), offset)],
        "special_use": special_use,
        "freezing_level_ft": least("freezing_level_ft"),
        "freezing_level_at_or_below": any(sel.get("freezing_level_at_or_below") for sel in selections),
        "icing_possible": either("icing_possible"),
        "band_ceiling_ft": least("band_ceiling_ft"),
        "min_ceiling_ft": least("min_ceiling_ft"),
        "min_visibility_sm": least("min_visibility_sm"),
        "hazards": list({h.get("raw") or repr(h): h for sel in selections for h in sel.get("hazards", [])}.values()),
        "low_ceiling_or_visibility": either("low_ceiling_or_visibility"),
        "weather_unavailable": sorted({w for sel in selections for w in sel.get("weather_unavailable", [])}),
        "segments": [seg for sel, offset in zip(selections, offsets)
                     for seg in shifted(sel.get("segments", []), ("from_nm", "to_nm"), offset)],
        "mountainous": any(sel.get("mountainous") for sel in selections),
    }


def route_totals(per_hop: list[dict], hops: list) -> dict:
    """The trip's sums for a route that lands on the way, from each
    flight's own (flight_totals) -- each from one landing to the next --
    and each with its own fuel check: the tanks are filled at every
    stop, so one check over the whole trip would mean nothing -- the
    route's own fuel figures are left out, and `hops` holds each one's.
    A route with no landings on the way is its one flight's."""
    if len(per_hop) == 1:
        return per_hop[0]

    def total(key):
        values = [t[key] for t in per_hop]
        return None if any(v is None for v in values) else round(sum(values), 1)

    return {
        "distance_nm": round(sum(t["distance_nm"] for t in per_hop), 1),
        "procedure_nm": round(sum(t.get("procedure_nm", 0.0) for t in per_hop), 1),
        "ete_min": total("ete_min"),
        "fuel_gal": total("fuel_gal"),
        "unflyable_legs": sum(t["unflyable_legs"] for t in per_hop),
        "legs_without_wind": sum(t["legs_without_wind"] for t in per_hop),
        "night": _either(t.get("night") for t in per_hop),
        "rules": per_hop[0].get("rules", "vfr"),
        "alternate": per_hop[-1].get("alternate"),
        "planned_at": per_hop[0].get("planned_at"),
        "winds": per_hop[0].get("winds"),
        "hops": [{"departure": hop.dep_ident, "destination": hop.dest_ident, "totals": t} for hop, t in zip(hops, per_hop)],
    }
