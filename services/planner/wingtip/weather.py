"""Live weather for VFR altitude selection and dead-reckoning nav-log math:
winds/temps aloft (freezing level for icing avoidance, and wind_at_altitude
for wind-correction-angle math), forecast ceiling/visibility along the
route, current METARs, and SIGMET hazard advisories -- read from the copies
the weather service (services/weather) keeps in the weather store
(wingtip.weather_store), never fetched here (#535): no pilot's request
waits on aviationweather.gov or NOMADS.

The service fetches aviationweather.gov's cache files -- the complete
current national METARs, TAFs, SIGMETs, PIREPs and G-AIRMETs, gzipped,
regenerated every minute (TAFs every ten) -- rather than per-route API
queries, as their API terms ask heavy users to, and the winds and
temperatures aloft: the Aviation Weather Center's GFA winds the map draws,
by level and hour (wingtip.winds_aloft), and past their twelve hours the
GFS model at the old FB stations (wingtip.winds_stations), since the FB
ended with the NAM (NWS Service Change Notice 26-47). It parses each as it fetches it and stores
it with the time to which it may still be served by its product's own
validity (a TAF to the end of its valid period, an advisory to the end of
its own, a METAR as long as it is the latest heard, each report carrying
its own time): a copy past that is not read here, and the pilot is told
the product cannot be had. A failed fetch leaves the copy before it in
place, so an outage degrades to "the last forecast issued" with its age
said (dataset_status), rather than a failure per request.

The rules read over those products -- what a TAF says of a window, the
worst forecast along a route, the SIGMETs, PIREPs and G-AIRMETs it meets,
the freezing level and the wind and temperature at an altitude -- are the
engine's (engine/crates/weather/src/forecast, winds.rs; #482 phase 2),
asked by name through wingtip_native: this module reads the store and
asks.
"""

import logging
import time

import numpy as np

from . import geo, utc, weather_store
from .engine import ask as _ask
from .weather_asks import below_vfr_minimums as below_vfr_minimums, forecast_hour as forecast_hour, temperature_at as temperature_at
from .weather_asks import temperature_at_altitude as temperature_at_altitude, temperatures_aloft as temperatures_aloft
from .weather_asks import vfr_not_recommended_reasons as vfr_not_recommended_reasons
from .weather_asks import wind_at_altitude as wind_at_altitude, winds_period as winds_period
from .weather_status import _PRODUCT_WORDS, dataset_status as dataset_status, preload as preload, sources_status as sources_status

log = logging.getLogger(__name__)


class WeatherServiceError(RuntimeError):
    """A product the planner reads has no copy in the weather store that
    may still be served: the weather service could not fetch it from
    aviationweather.gov or NOMADS, or has not yet. Every reader here
    raises this one type, its message the product in a pilot's words, so
    callers (planner's route handlers) have one exception to catch
    whichever product is missing.
    """


# --- The freezing level (the winds and temperatures aloft: weather_asks) ---


def freezing_level(lat: float, lon: float, fcst_hr: str | None = None) -> dict | None:
    """Where the forecast temperatures over a place cross 0 degC, {"ft",
    "at_or_below"}: the engine's (winds.rs freezing_level). `at_or_below`
    where it is freezing at the lowest level already; None where the whole
    profile stays above freezing -- no freezing level in range, not
    unknown."""
    profile = temperatures_aloft(lat, lon, fcst_hr)
    if not profile:
        return None
    return _ask("freezing_level", profile=[list(p) for p in profile])


# --- Every product, read from the weather store ---


def _dataset(name: str):
    """Source `name` as the weather service last stored it, parsed. Raises
    WeatherServiceError, naming the product in a pilot's words, where the
    service has stored none or the copy is past its product's own validity
    (weather_store.servable): the map's problem banner and a stream's last
    line read it. Tells the service a pilot is planning, so it keeps the
    store at its full pace (weather_store.mark_asked)."""
    weather_store.mark_asked()
    record = weather_store.read(name)
    if not weather_store.servable(record):
        raise WeatherServiceError(f"{_PRODUCT_WORDS.get(name, name)} unavailable from aviationweather.gov just now")
    return record.data


# --- METAR ---


def reporting_idents() -> set:
    """Every station with a current METAR -- the fields a map can colour
    by their weather."""
    return set(_dataset("metars"))


