"""Winds and temperatures aloft from the GFS model: the planner's winds
aloft since the Winds and Temperatures Aloft Forecast (FB, the "FD" text
product) ended. NWS Service Change Notice 26-47 (updated 5 Nov 2026)
discontinued the NAM at 1200Z on 3 Nov 2026 and with it the FB bulletins
(its WMO headers "FB(US|AK|HW)3[135789] KWNO"); aviationweather.gov's
windtemp API has answered 400 since, "Wind/temp tables have been
discontinued with the retirement of the NAM model". The owner made the
GFS the primary source on 2026-11-07, and nothing asks for the FB now.

The NWS's Global Forecast System (NCEP GFS, 0.25 degree), its winds,
temperatures and geopotential heights at nine pressure levels from 925
to 200 hPa -- about 2,500 to 39,000 ft, the FB's own range -- over the
lower 48, cut out by NOMADS' grib filter (about two megabytes a run and
forecast hour) and read with gribberish, as wingtip.glmp reads GLMP. The
FB's old stations are given the model's levels at their own places, so
the planner reads them as it read the FB (wingtip.weather's FdStations:
nearest station, interpolated by altitude). This is model output,
unedited: every screen that shows these winds says they are modelled,
with the GFS run and forecast hour.

The GFS runs four times a day (00, 06, 12 and 18Z); NOMADS posts each
run's 0.25-degree files hourly to 120 hours and three-hourly after that
(its directory gfs.YYYYMMDD/HH/atmos: f000 to f120, then f123, f126...).

Fetched on the weather service's schedule (app.main), each period a
product of its own ("winds-06", "-12", "-24"), and stored with the end of
its window as the time it may be served to (the engine's rule for when a
winds forecast stops counting, validity.rs): the planner reads it
(wingtip.winds_stations.fd_stations) and never waits on NOMADS. Moved from the
planner's wingtip.modelwinds (#535).
"""

from __future__ import annotations

import json
import logging
import math
import time
from datetime import datetime, timedelta, timezone

import gribberish
import numpy as np
import requests
import wingtip_native
from wingtip import weather_store
from wingtip.config import REQUEST_HEADERS as HEADERS
from wingtip.units import M_TO_FT, MS_TO_KT

log = logging.getLogger(__name__)

FILTER_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
#: hPa levels asked for: the FB's 3,000 to 39,000 ft in the standard
#: atmosphere (925 hPa is about 2,500 ft, 200 hPa about 38,700 ft).
LEVELS_HPA = (925, 850, 700, 600, 500, 400, 300, 250, 200)
#: The lower 48, with the stations' edges inside it.
BOX = {"toplat": 55, "bottomlat": 20, "leftlon": -130, "rightlon": -60}
#: A run is on NOMADS about three and a half hours after its hour; looked
#: for from four.
POSTED_AFTER = timedelta(hours=4)
RUNS_TRIED = 3
#: The last forecast hour NOMADS posts hourly; three-hourly after it.
HOURLY_TO = 120
NOT_UP_RETRY_S = 300

