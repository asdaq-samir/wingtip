"""aviationweather.gov's national cache files, fetched on the schedule
(app.main) and stored parsed (wingtip.weather_store) for the planner to
read (wingtip.weather): the METARs, TAFs, SIGMETs and AIRMETs, PIREPs and
G-AIRMETs, each the complete current national set, gzipped, regenerated
every minute (TAFs every ten). Moved from the planner's wingtip.weather
(#535), which fetched them on its own requests' way.

The cache files rather than per-route API queries: that is what the
site's API terms ask heavy users to do -- a bounding-box query per route
is exactly the "large query" the rate limit and the results cap exist
for, and one download every few minutes replaces all of them. Each is
asked for only if it has changed since the copy held (its ETag and
Last-Modified): an unchanged one (the SIGMETs and G-AIRMETs most of the
time) is a 304, neither downloaded nor parsed again.

Each copy is stored with the time to which it may be served when a
later fetch fails, by its product's own validity (its held_until below):
a TAF to the end of its valid period, an advisory to the end of its own,
a METAR set for as long as it is the latest heard. A fetch that fails
leaves the stored copy in place and says so beside it
(weather_store.write_attempt); only a parsed product is ever stored, so a
body that does not parse is a failed fetch.

The ceiling, the flight category and the validity of each product are
the engine's rules (wingtip_native), the same the planner and the phones
read; this module only parses into the shape wingtip.weather reads.
"""
from __future__ import annotations

import gzip
import json
import logging
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import wingtip_native
from wingtip import weather_store
from wingtip.units import M_TO_FT
from wingtip.weather import (
    GAIRMET_HAZARDS,
    GAIRMET_SNAPSHOT_S,
    PIREP_MAX_AGE_S,
    RECENT_WIND_HOURS,
    _report_category,
    _sky_ceiling,
    _unix,
    _visibility_sm,
)

from . import fetch

log = logging.getLogger(__name__)

CACHE_BASE_URL = "https://aviationweather.gov/data/cache"

# How old a copy may be and still be served when a refresh fails, for a
# product whose copy says nothing of its own validity (an empty set of
# advisories): what every source was held to before each was held to its
# own (2026-11-04).
_DATASET_STALE_MAX_S = 3 * 3600


# --- How long each product's stored copy stays good when a refresh fails ---
# Each takes the parsed copy and when it was fetched, and gives the UNIX
# time it may be served to (None: no limit). Worked out once, when the
# copy is fetched, and stored with it.


def _expires_at(product: str, valid_to: float | None) -> float | None:
    """When a forecast stops counting, from the end of its valid time: the
    engine's (validity.rs, `weather_expires_at`), the rule the web's and
    the phones' readers ask."""
    if valid_to is None:
        return None
    return json.loads(wingtip_native.call("weather_expires_at", json.dumps({"product": product, "valid_to": valid_to})))


def _metars_until(metars, fetched: float) -> float | None:
    """A METAR is an observation, not a forecast: AC 00-45H (METAR) gives
    it no period of validity, only the time it was made, and every report
    carries that time ("observed_at"), which the page shows beside it and
    the map's layer ages say how old the set is (/api/map/ages). So the
    last set heard is served however long the outage, as "the latest
    reports, made at ..." -- the owner's call of 2026-11-04 -- rather than
    none."""
    return None


def _tafs_until(stations, fetched: float) -> float:
    """A TAF is valid to the end of its valid period, 24 or 30 hours from
    issue (AC 00-45H, Terminal Aerodrome Forecast (TAF)): the set is
    served to the end of the latest period in it. Every reader takes the
    period covering the time it asks about (_current_forecast_period,
    _periods_in_window), so a station whose own TAF has run out says
    nothing rather than reading an expired forecast as current."""
    ends = [_expires_at("taf", p["timeTo"]) for s in stations for p in s.get("fcsts", ()) if p.get("timeTo") is not None]
    return max(ends) if ends else fetched + _DATASET_STALE_MAX_S