def metar_for_idents(idents: list) -> dict:
    """{ident: {...}} for the latest METAR at each ident, or {ident: None}
    for one with nothing current (a small field with no reporting
    station)."""
    metars = _dataset("metars")
    return {ident: metars.get(ident) for ident in idents}


#: How far back a field's own METARs are read for the last wind it had, h.
RECENT_WIND_HOURS = 3


def recent_wind(ident: str) -> dict | None:
    """The wind of the newest of a field's own METARs of the last
    RECENT_WIND_HOURS with a direction and some speed, {"wind_dir_true_deg",
    "wind_speed_kt"}: the runway it favoured is the one in use when the wind
    has since dropped calm (wingtip.runway_wind.favoured_end), at the owner's
    ask ("when winds are calm just pick the currently used ... runway"). A
    design choice: a tower keeps its runway as the wind goes calm, and none
    of the FAA's data sets says a field's calm-wind runway. The weather
    service keeps each station's from the METARs it fetches
    ("recent-winds"). None with no such report, or none stored."""
    record = weather_store.read("recent-winds")
    held = (record.data or {}).get(ident) if record else None
    if not held or held.get("observed") is None or time.time() - held["observed"] > RECENT_WIND_HOURS * 3600:
        return None
    return {"wind_dir_true_deg": float(held["wind_dir_true_deg"]), "wind_speed_kt": float(held["wind_speed_kt"])}


#: The oldest report given as the nearest: METARs come hourly, so this
#: allows one missed cycle; the server keeps a held copy for hours when a
#: refresh fails, and an older report is not "current".
NEAREST_REPORT_MAX_AGE_S = 2 * 3600
#: How far the nearest report is looked for at all, as an EFB lists a
#: field's nearest METAR: about a quarter hour's flight in a light
#: airplane.
NEAREST_REPORT_NM = 30.0


def nearest_report(lat: float, lon: float, exclude: str | None = None, within_nm: float = NEAREST_REPORT_NM) -> dict | None:
    """The nearest station with a current METAR within `within_nm` of a
    point, for a field with no report of its own, as {"ident",
    "distance_nm", "bearing_deg" (true, from the point), "near" (within
    the engine's report_near, close enough to say the field's weather by it,
    approximately), "metar"}; None with none that close."""
    current = []
    for ident, report in _dataset("metars").items():
        s_lat, s_lon = report.get("lat"), report.get("lon")
        if ident == exclude or s_lat is None or s_lon is None or not np.isfinite([s_lat, s_lon]).all():  # NaN: argmin's least
            continue
        # Before the distance test, so an old near station does not hide a
        # current farther one; a report with no readable time is not known
        # to be current.
        observed = utc.epoch_or_none(report.get("observed_at"))
        if observed is None or time.time() - observed > NEAREST_REPORT_MAX_AGE_S:
            continue
        current.append((ident, report, s_lat, s_lon))
    if not current:
        return None
    # The engine's WGS-84 miles, every station in one call; argmin keeps the first of equals, as the loop did.
    miles = geo.distance_nm(lat, lon, *(np.array([c[k] for c in current], dtype=float) for k in (2, 3)))
    i = int(np.argmin(miles))
    nm, (ident, report, s_lat, s_lon) = float(miles[i]), current[i]
    if not nm <= within_nm:  # NaN too: a point with no position has no nearest
        return None
    return {
        "ident": ident,
        "distance_nm": round(nm, 1),
        "bearing_deg": round(geo.bearing_deg(lat, lon, s_lat, s_lon)),
        # Close enough to say the field's weather by, approximately: a
        # METAR's vicinity, the engine's report_near (FAA-H-8083-28B).
        "near": _ask("report_near", distance_nm=nm)["near"],
        "metar": report,
    }


# --- Ceiling/visibility, from the TAFs ---