# The places the model is read at: the CONUS FB stations (FD1US1, as
# issued 2026-11-03), each where OurAirports puts the US airport whose
# local code it is (ourairports.com's airports.csv, read 2026-11-08) --
# the match the planner made at every read before the split, kept as a
# table so this service never loads the 80,000-row airport file. Eleven
# of the list name no airport there (CZI, ECK, EMI, HAT, IMB, MBW, MQT,
# PFN, PLB, SSM, ZUN: VORs) and were never read, as before.
STATIONS = {
    "ABI": (32.4113, -99.6819),
    "ABQ": (35.04, -106.6089),
    "ABR": (45.4491, -98.4218),
    "ACK": (41.2531, -70.0602),
    "ACY": (39.4562, -74.5775),
    "AGC": (40.3544, -79.9302),
    "ALB": (42.7483, -73.8017),
    "ALS": (37.4349, -105.867),
    "AMA": (35.2179, -101.7064),
    "AST": (46.158, -123.879),
    "ATL": (33.6367, -84.4281),
    "AVP": (41.3371, -75.7242),
    "AXN": (45.8663, -95.3947),
    "BAM": (40.599, -116.874),
    "BCE": (37.7064, -112.145),
    "BDL": (41.9386, -72.688),
    "BFF": (41.874, -103.596),
    "BGR": (44.8064, -68.8267),
    "BHM": (33.5629, -86.7507),
    "BIH": (37.3731, -118.364),
    "BIL": (45.8089, -108.5412),
    "BLH": (33.6192, -114.717),
    "BML": (44.5754, -71.1759),
    "BNA": (36.1245, -86.6782),
    "BOI": (43.5644, -116.223),
    "BOS": (42.362, -71.0079),
    "BRL": (40.7832, -91.1255),
    "BRO": (25.9072, -97.4252),
    "BUF": (42.9405, -78.7322),
    "CAE": (33.9382, -81.123),
    "CAR": (46.8715, -68.0179),
    "CGI": (37.2253, -89.5708),
    "CHS": (32.8962, -80.0382),
    "CLE": (41.4117, -81.8498),
    "CLL": (30.5886, -96.3638),
    "CMH": (39.998, -82.8919),
    "COU": (38.8181, -92.2196),
    "CRP": (27.7704, -97.5012),
    "CRW": (38.3731, -81.5932),
    "CSG": (32.5164, -84.9396),
    "CVG": (39.0488, -84.6678),
    "DAL": (32.8448, -96.8477),
    "DBQ": (42.402, -90.7095),
    "DEN": (39.86, -104.6738),
    "DIK": (46.7975, -102.8019),
    "DLH": (46.8419, -92.1987),
    "DLN": (45.2554, -112.553),
    "DRT": (29.3742, -100.927),
    "DSM": (41.534, -93.6567),
    "EKN": (38.8898, -79.8577),
    "ELP": (31.8099, -106.3756),
    "ELY": (39.2997, -114.842),
    "EVV": (38.037, -87.5324),
    "EYW": (24.5561, -81.7596),
    "FAT": (36.7758, -119.718),
    "FLO": (34.1854, -79.7239),
    "FMN": (36.7412, -108.23),
    "FOT": (40.5539, -124.133),
    "FSD": (43.5855, -96.7412),
    "FSM": (35.3366, -94.3674),
    "FWA": (40.9789, -85.1945),
    "GAG": (36.2955, -99.7764),
    "GCK": (37.9275, -100.724),
    "GEG": (47.6199, -117.534),
    "GFK": (47.9493, -97.1761),
    "GGW": (48.2125, -106.615),
    "GJT": (39.1267, -108.5294),
    "GLD": (39.3707, -101.6998),
    "GPI": (48.3105, -114.256),
    "GRB": (44.4835, -88.1308),
    "GRI": (40.9675, -98.3096),
    "GSP": (34.8957, -82.2189),
    "GTF": (47.482, -111.371),
    "HOU": (29.6453, -95.2768),
    "HSV": (34.6362, -86.7744),
    "ICT": (37.6503, -97.4286),
    "ILM": (34.2723, -77.9051),
    "IND": (39.7173, -86.2944),
    "INK": (31.7796, -103.201),
    "INL": (48.5662, -93.4031),
    "JAN": (32.3112, -90.0759),
    "JAX": (30.4925, -81.6878),
    "JFK": (40.6394, -73.7793),
    "JOT": (41.5178, -88.1755),
    "LAS": (36.0834, -115.1518),
    "LBB": (33.6636, -101.823),
    "LCH": (30.1261, -93.2233),
    "LIT": (34.7292, -92.2236),
    "LKV": (42.1611, -120.399),
    "LND": (42.8152, -108.73),
    "LOU": (38.228, -85.6637),
    "LRD": (27.5438, -99.4616),
    "LSE": (43.879, -91.2567),
    "LWS": (46.3745, -117.015),
    "MCW": (43.1598, -93.3297),
    "MEM": (35.0438, -89.9763),
    "MGM": (32.3006, -86.394),
    "MIA": (25.796, -80.2898),
    "MKC": (39.1232, -94.5928),
    "MKG": (43.1695, -86.2382),
    "MLB": (28.102, -80.6411),
    "MLS": (46.4273, -105.8854),
    "MOB": (30.6912, -88.2428),
    "MOT": (48.258, -101.2791),
    "MRF": (30.3696, -104.0159),
    "MSP": (44.8801, -93.2217),
    "MSY": (29.9934, -90.2647),
    "OKC": (35.3934, -97.5982),
    "OMA": (41.3032, -95.8941),
    "ONL": (42.4689, -98.687),
    "ONT": (34.056, -117.601),
    "ORF": (36.8953, -76.201),
    "OTH": (43.4171, -124.246),
    "PDX": (45.5887, -122.598),
    "PHX": (33.4353, -112.0059),
    "PIE": (27.9102, -82.6874),
    "PIH": (42.9098, -112.596),
    "PIR": (44.3827, -100.286),
    "PRC": (34.6535, -112.4199),
    "PSB": (40.8844, -78.0873),
    "PSX": (28.7275, -96.251),
    "PUB": (38.2891, -104.497),
    "PWM": (43.6462, -70.3093),
    "RAP": (44.0453, -103.057),
    "RBL": (40.1507, -122.252),
    "RDM": (44.2541, -121.15),
    "RDU": (35.8787, -78.7873),
    "RIC": (37.5052, -77.3197),
    "RKS": (41.5942, -109.065),
    "RNO": (39.4991, -119.768),
    "ROA": (37.3255, -79.9754),
    "ROW": (33.3016, -104.531),
    "SAC": (38.5125, -121.493),
    "SAN": (32.7336, -117.19),
    "SAT": (29.5337, -98.4698),
    "SAV": (32.1266, -81.2),
    "SBA": (34.4262, -119.84),
    "SEA": (47.4479, -122.3103),
    "SFO": (37.6198, -122.3748),
    "SGF": (37.245, -93.3886),
    "SHV": (32.4447, -93.8267),
    "SIY": (41.7814, -122.468),
    "SLC": (40.7889, -111.9799),
    "SLN": (38.791, -97.6522),
    "SPI": (39.8441, -89.6779),
    "SPS": (33.9888, -98.4919),
    "STL": (38.7487, -90.37),
    "SYR": (43.1112, -76.1063),
    "TCC": (35.1828, -103.603),
    "TLH": (30.4012, -84.3543),
    "TRI": (36.4752, -82.4074),
    "TUL": (36.1971, -95.8862),
    "TUS": (32.115, -110.9381),
    "TVC": (44.7414, -85.5822),
    "TYS": (35.811, -83.994),
    "WJF": (34.7411, -118.219),
    "YKM": (46.5682, -120.544),
}