def _airsigmets_until(advisories, fetched: float) -> float:
    """A SIGMET or AIRMET is valid to the "valid until" time it is issued
    with -- up to 4 hours for a SIGMET (6 for volcanic ash or a tropical
    cyclone), 2 for a convective SIGMET, 6 for an AIRMET (AC 00-45H,
    SIGMET, Convective SIGMET and AIRMET): the set
    is served to the latest of them. hazards_along_route leaves out each
    one past its own end. A set with none in force says nothing of how
    long that holds, so is held as any other source."""
    ends = [_expires_at("advisory", a["valid_to"]) for a in advisories if a.get("valid_to") is not None]
    return max(ends) if ends else fetched + _DATASET_STALE_MAX_S


def _pireps_until(reports, fetched: float) -> float:
    """A PIREP has no period of validity (AIM chapter 7, section 1, Pilot
    Weather Reports, asks for them; AC 00-45H describes them); the
    briefing tells one for PIREP_MAX_AGE_S
    after it was made, so the set is served until its newest report is
    that old. Past then a held set would read as "no reports along the
    route" when the truth is "none could be had"."""
    observed = [r["observed"] for r in reports if r.get("observed") is not None]
    return max(observed) + PIREP_MAX_AGE_S if observed else fetched + _DATASET_STALE_MAX_S


def _gairmets_until(advisories, fetched: float) -> float:
    """A G-AIRMET is a set of snapshots, each valid at its own time, three
    hours apart out to 12 hours from issue (AC 00-45H, Graphical AIRMET
    (G-AIRMET)); the briefing tells one within GAIRMET_SNAPSHOT_S of its
    time. The set is served until its last snapshot is past that."""
    valid = [a["valid"] for a in advisories if a.get("valid") is not None]
    return max(valid) + GAIRMET_SNAPSHOT_S if valid else fetched + _DATASET_STALE_MAX_S




# name -> (url, parse(body), held_until(copy, fetched at)).
SOURCES = {
    "metars": (f"{CACHE_BASE_URL}/metars.cache.xml.gz", lambda body: _parse_metars(body), _metars_until),
    "tafs": (f"{CACHE_BASE_URL}/tafs.cache.xml.gz", lambda body: _parse_tafs(body), _tafs_until),
    "airsigmets": (f"{CACHE_BASE_URL}/airsigmets.cache.xml.gz", lambda body: _parse_airsigmets(body), _airsigmets_until),
    "pireps": (f"{CACHE_BASE_URL}/aircraftreports.cache.xml.gz", lambda body: _parse_pireps(body), _pireps_until),
    "gairmets": (f"{CACHE_BASE_URL}/gairmets.cache.xml.gz", lambda body: _parse_gairmets(body), _gairmets_until),
}


def fetch_source(name: str) -> None:
    """Source `name` fetched and stored, if it has changed since the copy
    stored (its validators, kept in the record's meta); an unchanged one is
    stored again as fetched now, so its age is when it was last confirmed.
    The METARs also update each station's last wind (recent-winds). Raises
    fetch.FetchFailed, ET.ParseError or OSError where the copy could not be
    had, the stored one left in place."""
    url, parse, held_until = SOURCES[name]
    held = weather_store.read(name)
    validators = (held.meta.get("validators") if held else None) or None
    now = time.time()
    resp = fetch.get(url, validators=validators)
    if held is not None and getattr(resp, "status_code", None) == 304:
        data = held.data
    else:
        data = parse(gzip.decompress(resp.content))
        validators = fetch.validators_of(resp)
    try:
        until = held_until(data, now)
    except (KeyError, TypeError, ValueError):
        # A copy whose validity cannot be read is held as long as one that
        # does not say.
        until = now + _DATASET_STALE_MAX_S
    weather_store.write(name, data, fetched_at=now, until=until, meta={"validators": validators})
    if name == "metars":
        keep_recent_winds(data, now)


