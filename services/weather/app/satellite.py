"""When each GOES satellite picture the map's loop can draw was taken:
NOAA nowCOAST's own list of the times its GOES East and West composites
hold (the WMS capabilities' time dimension), stored ("satellite") for the
planner's loop frames to read (wingtip.weather_loop). The pictures
themselves are tiles the apps ask nowCOAST for; nothing else is fetched.

nowCOAST (NOAA's National Ocean Service) publishes the GOES-19 (East) and
GOES-18 (West) ABI imagery, longwave infrared band 14 (11.2 um) and
visible band 2 (0.64 um), every five minutes, about six hours of it, over
WMS with a time dimension. Its capabilities say Fees NONE and
AccessConstraints NONE; NOAA's data are in the public domain
(weather.gov/disclaimer), credited in the apps.
"""

from __future__ import annotations

import calendar
import time
import xml.etree.ElementTree as ET

import requests
from wingtip import outside, weather_store
from wingtip.config import REQUEST_HEADERS as HEADERS

#: nowCOAST's satellite WMS: its capabilities list each layer's times.
CAPABILITIES_URL = "https://nowcoast.noaa.gov/geoserver/satellite/wms?service=WMS&version=1.3.0&request=GetCapabilities"

#: The store's names of the two pictures, by nowCOAST's layer.
LAYERS = {"ir": "goes_longwave_imagery", "visible": "goes_visible_imagery"}

#: How far back the times are kept: the loop goes back two hours at most.
KEEP_S = 3 * 3600

_WMS = "{http://www.opengis.net/wms}"


class SatelliteUnavailable(RuntimeError):
    """nowCOAST did not answer, or answered with no times."""


def times_in(capabilities: bytes, now: float) -> dict[str, list[str]]:
    """Each picture's times in the capabilities, ISO UTC, oldest first,
    those of the last KEEP_S only. A layer missing has an empty list."""
    root = ET.fromstring(capabilities)
    out: dict[str, list[str]] = {}
    for key, name in LAYERS.items():
        times: list[str] = []
        for layer in root.iter(f"{_WMS}Layer"):
            if layer.findtext(f"{_WMS}Name") != name:
                continue
            for dim in layer.findall(f"{_WMS}Dimension"):
                if dim.get("name") == "time" and dim.text:
                    times = [t.strip() for t in dim.text.split(",") if t.strip()]
            break
        out[key] = sorted({_iso(t) for t in times if _epoch(t) >= now - KEEP_S})
    return out


def _epoch(iso: str) -> float:
    return float(calendar.timegm(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S")))


def _iso(iso: str) -> str:
    """nowCOAST's "2026-11-09T21:18:00.000Z" as "2026-11-09T21:18:00Z"."""
    return f"{iso[:19]}Z"


def fetch() -> None:
    """nowCOAST's capabilities read and each picture's times stored.
    Raises SatelliteUnavailable where it does not answer or lists none,
    the stored times left in place."""
    try:
        resp = outside.get(CAPABILITIES_URL, headers=HEADERS, timeout=20)
        resp.raise_for_status()
    except requests.RequestException as err:
        raise SatelliteUnavailable(f"nowCOAST did not answer: {err}") from err
    now = time.time()
    times = times_in(resp.content, now)
    if not any(times.values()):
        raise SatelliteUnavailable("nowCOAST listed no GOES pictures in the last three hours")
    weather_store.write("satellite", times, fetched_at=now, until=None)