# Each period a plan reads: the forecast hour it is valid at, as hours
# from the current hour, and the window around that valid time it is for
# use in, hours before and after. The windows are the FB's own for its
# 6-, 12- and 24-hour forecasts (FAA Order JO 7110.10, Flight Services,
# 9-3-1, TBL 9-3-1: valid 1800Z for use 1400-2100Z, valid 0000Z for use
# 2100-0600Z, valid 1200Z for use 0600-1800Z), a forecast hour standing
# where the FB's valid time did. Each valid time is put so the three run
# on from one another from the current hour: 06 from an hour ago to six
# hours ahead, 12 to fifteen, 24 to twenty-seven. A forecast hour is
# never used outside its window (stations, _in_window).
_PERIODS = {"06": (3, 4, 3), "12": (9, 3, 6), "24": (21, 6, 6)}
#: The periods, in order: wingtip.weather_store.WIND_PERIODS.
PERIODS = tuple(_PERIODS)


class ModelWindsUnavailable(RuntimeError):
    """NOMADS did not give a GFS run."""


#: (run, step) -> when NOMADS last said it was not posted yet.
_NOT_UP: dict = {}


def fetch_period(fcst_hr: str) -> None:
    """`fcst_hr`'s period read from NOMADS and stored ("winds-<fcst_hr>"):
    {"stations": {ident: {altitude_ft: {"wind_dir_true_deg",
    "wind_speed_kt", "temp_c"}}}, "period": period_of(...)}, served to the
    end of its window. Raises ModelWindsUnavailable where no run can be
    had, the stored copy left in place."""
    now = time.time()
    fields, run, step = _fetch(fcst_hr, datetime.fromtimestamp(now, timezone.utc))
    period = period_of(run, step, fcst_hr)
    until = json.loads(wingtip_native.call("weather_expires_at", json.dumps({"product": "winds", "valid_to": _iso_s(period["use_to"])})))
    weather_store.write(
        f"winds-{fcst_hr}",
        {"stations": _at_stations(fields), "period": period},
        fetched_at=now,
        until=until,
        meta={"run": period["run"], "forecast_hour": step},
    )


def period_of(run: datetime, step: int, fcst_hr: str) -> dict:
    """A forecast hour's period: valid at the run's hour plus `step`, for
    use in the window round that valid time _PERIODS gives `fcst_hr`'s
    period (TBL 9-3-1's), with the run and the forecast hour the pilot is
    told."""
    valid = run + timedelta(hours=step)
    _, before, after = _PERIODS.get(fcst_hr, _PERIODS["06"])
    return {
        "valid_at": _iso(valid),
        "use_from": _iso(valid - timedelta(hours=before)),
        "use_to": _iso(valid + timedelta(hours=after)),
        "run": _iso(run),
        "forecast_hour": step,
    }