def keep_recent_winds(metars: dict, now: float) -> None:
    """Each station's newest report with a direction and some speed, kept
    RECENT_WIND_HOURS ("recent-winds"): the runway it favoured is the one
    in use when the wind has since dropped calm (wingtip.runway_wind). The
    METAR file holds only each station's latest report, so the service
    keeps the last windy one as it fetches, where the planner asked the
    METAR API for each field's last three hours on a card's way."""
    held = weather_store.read("recent-winds")
    winds = dict(held.data) if held and isinstance(held.data, dict) else {}
    for ident, report in metars.items():
        direction, speed = report.get("wind_dir_true_deg"), report.get("wind_speed_kt")
        observed = _unix(report.get("observed_at"))
        if direction is None or not speed or speed <= 0 or observed is None:
            continue
        if ident not in winds or winds[ident]["observed"] < observed:
            winds[ident] = {"wind_dir_true_deg": direction, "wind_speed_kt": speed, "observed": observed}
    oldest = now - RECENT_WIND_HOURS * 3600
    winds = {ident: w for ident, w in winds.items() if w["observed"] >= oldest}
    weather_store.write("recent-winds", winds, fetched_at=now, until=None)


# --- Parsing, into the shapes wingtip.weather reads ---


def _float(text: str | None) -> float | None:
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def _int(text: str | None) -> int | None:
    try:
        return int(text)
    except (TypeError, ValueError):
        return None



def _period(el) -> dict:
    """A METAR, or one TAF forecast period, as the {"clouds", "visib",
    "vert_vis"} shape _ceiling_ft/_visibility_sm read."""
    return {
        "clouds": [
            {"cover": sc.get("sky_cover"), "base": _int(sc.get("cloud_base_ft_agl"))}
            for sc in el.findall("sky_condition")
        ],
        "visib": el.findtext("visibility_statute_mi"),
        "vert_vis": _int(el.findtext("vert_vis_ft")),
    }


def _parse_metars(xml_bytes: bytes) -> dict:
    """{station_id: report} -- the newest report per station in the file."""
    latest: dict = {}
    for el in ET.fromstring(xml_bytes).iter("METAR"):
        ident = el.findtext("station_id")
        if not ident:
            continue
        observed = el.findtext("observation_time") or ""
        if ident in latest and latest[ident][0] >= observed:
            continue
        period = _period(el)
        ceiling, ceiling_unknown = _sky_ceiling(period)
        visibility = _visibility_sm(period)
        category = el.findtext("flight_category")
        if ceiling_unknown:
            # The AWC's own category takes a layer it has no height for as
            # no ceiling, and calls "OVC/// 10SM" VFR; the ceiling is not
            # known (14 CFR 1.1), so the category is only what the
            # visibility settles.
            category = _report_category(None, True, visibility)
        latest[ident] = (observed, {
            "raw": el.findtext("raw_text"),
            # When the report was made, so a page can say how old it is:
            # the server keeps serving a copy for hours when a refresh
            # fails, and a colour alone says nothing about its age.
            "observed_at": observed or None,
            "flight_category": category,
            # The weather itself, "-TSRA BR", as reported: a thunderstorm
            # at or near the field (TS, VCTS) is one to keep away from
            # (wingtip.route_options).
            "wx": el.findtext("wx_string") or "",
            "ceiling_ft": ceiling,
            # A broken or overcast layer reported with no height is the
            # lowest: the ceiling is not known, not absent (_sky_ceiling).
            "ceiling_unknown": ceiling_unknown,
            "visibility_sm": visibility,
            # "VRB" is a direction the arithmetic can't use.
            "wind_dir_true_deg": _float(el.findtext("wind_dir_degrees")),
            "wind_speed_kt": _float(el.findtext("wind_speed_kt")),
            "wind_gust_kt": _float(el.findtext("wind_gust_kt")),
            "altimeter_in_hg": _float(el.findtext("altim_in_hg")),
            "temp_c": _float(el.findtext("temp_c")),
            "dewpoint_c": _float(el.findtext("dewpoint_c")),
            # Where the station is, for a field with no report of its own
            # (nearest_report).
            "lat": _float(el.findtext("latitude")),
            "lon": _float(el.findtext("longitude")),
        })
    return {ident: report for ident, (_, report) in latest.items()}


