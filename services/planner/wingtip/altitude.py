"""The cruising altitude for a route: the data it is chosen from, read here
and handed to the engine (wingtip_engine::altitude, #482 phase 3), which
holds every rule -- the floor's clearances (14 CFR 91.119, 91.177), the
band under Class B, the clouds (91.155) and the service ceiling, the
cruising altitudes by course (91.159, 91.179(b)), the recommendation and
the icing. This module reads the floors (wingtip.terrain, wingtip.ifr), the
Class B shelves and transits (wingtip.airspace), special-use airspace
(wingtip.sua), the variation and the weather, all at once, and asks.

Given the nav log's fixes, the band is worked out leg by leg
(`segments`), so a route can step down under a Class B shelf and climb
again past it rather than fly the whole way at the lowest altitude the
lowest shelf allows -- wingtip.navlog.altitude_profiles turns those per-leg
bands into the lowest, highest, fastest and economical plans.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from itertools import pairwise

from . import airspace, ifr, procedure_legs, sua, terrain, weather
from .engine import ask as engine
from .geo import along_track_distance_nm, distance_nm
from .magnetic import magnetic_variation_deg
from .terrain import DEFAULT_FAA_CACHE_DIR

log = logging.getLogger(__name__)


def _timed(label: str, fn, pending: set | None = None):
    """Wraps one of select_cruise_altitude's concurrent calls so its own
    wall time is logged on completion.

    The seven calls below run in parallel, so timing a bare .result()
    call in the order this function happens to read them tells you how
    long the caller waited for whichever one it read first -- not which
    one was actually slow. This times each task against its own start,
    from inside the thread that ran it.

    Added after this codebase went looking for a request that was slow
    for real (2026-09-23, /api/class-b -- a different function, but the
    same class of problem: no per-stage timing anywhere meant twenty
    minutes of manual `docker exec` probing to find which single call
    accounted for it). Plain log lines, not a metrics backend: this
    project has neither Prometheus nor StatsD, and reaching for one
    before there is a single measurement to justify it would be the
    thing this project's own audits keep finding and undoing elsewhere.

    `pending`, when given, holds the labels of the calls still running,
    so a caller waiting on a slow selection can say which part it is
    waiting on rather than guess.
    """

    def wrapped(*args, **kwargs):
        started = time.time()
        if pending is not None:
            pending.add(label)
        try:
            return fn(*args, **kwargs)
        finally:
            if pending is not None:
                pending.discard(label)
            log.info("select_cruise_altitude: %s took %.2fs", label, time.time() - started)

    return wrapped


def _service_ceiling_ft(aircraft_profile: dict | None, a: tuple, b: tuple, fcst_hr: str, temperatures: bool) -> float | None:
    """The profile's service ceiling as an altitude over the leg from a
    to b: a density altitude -- the height where the best climb has
    fallen to 100 fpm on any day -- found in the forecast temperatures
    at the leg's midpoint, to the nearest 100 ft: the engine's
    service_ceiling_on_the_day (wingtip_flight::performance). The book
    figure, a standard day's, where there are none: `temperatures` False
    (the forecast could not be read), or no station near. None with no
    airplane (`aircraft_profile` None): no ceiling of its own, the band
    then the rules' and the airspace's (the engine's select_cruise_altitude)."""
    # A pilot's own airplane whose record gives no ceiling has none: the
    # band is then the rules' and the airspace's, as with no airplane.
    if aircraft_profile is None or aircraft_profile.get("service_ceiling_ft") is None:
        return None
    book_ft = float(aircraft_profile["service_ceiling_ft"])
    if not temperatures:
        return book_ft
    try:
        profile = weather.temperatures_aloft((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, fcst_hr)
    except weather.WeatherServiceError:
        return book_ft
    if not profile:
        return book_ft
    return float(engine("service_ceiling_on_the_day", book_ft=book_ft, profile=[list(p) for p in profile]))


def select_cruise_altitude(
    route_start: tuple,
    route_end: tuple,
    aircraft_profile: dict,
    faa_cache_dir=DEFAULT_FAA_CACHE_DIR,
    fixes: list | None = None,
    fcst_hr: str = "06",
    pending: set | None = None,
    window: tuple | None = None,
    class_b_cleared: bool = False,
    rules: str = "vfr",
    airway: dict | None = None,
    paths: tuple = (),
) -> dict:
    """Returns a dict with the recommended altitude (None if no legal VFR
    altitude exists for this route/aircraft) plus the floor/ceiling
    components and weather go/no-go flags that produced it.

    `rules` "ifr" plans the flight under IFR instead (wingtip.ifr): each leg's
    floor is 14 CFR 91.177(a)(2)'s minimum IFR altitude, 1,000 ft (2,000
    over a mountainous area) above the highest obstacle within 4 nm of its
    course; its altitudes are 91.179(b)'s and ATC's by direction of flight,
    odd or even thousands; and neither Class B, the clouds nor Class A caps
    them -- an IFR clearance takes the flight into all three. Only the
    service ceiling and prohibited airspace do. `airway`, the published
    altitudes of the airway segment the hop is flown along (wingtip.airways):
    under IFR its MEA is the floor (91.177(a)(1)) and its MAA a ceiling.

    `fixes`, the nav log's (lat, lon) fixes from departure to destination,
    adds `segments`: the floor, ceiling and legal altitudes of each leg
    between them, for the stepped plans. Without them the route is one
    segment, as it always was. `paths`, the legs flown along a departure's,
    an arrival's or an approach's path (wingtip.procedure_legs.paths_by_hop):
    each such leg's floor is the highest over its own line and the path's
    pieces, the ground the airplane flies over (the aviation audit's AV-2).
    `fcst_hr` picks the winds/temperatures
    forecast period the freezing level is read from (see
    wingtip.weather.forecast_hour). `pending`, when given, holds the stages
    still running while this works (see _timed). `window`, (start, end)
    in unix seconds, is the flight from departure to past arrival that
    the go/no-go forecast is read over; now when not given.
    `class_b_cleared`: the pilot will have a Class B clearance, so its
    shelves are no ceiling -- the route is planned through it, and its
    transits still say it takes a clearance.

    The freezing level no longer caps the band. Icing needs visible
    moisture as well as cold, so a hard ceiling at the freezing level
    was wrong both ways: it forbade clear winter air, and said nothing
    about cloud. It is reported instead, with `icing_possible` where a
    legal altitude reaches it and cloud or an icing AIRMET is forecast.

    So does the aeroplane's service ceiling, where it is in the forecast
    air: a service ceiling is a density altitude, so a warm day brings
    it down and a cold one lifts it (_service_ceiling_ft), leg by leg.

    The clouds do cap it: each leg keeps 14 CFR 91.155's distance below
    the lowest ceiling the TAFs near it forecast for the flight
    (highest_under_clouds_ft), where the forecast ceiling was only
    reported before. The whole route's band keeps under the lowest of
    them, as it does under the lowest shelf. Where the clouds leave a
    leg no altitude at all, the leg keeps its band without them and
    says so (`cloud_clearance_kept` False): a forecast is a reason to
    warn, and a nav log refused for it could not be looked at for a
    later departure either.
    """

    def timed(label, fn):
        return _timed(label, fn, pending)

    total_nm = distance_nm(*route_start, *route_end)
    # Along-track breakpoints for the segments' from_nm and to_nm: the
    # fixes' own positions projected onto the direct line, pinned to the
    # route's ends. The VFR floor itself is read under each leg flown
    # (terrain.floor_profile's `fixes`), not under this line.
    breaks_nm = [0.0, total_nm]
    if fixes and len(fixes) > 2:
        inner = [along_track_distance_nm(lat, lon, route_start, route_end) for lat, lon in fixes[1:-1]]
        breaks_nm = [0.0] + [min(max(b, 0.0), total_nm) for b in inner] + [total_nm]

    # ensure_class_airspace_shapefile runs first, on its own -- both
    # airspace calls below need its result, so there's nothing to gain
    # running it alongside them. Everything after it (terrain, the two
    # airspace queries, and three separate aviationweather.gov calls)
    # is independent of the others, and summing three external round
    # trips instead of overlapping them was the real reason this step
    # felt slow -- the same issue, and the same fix, as /api/briefing.
    request_started = time.time()
    shp_path = timed("airspace.ensure_class_airspace_shapefile", airspace.ensure_class_airspace_shapefile)(faa_cache_dir)
    mid_lat = (route_start[0] + route_end[0]) / 2
    mid_lon = (route_start[1] + route_end[1]) / 2

    under_ifr = rules == "ifr"
    # On an airway its MEA is the floor (14 CFR 91.177(a)(1)), which the
    # engine takes from the airway itself: no ground or obstacles to read.
    on_airway = (
        under_ifr
        and airway is not None
        and engine("airway_floor_ft", mea_ft=airway.get("mea_ft"), gnss_mea_ft=airway.get("gnss_mea_ft")) is not None
    )
    with ThreadPoolExecutor(max_workers=5) as pool:
        floor_future = (
            None
            if on_airway
            else pool.submit(timed("ifr.floor_profile", ifr.floor_profile), fixes or [route_start, route_end], faa_cache_dir)
            if under_ifr
            else pool.submit(
                timed("terrain.floor_profile", terrain.floor_profile),
                route_start,
                route_end,
                breaks_nm,
                faa_cache_dir=faa_cache_dir,
                fixes=fixes,
            )
        )
        # The legs flown, or the direct line as the one leg: one path
        # for the Class B rule, where two functions of different shapes
        # used to be chosen between and the answer coerced back. Under
        # IFR no shelf is a ceiling: the clearance takes the flight in.
        airspace_future = (
            None
            if class_b_cleared or under_ifr
            else pool.submit(
                timed("airspace.airspace_ceiling_profile", airspace.airspace_ceiling_profile),
                route_start,
                route_end,
                fixes or [route_start, route_end],
                shp_path,
            )
        )
        # Class C/D along the way are not a ceiling -- two-way comms is
        # all they take -- but a pilot still wants to know they are coming.
        transits_future = pool.submit(
            timed("airspace.airspace_transits", airspace.airspace_transits), route_start, route_end, shp_path, fixes=fixes
        )
        # Special-use airspace (prohibited and restricted areas, MOAs):
        # not in the Class B/C/D shapefile, so asked of the FAA's own
        # feature service along the legs.
        sua_future = pool.submit(timed("sua.along_route", sua.along_route), route_start, route_end, fixes)
        variation_future = pool.submit(timed("magnetic_variation_deg", magnetic_variation_deg), mid_lat, mid_lon)
        freezing_future = pool.submit(timed("weather.freezing_level", weather.freezing_level), mid_lat, mid_lon, fcst_hr)
        cv_future = pool.submit(
            timed("weather.ceiling_visibility_along_route", weather.ceiling_visibility_along_route), route_start, route_end, window=window
        )
        hazards_future = pool.submit(timed("weather.hazards_along_route", weather.hazards_along_route), route_start, route_end)

        # Terrain and airspace are structural safety inputs -- without
        # them there is no floor/ceiling to recommend an altitude from at
        # all, so those two still propagate a failure normally. The three
        # aviationweather.gov calls are live current-conditions context on
        # top of that: a slow bbox query there returning a 504 (observed
        # 2026-09-18, ~30s before the error surfaced) used to take the
        # whole recommendation down with it even though terrain/airspace
        # had already succeeded. Each is now caught on its own and
        # recorded in weather_unavailable instead -- callers get a real
        # recommendation with a note about what's missing, not a rewritten
        # icing/ceiling/hazard verdict pretending the missing source
        # means "no concern found."
        floors = floor_future.result() if floor_future else []
        # The ground under a procedure flown in a leg's place, read as the
        # leg's own is: the VFR floor's terrain and obstacles, or IFR's.
        floors = procedure_legs.floors_along(
            floors,
            paths,
            (lambda pts: ifr.floor_profile(pts, faa_cache_dir))
            if under_ifr
            else lambda pts: terrain.floor_profile(
                pts[0], pts[-1], [0.0, distance_nm(*pts[0], *pts[-1])], faa_cache_dir=faa_cache_dir, fixes=pts
            ),
        )
        airspace_ceilings_ft = airspace_future.result() if airspace_future else [None] * (len(fixes) - 1 if fixes else 1)
        transits = transits_future.result()
        # The hemispheric rule is written for magnetic course, and the
        # variation is the World Magnetic Model's (wingtip.magnetic), worked
        # out here with no network call.
        variation_deg = variation_future.result()

        weather_unavailable = []
        try:
            freezing = freezing_future.result()
        except weather.WeatherServiceError:
            freezing = None
            weather_unavailable.append("freezing_level")
        try:
            cv = cv_future.result()
        except weather.WeatherServiceError:
            cv = {"min_ceiling_ft": None, "min_visibility_sm": None, "stations": []}
            weather_unavailable.append("ceiling_visibility")
        try:
            hazards = hazards_future.result()
        except weather.WeatherServiceError:
            hazards = []
            weather_unavailable.append("hazards")
        try:
            special_use = sua_future.result()
        except sua.SpecialUseUnavailable:
            special_use = []
            weather_unavailable.append("special_use")

    legs = list(pairwise(fixes)) if fixes else [(route_start, route_end)]
    # Each leg's service ceiling in the air over it -- the book figure
    # where the temperatures aloft could not be read with the freezing
    # level (a performance figure, #482 phase 4).
    service_ceilings_ft = [
        _service_ceiling_ft(aircraft_profile, a, b, fcst_hr, "freezing_level" not in weather_unavailable) for a, b in legs
    ]
    # Each leg's magnetic variation at its midpoint, for its own course:
    # 14 CFR 91.159 goes by the course flown.
    leg_variations_deg = [magnetic_variation_deg((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) for a, b in legs] if fixes else []

    # The rules -- each leg's band under the shelf, the clouds (91.155) and
    # the service ceiling, its cruising altitudes by course (91.159,
    # 91.179(b)), the recommendation and the icing -- are the engine's
    # (wingtip_engine::altitude), the phones' and the web's same.
    selection = engine(
        "select_cruise_altitude",
        start=list(route_start),
        end=list(route_end),
        fixes=[list(f) for f in fixes] if fixes else None,
        breaks_nm=breaks_nm,
        rules="ifr" if under_ifr else "vfr",
        class_b_cleared=class_b_cleared,
        floors=floors,
        airway=airway if on_airway else None,
        airspace_ceilings_ft=airspace_ceilings_ft,
        service_ceilings_ft=service_ceilings_ft,
        variation_deg=variation_deg,
        leg_variations_deg=leg_variations_deg,
        stations=[{k: st.get(k) for k in ("icaoId", "lat", "lon", "ceiling_ft", "elevation_ft")} for st in cv["stations"]],
        min_ceiling_ft=cv["min_ceiling_ft"],
        special_use=special_use,
        freezing=freezing,
        hazards=[{"hazard": h.get("hazard")} for h in hazards],
        weather_unavailable=weather_unavailable,
    )

    # None (not False) when ceiling_visibility_along_route itself failed --
    # "unknown" must not read as "confirmed VFR-favorable" to a caller
    # deciding whether to flag the route.
    low_ceiling_vis = (
        None if "ceiling_visibility" in weather_unavailable else (weather.below_vfr_minimums(cv["min_ceiling_ft"], cv["min_visibility_sm"]))
    )

    log.info("select_cruise_altitude: %.2fs total", time.time() - request_started)

    return {
        **selection,
        "airspace_transits": transits,
        "special_use": special_use,
        "min_ceiling_ft": cv["min_ceiling_ft"],
        "min_visibility_sm": cv["min_visibility_sm"],
        "hazards": hazards,
        "low_ceiling_or_visibility": low_ceiling_vis,
        "weather_unavailable": weather_unavailable,
    }