def _fetch(fcst_hr: str, now: datetime) -> tuple[dict, datetime, int]:
    """{(var, hPa): (lats, lons, values)} from the latest run up at the
    forecast hour valid at the period's hour, that run and that hour."""
    hour = now.replace(minute=0, second=0, microsecond=0)
    target = hour + timedelta(hours=_PERIODS.get(fcst_hr, _PERIODS["06"])[0])
    latest = (now - POSTED_AFTER).replace(minute=0, second=0, microsecond=0)
    latest -= timedelta(hours=latest.hour % 6)
    for n in range(RUNS_TRIED):
        run = latest - timedelta(hours=6 * n)
        step = forecast_step(run, target)
        key = (run, step)
        if time.time() - _NOT_UP.get(key, 0) < NOT_UP_RETRY_S:
            continue
        body = _download(run, step)
        if body is None:
            _NOT_UP[key] = time.time()
            continue
        try:
            return _read_grib(body), run, step
        except (ValueError, RuntimeError, AttributeError) as err:
            raise ModelWindsUnavailable(f"the GFS {run:%d%H}Z f{step:03d} could not be read: {err}") from err
    raise ModelWindsUnavailable(f"no GFS run on NOMADS in the last {6 * RUNS_TRIED} hours")


def forecast_step(run: datetime, target: datetime) -> int:
    """The forecast hour of `run` nearest `target`: every hour to
    HOURLY_TO, every third after it (NOMADS' 0.25-degree files)."""
    hours = (target - run).total_seconds() / 3600
    if hours <= HOURLY_TO:
        return max(0, round(hours))
    return min(384, HOURLY_TO + 3 * round((hours - HOURLY_TO) / 3))


def _download(run: datetime, step: int) -> bytes | None:
    params = {
        "dir": f"/gfs.{run:%Y%m%d}/{run:%H}/atmos",
        "file": f"gfs.t{run:%H}z.pgrb2.0p25.f{step:03d}",
        **{f"var_{v}": "on" for v in ("HGT", "TMP", "UGRD", "VGRD")},
        **{f"lev_{p}_mb": "on" for p in LEVELS_HPA},
        "subregion": "",
        **BOX,
    }
    try:
        resp = requests.get(FILTER_URL, params=params, headers=HEADERS, timeout=30)
    except requests.RequestException as err:
        raise ModelWindsUnavailable(f"NOMADS did not answer: {err}") from err
    # A run not posted yet is a 404, or an HTML page saying so.
    if resp.status_code == 404 or not resp.content.startswith(b"GRIB"):
        return None
    if not resp.ok:
        raise ModelWindsUnavailable(f"NOMADS answered {resp.status_code}")
    return resp.content


def _read_grib(body: bytes) -> dict:
    fields = {}
    offset = 0
    while offset < len(body):
        message = gribberish.parse_grib_message(body, offset)
        meta = message.metadata
        lats, lons = (np.asarray(a, dtype=np.float64) for a in meta.latlng())
        values = np.asarray(message.data(), dtype=np.float32).reshape(len(lats), len(lons))
        fields[(meta.var_abbrev, round(meta.level_value / 100))] = (lats, lons, values)
        offset += meta.message_size
    missing = [(v, p) for v in ("HGT", "TMP", "UGRD", "VGRD") for p in LEVELS_HPA if (v, p) not in fields]
    if missing:
        raise ValueError(f"missing {missing[:3]}")
    return fields


def _at_stations(fields: dict) -> dict:
    """Each station's levels from the grid point nearest it: {ident:
    {altitude_ft: {"wind_dir_true_deg", "wind_speed_kt", "temp_c"}}}, each
    level at its own geopotential height, which the planner's altitude
    interpolation takes as it did the FB's columns."""
    out = {}
    for code, (lat, lon) in STATIONS.items():
        levels = {}
        for hpa in LEVELS_HPA:
            height_m = _at(fields[("HGT", hpa)], lat, lon)
            temp_k = _at(fields[("TMP", hpa)], lat, lon)
            u, v = _at(fields[("UGRD", hpa)], lat, lon), _at(fields[("VGRD", hpa)], lat, lon)
            if None in (height_m, temp_k, u, v):
                continue
            speed_kt = math.hypot(u, v) * MS_TO_KT
            # Where the wind blows from, true: u, v are toward east, north.
            direction = (math.degrees(math.atan2(-u, -v)) + 360) % 360
            levels[int(round(height_m * M_TO_FT))] = {
                "wind_dir_true_deg": round(direction),
                "wind_speed_kt": round(speed_kt),
                "temp_c": round(temp_k - 273.15),
            }
        if levels:
            out[str(code)] = levels
    return out


def _at(field: tuple, lat: float, lon: float) -> float | None:
    lats, lons, values = field
    i = int(round((lat - lats[0]) / (lats[1] - lats[0])))
    j = int(round(((lon % 360) - (lons[0] % 360)) / (lons[1] - lons[0])))
    if not (0 <= i < len(lats) and 0 <= j < len(lons)):
        return None
    value = float(values[i, j])
    return None if math.isnan(value) else value


def _iso(at: datetime) -> str:
    return at.strftime("%Y-%m-%dT%H:%M:%SZ")


def _iso_s(text: str) -> float:
    return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