# Within one start time, the base forecast (FM, or the TAF's own first
# line) sorts first; BECMG/TEMPO/PROB lines modify it.
_CHANGE_ORDER = {"": 0, "FM": 0, "BECMG": 1, "TEMPO": 2, "PROB": 3}


def _parse_tafs(xml_bytes: bytes) -> list:
    """[{"icaoId", "lat", "lon", "elevation_ft", "fcsts": [...]}] -- one
    entry per station, its latest issue, periods in time order with the
    base forecast first. The field's elevation turns a ceiling, which a
    TAF gives above the field, into the altitude a pilot keeps below it
    (wingtip.altitude's cloud clearance)."""
    latest: dict = {}
    for el in ET.fromstring(xml_bytes).iter("TAF"):
        ident = el.findtext("station_id")
        lat, lon = _float(el.findtext("latitude")), _float(el.findtext("longitude"))
        if not ident or lat is None or lon is None:
            continue
        issued = el.findtext("issue_time") or ""
        if ident in latest and latest[ident][0] >= issued:
            continue
        fcsts = []
        for forecast in el.findall("forecast"):
            start, end = _unix(forecast.findtext("fcst_time_from")), _unix(forecast.findtext("fcst_time_to"))
            if start is None or end is None:
                continue
            fcsts.append({
                "timeFrom": start, "timeTo": end,
                "change": forecast.findtext("change_indicator") or "",
                **_period(forecast),
                # The weather forecast, "TSRA", "VCTS": thunderstorms in a
                # period are one to keep away from (wingtip.route_options).
                "wx": forecast.findtext("wx_string") or "",
                # Its wind, from true north as a TAF gives it (AC 00-45H,
                # the TAF; a METAR's too), for the runway a flight will
                # find in use when it gets there. VRB has no direction.
                "wind_dir_true_deg": _float(forecast.findtext("wind_dir_degrees")),
                "wind_speed_kt": _float(forecast.findtext("wind_speed_kt")),
                "wind_gust_kt": _float(forecast.findtext("wind_gust_kt")),
            })
        fcsts.sort(key=lambda p: (p["timeFrom"], _CHANGE_ORDER.get(p["change"][:5], 3)))
        elevation_m = _float(el.findtext("elevation_m"))
        latest[ident] = (issued, {
            "icaoId": ident, "lat": lat, "lon": lon,
            "elevation_ft": None if elevation_m is None else round(elevation_m * M_TO_FT),
            # The forecast as issued. The derived ceiling and visibility
            # below are what a go/no-go reads; the text is what a pilot
            # reads, and only one of the two can be shown on a phone.
            "raw": el.findtext("raw_text"),
            "fcsts": fcsts,
        })
    return [station for _, station in latest.values()]


#: A bulletin's WMO abbreviated heading, "WSUS32 KKCI 261655": its last
#: group, YYGGgg, is the day of the month, hour and minute (UTC) it was
#: issued (WMO-No. 386, Manual on the Global Telecommunication System,
#: Attachment II-5). The SIGMET file gives no issue time of its own.
_WMO_HEADING = re.compile(r"\b[A-Z]{4}\d{2}\s+[A-Z]{4}\s+(\d{2})(\d{2})(\d{2})\b")


def _wmo_issued(raw: str | None, near: float | None) -> str | None:
    """When a bulletin was issued (ISO UTC), from its WMO heading's
    day-hour-minute, put in the month of `near` (its valid time, UNIX
    seconds) -- or the month before, for a heading of the 31st read on
    the 1st. None where the text has no heading."""
    m = _WMO_HEADING.search(raw or "")
    if not m or near is None:
        return None
    day, hour, minute = (int(g) for g in m.groups())
    base = datetime.fromtimestamp(near, timezone.utc)
    for months_back in (0, 1):
        year, month = base.year, base.month - months_back
        if month == 0:
            year, month = year - 1, 12
        try:
            issued = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
        except ValueError:
            continue
        if issued.timestamp() <= near + 86400:
            return issued.isoformat().replace("+00:00", "Z")
    return None