def taf_for_idents(idents: list) -> dict:
    """{ident: {...}} for the current forecast period at each ident, or
    {ident: None} where no TAF is issued -- most fields have none: the
    worst it forecasts now (TEMPO and PROB groups included) and the
    prevailing period covering now, the engine's reading (taf_window).

    The mirror of metar_for_idents: the METAR is what it is doing now,
    this is what it is forecast to do. Both come out of the national cache
    files the weather service keeps, so asking for thirty stations costs
    no more than asking for one.
    """
    wanted = {i.upper() for i in idents}
    now = time.time()
    stations = {s["icaoId"]: s for s in _dataset("tafs") if s["icaoId"] in wanted}
    answer = {}
    for ident in idents:
        station = stations.get(ident.upper())
        if station is None:
            answer[ident] = None
            continue
        read = _ask("taf_window", fcsts=station["fcsts"], start=now)
        worst, period = read["worst"] or {}, read["current"] or {}
        answer[ident] = {
            "raw": station.get("raw"),
            "ceiling_ft": worst.get("ceiling_ft"),
            "ceiling_unknown": bool(worst.get("ceiling_unknown")),
            "visibility_sm": worst.get("visibility_sm"),
            "change": period.get("change") or "",
            "valid_from": period.get("timeFrom"),
            "valid_to": period.get("timeTo"),
        }
    return answer


def forecast_wind(lat: float, lon: float, at_unix: float, ident: str | None = None, within_nm: float = NEAREST_REPORT_NM) -> dict | None:
    """The wind forecast at a field for a time, from its own TAF (`ident`)
    or else the nearest station's within `within_nm` -- the reach the card
    takes a nearby METAR from (nearest_report) -- as {"ident",
    "distance_nm", "dir_true_deg" (None for VRB), "speed_kt", "gust_kt",
    "valid_from", "valid_to"}: the prevailing forecast then, the base or
    FM period covering it, or a BECMG that has begun by then (it lasts to
    the next change), never a TEMPO or PROB group. None where no TAF in
    reach covers that time, or the forecast gives no wind then."""
    stations = _dataset("tafs")
    own = next((s for s in stations if ident and s["icaoId"] == ident.upper()), None)
    if own is not None:
        best = (0.0, own)
    else:
        best = None
        for station in stations:
            nm = geo.distance_nm(lat, lon, station["lat"], station["lon"])
            if nm <= within_nm and (best is None or nm < best[0]):
                best = (nm, station)
    if best is None:
        return None
    nm, station = best
    # The prevailing forecast then, the engine's (taf_window's "prevailing").
    period = _ask("taf_window", fcsts=station["fcsts"], start=at_unix)["prevailing"]
    if period is None or period.get("wind_speed_kt") is None:
        return None
    return {
        "ident": station["icaoId"],
        "distance_nm": round(nm, 1),
        "dir_true_deg": period.get("wind_dir_true_deg"),
        "speed_kt": period["wind_speed_kt"],
        "gust_kt": period.get("wind_gust_kt"),
        "valid_from": period["timeFrom"],
        "valid_to": period["timeTo"],
    }


def _periods_in_window(fcsts: list, start: float, end: float) -> list:
    """Every period that says something about [start, end]: the engine's
    (taf_window's "periods"; a BECMG lasting past its own window)."""
    return _ask("taf_window", fcsts=fcsts, start=start, end=end)["periods"]


def _worst_in_window(fcsts: list, start: float, end: float) -> dict | None:
    """The lowest ceiling and visibility the TAF forecasts anywhere in
    [start, end], TEMPO and PROB groups included, any ceiling of no height,
    and whether the TAF "covers" the window: the engine's (taf_window's
    "worst"). None when the TAF says nothing about the window."""
    return _ask("taf_window", fcsts=fcsts, start=start, end=end)["worst"]


def ceiling_visibility_along_route(
    route_start: tuple, route_end: tuple, corridor_buffer_nm: float = 10.0, window: tuple | None = None
) -> dict:
    """Lowest forecast ceiling/visibility among TAF stations near the
    route, over `window` -- (start, end) in unix seconds, the flight from
    departure to arrival; now when not given: the engine's
    (tafs_along_route). TAFs are only issued for the larger fields, so a
    wider corridor (corridor_buffer_nm) is searched than the pilotage one.

    Returns {"min_ceiling_ft", "min_visibility_sm", "ceiling_unknown_at",
    "stations"}: the worst found nearby, the stations forecasting a
    ceiling of no height, and each station's own worst with where it is
    and its field's elevation, which wingtip.altitude keeps each leg's
    altitudes under the clouds with (14 CFR 91.155).
    """
    start, end = window if window else (time.time(), time.time())
    # Only the stations in the corridor's box are handed over, so the
    # national set is not written out for every leg; the engine holds them
    # to the same box.
    s, w, n, e = geo.corridor_bbox(route_start, route_end, corridor_buffer_nm)
    near = [t for t in _dataset("tafs") if s <= t["lat"] <= n and w <= t["lon"] <= e]
    return _ask(
        "tafs_along_route",
        tafs=near,
        **{"from": list(route_start), "to": list(route_end)},
        corridor_nm=corridor_buffer_nm,
        start=start,
        end=end,
    )


