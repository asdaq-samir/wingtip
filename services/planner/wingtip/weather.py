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
temperatures aloft from the GFS model since the FB ended with the NAM (NWS
Service Change Notice 26-47). It parses each as it fetches it and stores
it with the time to which it may still be served by its product's own
validity (a TAF to the end of its valid period, an advisory to the end of
its own, a METAR as long as it is the latest heard, each report carrying
its own time): a copy past that is not read here, and the pilot is told
the product cannot be had. A failed fetch leaves the copy before it in
place, so an outage degrades to "the last forecast issued" with its age
said (dataset_status), rather than a failure per request.

The rules read over those products -- the ceiling, the flight category,
the basic VFR minimums -- are the engine's (wingtip_native).
"""
import json
import logging
import time
from datetime import datetime
from itertools import pairwise

import numpy as np
import wingtip_native

from . import weather_store
from .performance import isa_temp_c

log = logging.getLogger(__name__)


class WeatherServiceError(RuntimeError):
    """A product the planner reads has no copy in the weather store that
    may still be served: the weather service could not fetch it from
    aviationweather.gov or NOMADS, or has not yet. Every reader here
    raises this one type, its message the product in a pilot's words, so
    callers (planner's route handlers) have one exception to catch
    whichever product is missing.
    """


# --- Winds and temperatures aloft, and the freezing level, from the GFS ---


def _fd_stations(fcst_hr: str = "06") -> dict:
    """The winds and temperatures aloft for one period, as the weather
    service stored them ("winds-06", "-12", "-24"): the GFS's levels at the
    old FB stations. The three altitude plans look the winds up at every
    legal altitude of every leg -- well over a hundred lookups for one
    route -- so the record is turned into an FdStations once per copy,
    never per lookup. The FB itself is gone (NWS Service Change Notice
    26-47: its bulletins ended with the NAM at 1200Z on 3 Nov 2026), so
    these are the winds aloft, said to be modelled wherever they are
    shown. WeatherServiceError, in a pilot's words, where no copy inside
    its own window is held (the record's `until`, the engine's rule for
    when a winds forecast stops counting, validity.rs)."""
    weather_store.mark_asked()
    record = weather_store.read(f"winds-{fcst_hr}")
    if not weather_store.servable(record):
        raise WeatherServiceError("Winds aloft (GFS model) unavailable from NOAA just now")
    held = _FD.get(fcst_hr)
    if held is not None and held[0] is record:
        return held[1]
    out = FdStations({code: {int(alt): level for alt, level in levels.items()}
                      for code, levels in record.data["stations"].items()})
    out.period = record.data["period"]
    out.modelled = True
    _FD[fcst_hr] = (record, out)
    return out


# Each period's FdStations, made once per record: fcst_hr -> (record, stations).
_FD: dict = {}


class FdStations(dict):
    """The winds and temperatures aloft at each station ({station_id:
    {altitude_ft: {"wind_dir_true_deg", "wind_speed_kt", "temp_c"}}}), and
    the period they are for: `period` is {"valid_at", "use_from",
    "use_to", "run", "forecast_hour"}, ISO UTC and the GFS forecast hour
    (services/weather/app/gfs.py's period_of)."""

    period: dict | None = None
    #: Model output, not an issued forecast: always so since the FB ended.
    modelled: bool = False


# The FD stations' own rows of the airports table, per set of station
# ids: filtering 80,000 rows for the same two hundred stations on every
# wind lookup was the other half of what a plan cost.
_STATION_ROWS: dict = {}


def _station_rows(station_ids, airports_df):
    key = (frozenset(station_ids), id(airports_df))
    rows = _STATION_ROWS.get(key)
    if rows is None:
        # local_code isn't globally unique (e.g. "MSP" also matches
        # airports in Argentina and Colombia by coincidence) -- FD
        # stations are US-only, so restrict the match accordingly.
        candidates = airports_df[airports_df["local_code"].isin(station_ids) & (airports_df["iso_country"] == "US")]
        rows = (
            candidates["local_code"].to_numpy(),
            np.radians(candidates["latitude_deg"].to_numpy(dtype=float)),
            np.radians(candidates["longitude_deg"].to_numpy(dtype=float)),
        )
        _STATION_ROWS[key] = rows
    return rows


def _nearest_station(lat: float, lon: float, station_ids, airports_df) -> str | None:
    codes, lats, lons = _station_rows(station_ids, airports_df)
    if len(codes) == 0:
        return None
    # Great-circle distance to every station at once, the same formula
    # as wingtip.geo.distance_nm; the radius cancels out of an argmin.
    lat0, lon0 = np.radians(lat), np.radians(lon)
    a = np.sin((lats - lat0) / 2) ** 2 + np.cos(lat0) * np.cos(lats) * np.sin((lons - lon0) / 2) ** 2
    return str(codes[int(np.argmin(a))])


def temperatures_aloft(lat: float, lon: float, fcst_hr: str = "06") -> list:
    """The nearest station's forecast temperatures, [(altitude_ft,
    temp_c)] from the lowest level up -- the GFS's 925 hPa, about 2,500 ft
    (services/weather/app/gfs.py), each at its own height. Empty where no station
    is found or it reports no temperature."""
    from . import airports

    stations = _fd_stations(fcst_hr)
    station_id = _nearest_station(lat, lon, set(stations.keys()), airports.load_airports())
    if station_id is None:
        return []
    return sorted((float(alt), v["temp_c"]) for alt, v in stations[station_id].items() if v["temp_c"] is not None)


def temperature_at(profile: list, altitude_ft: float) -> float | None:
    """The temperature at `altitude_ft` from a temperatures_aloft
    profile: interpolated between the reported altitudes either side of
    it, and past the ends the nearest one's difference from a standard
    day kept -- the standard lapse rate, all there is to go on below the
    lowest report. None for an empty profile."""
    if not profile:
        return None
    if altitude_ft <= profile[0][0] or altitude_ft >= profile[-1][0]:
        alt, temp = profile[0] if altitude_ft <= profile[0][0] else profile[-1]
        return temp + isa_temp_c(altitude_ft) - isa_temp_c(alt)
    for (alt1, t1), (alt2, t2) in pairwise(profile):
        if alt1 <= altitude_ft <= alt2:
            return t1 + (altitude_ft - alt1) / (alt2 - alt1) * (t2 - t1)
    return None


def temperature_at_altitude(lat: float, lon: float, altitude_ft: float, fcst_hr: str = "06") -> float | None:
    """The forecast temperature at `altitude_ft` near (lat, lon), from
    the nearest station (temperature_at). None where there is none: a
    standard day then, assumed rather than known."""
    return temperature_at(temperatures_aloft(lat, lon, fcst_hr), altitude_ft)


def freezing_level(lat: float, lon: float, fcst_hr: str = "06") -> dict | None:
    """Where the nearest station's forecast temperature profile crosses
    0 degC: {"ft", "at_or_below"}, by linear interpolation between the two
    bracketing reported altitudes. None if the whole reported profile
    stays above freezing (no icing concern in range) -- "no freezing
    level in range", not "unknown".

    `at_or_below` is true when it is already at or below 0 degC at the
    lowest level (the GFS's 925 hPa) -- so the freezing level is that
    altitude or lower, somewhere the data cannot say. This used to return
    the lowest altitude as though it were the freezing level and call it
    conservative, which let everything under it pass as above freezing on
    exactly the coldest days.
    """
    profile = temperatures_aloft(lat, lon, fcst_hr)
    if not profile:
        return None
    if profile[0][1] <= 0:
        return {"ft": float(profile[0][0]), "at_or_below": True}

    for (alt1, t1), (alt2, t2) in zip(profile, profile[1:]):
        if t1 > 0 and t2 <= 0:
            frac = t1 / (t1 - t2)
            return {"ft": alt1 + frac * (alt2 - alt1), "at_or_below": False}
    return None


def _interp_circular_deg(d1: float, d2: float, frac: float) -> float:
    """Interpolate a compass direction between d1 and d2 the short way
    around the circle (e.g. 350deg -> 010deg goes through 000, not back
    through 180) -- a plain linear interpolation would get that wrong.
    """
    diff = ((d2 - d1 + 180) % 360) - 180
    return (d1 + frac * diff) % 360


def winds_period(fcst_hr: str = "06") -> dict | None:
    """The period the winds a plan flies are for (FdStations.period), with
    `modelled`, for the screens to say whose winds they are: None where
    they cannot be had."""
    try:
        stations = _fd_stations(fcst_hr)
    except WeatherServiceError:
        return None
    period = getattr(stations, "period", None)
    return {**period, "modelled": stations.modelled} if period else None


def wind_at_altitude(lat: float, lon: float, altitude_ft: float, fcst_hr: str = "06") -> dict | None:
    """Wind (true direction/speed) at altitude_ft, from the nearest FD
    station's reported profile -- linearly interpolated between the two
    bracketing reported altitudes, or clamped to the nearest end if
    altitude_ft falls outside the reported range. "Light and variable"
    (direction not meaningful) reports are excluded from the profile
    rather than guessed; if that leaves no usable profile, or no station
    is found nearby, returns None -- callers should treat that as "no
    wind data available," not "calm."
    """
    from . import airports

    stations = _fd_stations(fcst_hr)
    airports_df = airports.load_airports()
    station_id = _nearest_station(lat, lon, set(stations.keys()), airports_df)
    if station_id is None:
        return None
    return wind_in_levels(stations[station_id], altitude_ft)


def wind_stations(fcst_hr: str = "06") -> tuple:
    """Every FD station's levels and where it is: (ids, lats, lons in
    degrees, [levels]) -- for reading the winds over a whole grid at once
    (wingtip.route_options), where wind_at_altitude finds the nearest station
    for one point."""
    from . import airports

    stations = _fd_stations(fcst_hr)
    codes, lats, lons = _station_rows(set(stations.keys()), airports.load_airports())
    return codes, np.degrees(lats), np.degrees(lons), [stations[str(c)] for c in codes]


def wind_in_levels(levels: dict, altitude_ft: float) -> dict | None:
    """One FD station's wind at altitude_ft from its levels ({altitude:
    {"wind_dir_true_deg", "wind_speed_kt", ...}}), as wind_at_altitude
    reads it: interpolated between the levels either side, clamped at the
    ends, light and variable left out; None with no usable level."""
    profile = sorted(
        (alt, v["wind_dir_true_deg"], v["wind_speed_kt"])
        for alt, v in levels.items()
        if v["wind_dir_true_deg"] is not None
    )
    if not profile:
        return None

    if altitude_ft <= profile[0][0]:
        _, d, s = profile[0]
        return {"wind_dir_true_deg": d, "wind_speed_kt": s}
    if altitude_ft >= profile[-1][0]:
        _, d, s = profile[-1]
        return {"wind_dir_true_deg": d, "wind_speed_kt": s}

    for (alt1, d1, s1), (alt2, d2, s2) in zip(profile, profile[1:]):
        if alt1 <= altitude_ft <= alt2:
            frac = (altitude_ft - alt1) / (alt2 - alt1) if alt2 != alt1 else 0.0
            return {
                "wind_dir_true_deg": _interp_circular_deg(d1, d2, frac),
                "wind_speed_kt": s1 + frac * (s2 - s1),
            }
    return None


# --- Every product, read from the weather store ---

# Each source as a pilot knows it, for the line said when it cannot be had.
_PRODUCT_WORDS = {
    "metars": "METARs", "tafs": "TAFs", "airsigmets": "AIRMETs and SIGMETs", "pireps": "PIREPs",
    "gairmets": "G-AIRMETs",
}

#: The reports and advisories, each a cache file of aviationweather.gov's.
_CACHE_SOURCES = ("metars", "tafs", "airsigmets", "pireps", "gairmets")


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


def preload() -> None:
    """Every product read from the store now, so the first plan after a
    restart finds each decoded rather than decoding it (a stat after)."""
    for name in (*_CACHE_SOURCES, *(f"winds-{hr}" for hr in weather_store.WIND_PERIODS)):
        weather_store.read(name)


def dataset_status() -> dict[str, float | None]:
    """When each source's stored copy was fetched, None for one not held --
    what the Dev console (/api/status) and the map's layer ages
    (/api/map/ages) show as the weather's age. A copy served on through
    an outage keeps its own fetch time, so the age said grows with it. The
    winds aloft, the GFS's, are "winds-06", "winds-12" and "winds-24", by
    period."""
    out = {}
    for name in (*_CACHE_SOURCES, *(f"winds-{hr}" for hr in weather_store.WIND_PERIODS)):
        record = weather_store.read(name)
        out[name] = record.fetched_at if record else None
    return out


def _failing(name: str, record) -> bool:
    """Whether the service's last try for a newer copy than the one held failed."""
    tried = weather_store.attempt(name)
    return bool(tried and tried.get("error") and (record is None or tried["attempted"] >= record.fetched_at))


def sources_status() -> list[dict]:
    """Each source as the pilot's Status page lists it: its name in a
    pilot's words, when the copy held was fetched, to when that copy may
    still be served (its product's own validity, the record's `until`),
    and whether the service's last ask for a newer one failed -- the copy
    held then served on (UNIX seconds; None where there is none)."""
    out = []
    for name in _CACHE_SOURCES:
        record = weather_store.read(name)
        out.append({
            "name": _PRODUCT_WORDS.get(name, name),
            "fetched_at": record.fetched_at if record else None,
            # No limit (METARs, each carrying its own time) is None.
            "kept_until": record.until if record else None,
            "failing": _failing(name, record),
        })
    # The winds aloft, the GFS's, each period held to the end of its own window.
    for hr in weather_store.WIND_PERIODS:
        record = weather_store.read(f"winds-{hr}")
        out.append({
            "name": f"Winds aloft, modelled (GFS), {int(hr)}-hour",
            "fetched_at": record.fetched_at if record else None,
            "kept_until": record.until if record else None,
            "failing": _failing(f"winds-{hr}", record),
        })
    return out



def _unix(iso: str | None) -> float | None:
    """2026-09-20T01:41:00.000Z -> seconds since the epoch."""
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None



def _sky_ceiling(period: dict) -> tuple[float | None, bool]:
    """The ceiling and whether it is not known: the lowest broken,
    overcast or obscured layer -- FEW/SCT don't count as a ceiling by the
    FAA's own definition (14 CFR 1.1) -- an obscured sky's at its vertical
    visibility: the engine's (metar.rs `sky_ceiling_of`, its
    `sky_ceiling`). The feed marks an obscured layer `OVX`, with the
    height as the layer's base in a METAR and only as `vert_vis_ft` in a
    TAF.

    A layer the station could not measure ("OVC///", "VV///") comes in
    the AWC's data API with no base (its `sky_condition` has no
    `cloud_base_ft_agl`; the JSON gives `"base": null`). Where that is
    the lowest broken, overcast or obscured layer the ceiling is not
    known -- it could be on the ground -- so it is (None, True), never
    (None, False), which would read as no ceiling at all and let an
    "OVC/// 10SM" station pass as VFR."""
    layers = [{"cover": c.get("cover"), "base_ft": c.get("base")} for c in period.get("clouds", [])]
    found = json.loads(wingtip_native.call("sky_ceiling", json.dumps({"layers": layers, "vert_vis_ft": period.get("vert_vis")})))
    ceiling = found["ceiling_ft"]
    # A base as the feed gives it, whole feet.
    return (int(ceiling) if isinstance(ceiling, float) and ceiling.is_integer() else ceiling), found["ceiling_unknown"]


def _ceiling_ft(period: dict) -> float | None:
    """The ceiling (_sky_ceiling), None where there is none or it is not
    known."""
    return _sky_ceiling(period)[0]


def _report_category(ceiling_ft: float | None, ceiling_unknown: bool, visibility_sm: float | None) -> str | None:
    """A report's flight category, the engine's (AC 00-45H; metar.rs
    `flight_category_of`): with the ceiling not known only what the
    visibility settles -- LIFR under a mile -- else None."""
    return json.loads(wingtip_native.call("report_flight_category", json.dumps(
        {"ceiling_ft": ceiling_ft, "ceiling_unknown": ceiling_unknown, "visibility_sm": visibility_sm})))


def _visibility_sm(period: dict) -> float | None:
    visib = period.get("visib")
    if visib is None:
        return None
    try:
        return float(str(visib).rstrip("+"))
    except ValueError:
        return None


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



#: How far a station's report is said of a field, approximately: a design
#: choice, not a rule. AC 00-45H (Aviation Weather Services) takes a METAR's
#: "VC" to be 5 to 10 statute miles from the station for the phenomena it
#: reports, and does not say a station's flight category holds at another
#: field; the top of that range is where the card's "≈" chip stops, and
#: farther only the report and how far it is are given.
NEAR_REPORT_SM = 10.0
#: The oldest report given as the nearest: METARs come hourly, so this
#: allows one missed cycle; the server keeps a held copy for hours when a
#: refresh fails, and an older report is not "current".
NEAREST_REPORT_MAX_AGE_S = 2 * 3600
#: How far the nearest report is looked for at all, as an EFB lists a
#: field's nearest METAR: about a quarter hour's flight in a light
#: airplane.
NEAREST_REPORT_NM = 30.0
_NM_PER_SM = 0.868976


def nearest_report(lat: float, lon: float, exclude: str | None = None, within_nm: float = NEAREST_REPORT_NM) -> dict | None:
    """The nearest station with a current METAR within `within_nm` of a
    point, for a field with no report of its own, as {"ident",
    "distance_nm", "bearing_deg" (true, from the point), "near" (within
    NEAR_REPORT_SM, close enough to say the field's weather by it,
    approximately), "metar"}; None with none that close."""
    best = None
    coslat = np.cos(np.radians(lat))
    for ident, report in _dataset("metars").items():
        s_lat, s_lon = report.get("lat"), report.get("lon")
        if ident == exclude or s_lat is None or s_lon is None:
            continue
        # Before the distance test, so an old near station does not hide a
        # current farther one; a report with no readable time is not known
        # to be current.
        observed = _unix(report.get("observed_at"))
        if observed is None or time.time() - observed > NEAREST_REPORT_MAX_AGE_S:
            continue
        # Flat-earth nautical miles: within thirty the error is yards.
        north, east = (s_lat - lat) * 60, (s_lon - lon) * 60 * coslat
        nm = float(np.hypot(north, east))
        if nm <= within_nm and (best is None or nm < best[0]):
            best = (nm, ident, report, float(np.degrees(np.arctan2(east, north))) % 360)
    if best is None:
        return None
    nm, ident, report, bearing = best
    return {
        "ident": ident, "distance_nm": round(nm, 1), "bearing_deg": round(bearing),
        "near": nm <= NEAR_REPORT_SM * _NM_PER_SM, "metar": report,
    }


# --- Ceiling/visibility, from the TAFs ---

def taf_for_idents(idents: list) -> dict:
    """{ident: {...}} for the current forecast period at each ident, or
    {ident: None} where no TAF is issued -- most fields have none.

    The mirror of metar_for_idents, and read the same way: the METAR is
    what it is doing now, this is what it is forecast to do. Both come
    out of the national cache files already in memory, so asking for
    thirty stations costs no more than asking for one.
    """
    wanted = {i.upper() for i in idents}
    now = time.time()
    stations = {
        s["icaoId"]: s for s in _dataset("tafs") if s["icaoId"] in wanted
    }
    answer = {}
    for ident in idents:
        station = stations.get(ident.upper())
        period = _current_forecast_period(station["fcsts"], now) if station else None
        worst = _worst_in_window(station["fcsts"], now, now) if station else None
        answer[ident] = None if station is None else {
            "raw": station.get("raw"),
            "ceiling_ft": worst["ceiling_ft"] if worst else None,
            "ceiling_unknown": bool(worst and worst["ceiling_unknown"]),
            "visibility_sm": worst["visibility_sm"] if worst else None,
            "change": (period or {}).get("change") or "",
            "valid_from": (period or {}).get("timeFrom"),
            "valid_to": (period or {}).get("timeTo"),
        }
    return answer


def forecast_wind(lat: float, lon: float, at_unix: float, ident: str | None = None,
                  within_nm: float = NEAREST_REPORT_NM) -> dict | None:
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
        coslat = np.cos(np.radians(lat))
        for station in stations:
            nm = float(np.hypot((station["lat"] - lat) * 60, (station["lon"] - lon) * 60 * coslat))
            if nm <= within_nm and (best is None or nm < best[0]):
                best = (nm, station)
    if best is None:
        return None
    nm, station = best
    prevailing = [
        p for p in station["fcsts"]
        if p["timeFrom"] <= at_unix and (
            (p["change"][:5] in ("", "FM") and at_unix < p["timeTo"]) or p["change"][:5] == "BECMG")
    ]
    if not prevailing or not any(p["timeFrom"] <= at_unix < p["timeTo"] for p in station["fcsts"]):
        return None
    period = max(prevailing, key=lambda p: p["timeFrom"])
    if period.get("wind_speed_kt") is None:
        return None
    return {
        "ident": station["icaoId"], "distance_nm": round(nm, 1),
        "dir_true_deg": period.get("wind_dir_true_deg"), "speed_kt": period["wind_speed_kt"],
        "gust_kt": period.get("wind_gust_kt"), "valid_from": period["timeFrom"], "valid_to": period["timeTo"],
    }


def _current_forecast_period(fcsts: list, now_unix: float) -> dict | None:
    """The base period covering `now_unix`, or None when the TAF has none
    covering it -- expired, or not valid yet. It used to fall back to the
    first period, which read an expired forecast as the current one."""
    for period in fcsts:
        if period["timeFrom"] <= now_unix < period["timeTo"]:
            return period
    return None


def _periods_in_window(fcsts: list, start: float, end: float) -> list:
    """Every period that says something about [start, end]: the base
    periods and TEMPO/PROB groups overlapping it, and a BECMG group that
    began before its end -- a BECMG's change lasts past its own window,
    to the next FM, and the feed carries no base period after it."""
    overlapping = [p for p in fcsts if p["timeFrom"] <= end and p["timeTo"] > start]
    bases = [p for p in overlapping if (p.get("change") or "")[:5] in ("", "FM")]
    since = min((p["timeFrom"] for p in bases), default=start)
    becoming = [
        p for p in fcsts
        if (p.get("change") or "").startswith("BECMG") and since <= p["timeFrom"] <= end and p not in overlapping
    ]
    return overlapping + becoming


def _worst_in_window(fcsts: list, start: float, end: float) -> dict | None:
    """The lowest ceiling and visibility the TAF forecasts anywhere in
    [start, end], TEMPO and PROB groups included: a go/no-go read is the
    worst the forecast allows, and taking only the base forecast let
    `TEMPO 1/2SM FG` read as VFR. None when the TAF says nothing about
    the window at all. `ceiling_unknown` where any period forecasts a
    ceiling with no height (_sky_ceiling): the lowest known ceiling is
    then not the worst the forecast allows."""
    periods = _periods_in_window(fcsts, start, end)
    if not periods:
        return None
    skies = [_sky_ceiling(p) for p in periods]
    ceilings = [c for c, _ in skies if c is not None]
    visibilities = [v for v in (_visibility_sm(p) for p in periods) if v is not None]
    return {
        "ceiling_ft": min(ceilings) if ceilings else None,
        "ceiling_unknown": any(unknown for _, unknown in skies),
        "visibility_sm": min(visibilities) if visibilities else None,
    }


def ceiling_visibility_along_route(
    route_start: tuple, route_end: tuple, corridor_buffer_nm: float = 10.0, window: tuple | None = None,
) -> dict:
    """Lowest forecast ceiling/visibility among TAF stations near the
    route, over `window` -- (start, end) in unix seconds, the flight from
    departure to arrival; now when not given -- TEMPO and PROB groups
    included (see _worst_in_window). A station whose TAF says nothing
    about the window is left out rather than read at some other time.
    It used to read every TAF at the moment of asking, so a plan for
    tomorrow morning paired tomorrow's winds with today's ceilings. TAFs are only
    issued for towered/larger airports, so this searches a wider
    corridor (corridor_buffer_nm) than the tight pilotage corridor used
    elsewhere in this project -- a small departure/destination field
    often has no TAF of its own at all.

    Returns {"min_ceiling_ft", "min_visibility_sm", "ceiling_unknown_at",
    "stations"} -- the first two are the worst (most restrictive) values
    found nearby, for a conservative go/no-go read; "ceiling_unknown_at"
    the stations forecasting a ceiling with no height, where the worst is
    not known (_sky_ceiling); "stations" is the per-station detail,
    where each is and its field's elevation with its own worst ceiling
    and visibility, which wingtip.altitude keeps each leg's altitudes under
    the clouds with (14 CFR 91.155).
    """
    from .geo import corridor_bbox

    min_lat, min_lon, max_lat, max_lon = corridor_bbox(route_start, route_end, corridor_buffer_nm)
    stations = [
        # The held copy: a second argument here was `force`, and with the
        # parser passed as it every call downloaded and parsed the whole
        # TAF set again -- 0.9 s of every briefing and altitude plan.
        s for s in _dataset("tafs")
        if min_lat <= s["lat"] <= max_lat and min_lon <= s["lon"] <= max_lon
    ]

    start, end = window if window else (time.time(), time.time())
    per_station, ceilings, visibilities, unknown_at = [], [], [], []
    for station in stations:
        worst = _worst_in_window(station["fcsts"], start, end)
        if worst is None:
            continue
        ceiling = worst["ceiling_ft"]
        visibility = worst["visibility_sm"]
        per_station.append({
            "icaoId": station["icaoId"], "lat": station["lat"], "lon": station["lon"],
            "elevation_ft": station.get("elevation_ft"), "ceiling_ft": ceiling,
            "ceiling_unknown": worst["ceiling_unknown"], "visibility_sm": visibility,
        })
        if worst["ceiling_unknown"]:
            unknown_at.append(station["icaoId"])
        if ceiling is not None:
            ceilings.append(ceiling)
        if visibility is not None:
            visibilities.append(visibility)

    return {
        "min_ceiling_ft": min(ceilings) if ceilings else None,
        "min_visibility_sm": min(visibilities) if visibilities else None,
        "ceiling_unknown_at": unknown_at,
        "stations": per_station,
    }


def tafs_over(windows: dict) -> dict:
    """Each station's TAF read over a window of its own -- {icaoId:
    (start, end)} in unix seconds, around when the flight gets there --
    as {icaoId: {"ceiling_ft", "ceiling_unknown", "visibility_sm", "raw"}}: the worst it
    forecasts then (TEMPO and PROB groups included, as _worst_in_window
    reads them) and the forecast as issued. The route's forecast reads
    every station over the whole flight, the right read for go/no-go; a
    pilot reading one place wants it for when they are there. Figures
    None where the TAF says nothing about its window; a station with no
    TAF held is left out."""
    if not windows:
        return {}
    found = {}
    for station in _dataset("tafs"):
        window = windows.get(station["icaoId"])
        if window is None:
            continue
        worst = _worst_in_window(station["fcsts"], *window) or {
            "ceiling_ft": None, "ceiling_unknown": False, "visibility_sm": None}
        found[station["icaoId"]] = {**worst, "raw": station.get("raw")}
    return found


# --- Go/no-go: the basic VFR weather minimums ---

# 14 CFR 91.155(c) and (d): below a 1,000 ft ceiling or 3 statute miles'
# visibility in a surface area of controlled airspace,
# VFR flight is not the default answer. The figures are the engine's
# (rules.rs, `vfr_basic_minimums`); wingtip.altitude's go/no-go flag, the
# briefing's "VFR flight not recommended" and the route options all read
# them from here, and the page shows what they decided.
_VFR_MINIMUMS = json.loads(wingtip_native.call("vfr_basic_minimums", "{}"))
VFR_MIN_CEILING_FT = int(_VFR_MINIMUMS["ceiling_ft"])
VFR_MIN_VISIBILITY_SM = int(_VFR_MINIMUMS["visibility_sm"])


def below_vfr_minimums(ceiling_ft: float | None, visibility_sm: float | None) -> bool:
    """Whether either figure is under 14 CFR 91.155's basic minimums. A
    missing figure is not below anything: unknown is reported as
    unknown by the caller, not decided here."""
    return (ceiling_ft is not None and ceiling_ft < VFR_MIN_CEILING_FT) or (
        visibility_sm is not None and visibility_sm < VFR_MIN_VISIBILITY_SM
    )


def vfr_not_recommended_reasons(idents: list, metars: dict, forecast: dict) -> list[str]:
    """"VFR flight not recommended" -- its own named element of an FAA
    standard briefing (AIM 7-1-5), stated plainly whenever conditions
    warrant it -- as the reasons, in briefing order: either end of the
    route currently reporting IFR or LIFR, then the along-route forecast
    ceiling or visibility under the basic VFR minimums. `metars` is
    metar_for_idents()'s answer, `forecast`
    ceiling_visibility_along_route()'s. Empty when nothing warrants it.

    A ceiling reported or forecast with no height ("OVC///") is said too:
    it could be at any height, the ground included, which is a condition
    that makes VFR flight doubtful (AIM 7-1-5), and saying nothing would
    pass it as no ceiling."""
    reasons = []
    for ident in idents:
        metar = metars.get(ident) or {}
        category = metar.get("flight_category")
        if category in ("IFR", "LIFR"):
            reasons.append(f"{ident} currently reporting {category}")
        elif metar.get("ceiling_unknown"):
            reasons.append(f"{ident} currently reporting a ceiling of unknown height")
    ceiling, visibility = forecast.get("min_ceiling_ft"), forecast.get("min_visibility_sm")
    if ceiling is not None and ceiling < VFR_MIN_CEILING_FT:
        reasons.append(f"forecast ceiling as low as {ceiling:,.0f} ft along the route")
    unknown_at = forecast.get("ceiling_unknown_at") or []
    if unknown_at:
        reasons.append(f"forecast ceiling of unknown height at {', '.join(unknown_at)}")
    if visibility is not None and visibility < VFR_MIN_VISIBILITY_SM:
        reasons.append(f"forecast visibility as low as {visibility:g} sm along the route")
    return reasons


# --- SIGMET hazards ---

def hazards_along_route(route_start: tuple, route_end: tuple, corridor_buffer_nm: float = 25.0) -> list:
    """SIGMETs whose hazard polygon the route line actually crosses, among
    those valid right now. The bbox is a coarse prefilter (convective
    SIGMETs commonly span several states); the real filter is the
    route/polygon intersection. CONUS AIRMETs were discontinued in
    January 2025 in favour of G-AIRMETs: gairmet_snapshots_along_route reads them.
    Each keeps its valid times ("valid_from", "valid_to"; UNIX seconds),
    when it was issued ("issued") and its area ("coords", [(lat, lon)]),
    for the briefing to say where and when the flight meets it.
    """
    from shapely.geometry import LineString, Polygon

    from .geo import corridor_bbox

    min_lat, min_lon, max_lat, max_lon = corridor_bbox(route_start, route_end, corridor_buffer_nm)
    now = time.time()
    route_line = LineString([(route_start[1], route_start[0]), (route_end[1], route_end[0])])
    hits = []
    for advisory in _dataset("airsigmets"):
        if advisory["valid_to"] is not None and advisory["valid_to"] <= now:
            continue
        if advisory["valid_from"] is not None and advisory["valid_from"] > now:
            continue
        coords = advisory["coords"]
        if len(coords) < 3:
            continue
        lats, lons = [lat for lat, _ in coords], [lon for _, lon in coords]
        if max(lats) < min_lat or min(lats) > max_lat or max(lons) < min_lon or min(lons) > max_lon:
            continue
        polygon = Polygon([(lon, lat) for lat, lon in coords])
        if not polygon.is_valid:
            polygon = polygon.buffer(0)
        if route_line.intersects(polygon):
            hits.append({key: advisory.get(key) for key in (
                "hazard", "type", "altitude_low_ft", "altitude_high_ft", "raw", "valid_from", "valid_to", "issued", "coords")})
    return hits


# --- PIREPs ---

#: How old a PIREP is still told: the conditions it reports move on.
PIREP_MAX_AGE_S = 90 * 60
#: The highest a PIREP is told for: a light aeroplane's sky, not the
#: airliners' reports from the flight levels.
PIREP_MAX_ALT_FT = 18000.0
#: How far either side of the route a PIREP is told.
PIREP_CORRIDOR_NM = 30.0


def pireps_along_route(path: list, corridor_nm: float = PIREP_CORRIDOR_NM) -> list:
    """The pilot reports of the last PIREP_MAX_AGE_S within `corridor_nm`
    of the route flown through `path` [(lat, lon)], at or under
    PIREP_MAX_ALT_FT, in along-route order, urgent ones first: each
    {"observed_at", "lat", "lon", "altitude_ft", "aircraft", "urgent",
    "turbulence", "icing", "raw", "along_track_nm"}."""
    from .geo import along_track_distance_nm, cross_track_distance_nm, distance_nm

    now = time.time()
    found = []
    for report in _dataset("pireps"):
        if report["observed"] is None or now - report["observed"] > PIREP_MAX_AGE_S:
            continue
        if report["altitude_ft"] is not None and report["altitude_ft"] > PIREP_MAX_ALT_FT:
            continue
        nearest = None
        offset = 0.0
        for a, b in pairwise(path):
            along = along_track_distance_nm(report["lat"], report["lon"], a, b)
            leg_nm = distance_nm(*a, *b)
            beside = abs(cross_track_distance_nm(report["lat"], report["lon"], a, b)) <= corridor_nm
            if -corridor_nm <= along <= leg_nm + corridor_nm and beside:
                nearest = offset + max(0.0, min(along, leg_nm))
                break
            offset += leg_nm
        if nearest is None:
            continue
        found.append({**{k: v for k, v in report.items() if k != "observed"}, "along_track_nm": round(nearest, 1)})
    return sorted(found, key=lambda r: (not r["urgent"], r["along_track_nm"]))


# --- G-AIRMETs ---

#: The G-AIRMET hazards a VFR flight is told of, in words. High-level
#: turbulence (TURB-HI, above FL180) and the freezing-level contours are
#: not: the one is above it, the others lines, not areas.
GAIRMET_HAZARDS = {
    "IFR": "IFR conditions",
    "MT_OBSC": "Mountains obscured",
    "TURB-LO": "Turbulence",
    "ICE": "Icing",
    "LLWS": "Low-level wind shear",
    "SFC_WND": "Strong surface winds",
}
#: A G-AIRMET is a snapshot valid at its time, three hours apart: one is
#: told when it is valid within this of some time of the flight.
GAIRMET_SNAPSHOT_S = 90 * 60


def gairmet_snapshots_along_route(path: list, window: tuple) -> list:
    """Every G-AIRMET snapshot (IFR, mountain obscuration, low-level
    turbulence, icing, wind shear, strong surface winds) whose area the
    route flown through `path` [(lat, lon)] crosses, valid at some time of
    the flight `window` (start, end; UNIX seconds) give or take
    GAIRMET_SNAPSHOT_S: _parse_gairmets' dicts, with their "valid" (UNIX
    seconds) and their area ("coords"), for the briefing to pick each
    hazard's snapshot for when the flight is in it."""
    from shapely.geometry import LineString, Polygon

    line = LineString([(lon, lat) for lat, lon in path])
    start, end = window
    found = []
    for advisory in _dataset("gairmets"):
        valid = advisory["valid"]
        if valid is None or valid < start - GAIRMET_SNAPSHOT_S or valid > end + GAIRMET_SNAPSHOT_S:
            continue
        if len(advisory["coords"]) < 3:
            continue
        polygon = Polygon([(lon, lat) for lat, lon in advisory["coords"]])
        if not polygon.is_valid:
            polygon = polygon.buffer(0)
        if line.intersects(polygon):
            found.append(advisory)
    return found


def forecast_hour(hours_ahead: float | None) -> str:
    """Which winds period fits a departure `hours_ahead` hours from now,
    where no period's window can be read to say: the 6-hour period up to
    six hours out, the 12-hour period to fifteen, the 24-hour period
    beyond -- where their windows end (services/weather/app/gfs.py's PERIODS).
    None (no departure time) is now."""
    if hours_ahead is None or hours_ahead <= 6:
        return "06"
    if hours_ahead <= 15:
        return "12"
    return "24"