def _parse_airsigmets(xml_bytes: bytes) -> list:
    advisories = []
    for el in ET.fromstring(xml_bytes).iter("AIRSIGMET"):
        altitude, hazard = el.find("altitude"), el.find("hazard")
        points = [(_float(p.findtext("latitude")), _float(p.findtext("longitude"))) for p in el.iter("point")]
        advisories.append({
            "hazard": hazard.get("type") if hazard is not None else None,
            "type": el.findtext("airsigmet_type"),
            "altitude_low_ft": _float(altitude.get("min_ft_msl")) if altitude is not None else None,
            "altitude_high_ft": _float(altitude.get("max_ft_msl")) if altitude is not None else None,
            "raw": el.findtext("raw_text"),
            "valid_from": _unix(el.findtext("valid_time_from")),
            "valid_to": _unix(el.findtext("valid_time_to")),
            "issued": _wmo_issued(el.findtext("raw_text"), _unix(el.findtext("valid_time_from"))),
            "coords": [(lat, lon) for lat, lon in points if lat is not None and lon is not None],
        })
    return advisories


def _parse_pireps(xml_bytes: bytes) -> list:
    """The pilot reports in the aircraft reports file -- routine and urgent
    (UUA) -- leaving out the AIREPs, airliners' position reports from the
    ocean routes, which are most of it."""
    reports = []
    for el in ET.fromstring(xml_bytes).iter("AircraftReport"):
        kind = el.findtext("report_type") or ""
        if "PIREP" not in kind:
            continue
        lat, lon = _float(el.findtext("latitude")), _float(el.findtext("longitude"))
        if lat is None or lon is None:
            continue
        turbulence = [t.get("turbulence_intensity") for t in el.iter("turbulence_condition") if t.get("turbulence_intensity")]
        icing = [i.get("icing_intensity") for i in el.iter("icing_condition") if i.get("icing_intensity")]
        reports.append({
            "observed_at": el.findtext("observation_time"),
            "observed": _unix(el.findtext("observation_time")),
            "lat": lat, "lon": lon,
            "altitude_ft": _float(el.findtext("altitude_ft_msl")),
            "aircraft": el.findtext("aircraft_ref"),
            "urgent": kind.startswith("Urgent"),
            "turbulence": turbulence[0] if turbulence else None,
            "icing": icing[0] if icing else None,
            "raw": el.findtext("raw_text"),
        })
    return reports


def _parse_gairmets(xml_bytes: bytes) -> list:
    advisories = []
    for el in ET.fromstring(xml_bytes).iter("GAIRMET"):
        hazard = el.find("hazard")
        kind = hazard.get("type") if hazard is not None else None
        if kind not in GAIRMET_HAZARDS or el.findtext("geometry_type") != "AREA":
            continue
        altitude = el.find("altitude")
        low = altitude.get("min_ft_msl") if altitude is not None else None
        points = [(_float(p.findtext("latitude")), _float(p.findtext("longitude"))) for p in el.iter("point")]
        advisories.append({
            "hazard": GAIRMET_HAZARDS[kind],
            "severity": (hazard.get("severity") or None) if hazard is not None else None,
            "due_to": el.findtext("due_to"),
            "valid_at": el.findtext("valid_time"),
            "valid": _unix(el.findtext("valid_time")),
            "issued": el.findtext("issue_time") or None,
            # "FZL": from the freezing level, which the advisory gives
            # beside it.
            "altitude_low_ft": None if low in (None, "", "FZL", "SFC") else _float(low),
            "from_freezing_level": low == "FZL",
            "altitude_high_ft": _float(altitude.get("max_ft_msl")) if altitude is not None else None,
            "coords": [(lat, lon) for lat, lon in points if lat is not None and lon is not None],
        })
    return advisories

