"""When the radar mosaic the map draws was made: the Iowa Environmental
Mesonet's own record of its NEXRAD composite (n0q), which the browser
draws as tiles itself. Stored ("radar") for the planner's map weather to
say (wingtip.weather_map.radar_valid). Moved from the planner (#535),
which asked IEM on the map's way."""

from __future__ import annotations

import time

import requests
from wingtip import outside, weather_store
from wingtip.config import REQUEST_HEADERS as HEADERS

#: The radar mosaic's own record of when it was made (IEM's n0q JSON).
RADAR_META_URL = "https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json"


class RadarUnavailable(RuntimeError):
    """IEM did not answer."""


def fetch() -> None:
    """IEM's record read and its time stored. Raises RadarUnavailable where
    it does not answer, the stored time left in place."""
    try:
        resp = outside.get(RADAR_META_URL, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        valid = resp.json().get("meta", {}).get("valid")
    except (requests.RequestException, ValueError) as err:
        raise RadarUnavailable(f"IEM did not answer: {err}") from err
    weather_store.write("radar", {"valid": valid}, fetched_at=time.time(), until=None)