def tafs_over(windows: dict) -> dict:
    """Each station's TAF read over a window of its own -- {icaoId:
    (start, end)} in unix seconds, around when the flight gets there --
    as {icaoId: {"ceiling_ft", "ceiling_unknown", "visibility_sm", "covers",
    "raw"}}: the worst it forecasts then and whether the TAF covers the
    whole window (_worst_in_window), and the forecast as issued. Figures None where the TAF says nothing about its window; a
    station with no TAF held is left out."""
    if not windows:
        return {}
    found = {}
    for station in _dataset("tafs"):
        window = windows.get(station["icaoId"])
        if window is None:
            continue
        nothing = {"ceiling_ft": None, "ceiling_unknown": False, "visibility_sm": None, "covers": False}
        found[station["icaoId"]] = {**(_worst_in_window(station["fcsts"], *window) or nothing), "raw": station.get("raw")}
    return found


# --- SIGMET hazards ---


def hazards_along_route(route_start: tuple, route_end: tuple, corridor_buffer_nm: float = 25.0) -> list:
    """The SIGMETs in force now whose area the route line crosses: the
    engine's (sigmets_along_route). CONUS AIRMETs gave way to G-AIRMETs in
    January 2025 (gairmet_snapshots_along_route). Each keeps its valid
    times, issue and area ("coords", [[lat, lon]]), for the briefing to say
    where and when the flight meets it."""
    return _ask(
        "sigmets_along_route",
        advisories=_dataset("airsigmets"),
        **{"from": list(route_start), "to": list(route_end)},
        corridor_nm=corridor_buffer_nm,
        now=time.time(),
    )


# --- PIREPs ---


def pireps_along_route(path: list, corridor_nm: float | None = None) -> list:
    """The pilot reports of the last 90 minutes, at or under 18,000 ft,
    within `corridor_nm` (the engine's 30 where not given) of the route
    flown through `path` [(lat, lon)], urgent ones first, then in route
    order: the engine's (pireps_along_route). Each {"observed_at", "lat",
    "lon", "altitude_ft", "aircraft", "urgent", "turbulence", "icing",
    "raw", "along_track_nm"}."""
    return _ask("pireps_along_route", reports=_dataset("pireps"), path=[list(p) for p in path], corridor_nm=corridor_nm, now=time.time())


def pireps_in_box(box: tuple, now: float | None = None) -> list:
    """The PIREPs still told (the engine's pireps_in_box) in a box (south,
    west, north, east), the urgent last, so they are drawn on top."""
    return _ask("pireps_in_box", reports=_dataset("pireps"), box=list(box), now=time.time() if now is None else now)


# --- G-AIRMETs ---

# The G-AIRMET hazards a VFR flight is told of, code to words, and how near
# some time of the flight a snapshot is told (seconds): the engine's
# (forecast/awc.rs; FAA-H-8083-28B 26.3.1.1).
_GAIRMET = _ask("gairmet_hazards")
GAIRMET_HAZARDS: dict = _GAIRMET["hazards"]
GAIRMET_SNAPSHOT_S: int = _GAIRMET["snapshot_s"]


def gairmet_snapshots_along_route(path: list, window: tuple) -> list:
    """Every G-AIRMET snapshot (IFR, mountain obscuration, low-level
    turbulence, icing, wind shear, strong surface winds) whose area the
    route flown through `path` [(lat, lon)] crosses, valid at some time of
    the flight `window` (start, end; UNIX seconds) give or take
    GAIRMET_SNAPSHOT_S: the engine's (gairmets_along_route), for the
    briefing to pick each hazard's snapshot for when the flight is in it."""
    start, end = window
    return _ask("gairmets_along_route", advisories=_dataset("gairmets"), path=[list(p) for p in path], start=start, end=end)
