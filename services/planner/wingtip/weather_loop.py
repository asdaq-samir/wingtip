"""The radar and satellite loop on the map (the owner, 2026-11-09: "Can you
add weather now?"): which frames there are, when each was made, and the
tile address of each, for the apps to preload and play. The apps draw
the tiles straight from their sources; this module only says which.

Sources, both US government data in the public domain:

- **Radar**: the NWS NEXRAD base reflectivity composite (N0Q) of the
  lower 48, mosaicked every five minutes by the Iowa Environmental
  Mesonet (Iowa State University), whose tile cache serves any past
  mosaic by its time (`ridge::USCOMP-N0Q-YYYYMMDDHHMI`, "constant
  availability at minute modulo 5", mesonet.agron.iastate.edu/ogc/), in
  the NWS's standard dBZ colours. IEM's terms: "in the public domain and
  may be used freely by anyone for any lawful purpose", attribution
  appreciated (mesonet.agron.iastate.edu/disclaimer.php). The newest
  mosaic's time is IEM's own record, as the weather service last read it
  (services/weather/app/radar.py).
- **Satellite**: GOES-19 (East) and GOES-18 (West) ABI longwave infrared
  (band 14, 11.2 um) and visible (band 2) composites from NOAA's
  nowCOAST, over WMS with a time dimension, every five minutes; Fees
  NONE, AccessConstraints NONE in its capabilities, NOAA's data in the
  public domain (weather.gov/disclaimer). Which times it holds is its
  capabilities' list, as the weather service last read it
  (services/weather/app/satellite.py).

When a frame counts as old is not an aviation rule but this feed's
health: three of a source's own updates missed. Neither is for avoiding
weather close in; the credits say "Not for navigation".
"""

from __future__ import annotations

import calendar
import time
from typing import Literal

from . import weather_store

Kind = Literal["radar", "ir", "visible", "both"]

#: IEM's tile cache of the radar mosaic at a time, through its long-cached
#: address (/c/: two weeks, since a past mosaic never changes).
RADAR_TILES = "https://mesonet.agron.iastate.edu/c/tile.py/1.0.0/ridge::USCOMP-N0Q-{stamp}/{z}/{x}/{y}.png"

#: nowCOAST's GOES picture at a time, as 256-pixel tiles of web Mercator:
#: `{bbox-epsg-3857}` is the tile's box, which MapLibre fills itself and
#: the iPhone's tile overlay works out from z, x and y.
SATELLITE_TILES = (
    "https://nowcoast.noaa.gov/geoserver/satellite/wms?service=WMS&version=1.3.0&request=GetMap"
    "&layers={layer}&styles=&format=image/png&transparent=true&crs=EPSG:3857&width=256&height=256"
    "&bbox={bbox-epsg-3857}&time={time}"
)

#: nowCOAST's layers, by the store's name of each picture.
SATELLITE_LAYERS = {"ir": "goes_longwave_imagery", "visible": "goes_visible_imagery"}

#: How many frames a loop has: twelve, the radar's last hour at its own
#: five-minute step, or the satellite's last two at ten.
FRAMES = 12
RADAR_STEP_S = 300
SATELLITE_STEP_S = 600

#: A frame is old once its source has missed three of its updates: the
#: radar mosaic is made every five minutes, a GOES picture every five
#: and nowCOAST takes it in within about ten.
RADAR_OLD_AFTER_S = 15 * 60
SATELLITE_OLD_AFTER_S = 30 * 60

#: What the apps credit, the providers and the products in their words.
CREDIT = (
    "Radar: NWS NEXRAD composite via the Iowa Environmental Mesonet, Iowa State University. "
    "Satellite: NOAA GOES East and West via NOAA nowCOAST. Not for navigation; check official weather."
)


def _epoch(iso: str) -> float:
    return float(calendar.timegm(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S")))


def _iso(t: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


def newest_radar() -> float | None:
    """When the newest radar mosaic was made, on its five-minute step."""
    record = weather_store.read("radar")
    valid = (record.data or {}).get("valid") if record else None
    if not valid:
        return None
    return _epoch(valid) // RADAR_STEP_S * RADAR_STEP_S


def _satellite_times(picture: str) -> list[float]:
    """The picture's times nowCOAST holds, oldest first."""
    record = weather_store.read("satellite")
    times = (record.data or {}).get(picture, []) if record else []
    return sorted(_epoch(t) for t in times)


def _spaced(times: list[float], step_s: float) -> list[float]:
    """The newest of `times` and, going back, each at least `step_s` before
    the one after it: FRAMES at most, oldest first."""
    out: list[float] = []
    for t in reversed(times):
        if not out or out[-1] - t >= step_s - 60:
            out.append(t)
        if len(out) == FRAMES:
            break
    return out[::-1]


def radar_tiles(at: float) -> str:
    return RADAR_TILES.replace("{stamp}", time.strftime("%Y%m%d%H%M", time.gmtime(at)))


def satellite_tiles(picture: str, at: float) -> str:
    return SATELLITE_TILES.replace("{layer}", SATELLITE_LAYERS[picture]).replace("{time}", _iso(at))


def frames(kind: Kind) -> dict:
    """The loop of `kind` as the apps play it: {"kind", "frames" (oldest
    first, each {"valid" ISO UTC, "radar_tiles", "satellite_tiles"} --
    an XYZ template or None), "step_s", "old_after_s", "credit"}.

    Radar alone: the newest mosaic and the eleven before it, five minutes
    apart. A satellite picture: nowCOAST's newest and back ten minutes at
    a time. Both: the infrared's frames, each with the newest radar mosaic
    made by then, and the frame's time the older of the two, so the age
    shown is never younger than what is drawn. A source with nothing
    stored gives no frames of its own."""
    radar_newest = newest_radar()
    if kind == "radar":
        if radar_newest is None:
            stamps: list[tuple[float, float | None, float | None]] = []
        else:
            stamps = [(t, t, None) for t in (radar_newest - i * RADAR_STEP_S for i in range(FRAMES - 1, -1, -1))]
        old_after = RADAR_OLD_AFTER_S
        step = RADAR_STEP_S
    else:
        picture = "visible" if kind == "visible" else "ir"
        stamps = []
        for t in _spaced(_satellite_times(picture), SATELLITE_STEP_S):
            radar = None
            if kind == "both" and radar_newest is not None:
                radar = min(t // RADAR_STEP_S * RADAR_STEP_S, radar_newest)
            stamps.append((t if radar is None else min(t, radar), radar, t))
        old_after = RADAR_OLD_AFTER_S if kind == "both" else SATELLITE_OLD_AFTER_S
        step = SATELLITE_STEP_S
    out = []
    for valid, radar, sat in stamps:
        out.append(
            {
                "valid": _iso(valid),
                "radar_tiles": None if radar is None else radar_tiles(radar),
                "satellite_tiles": None if sat is None else satellite_tiles("visible" if kind == "visible" else "ir", sat),
            }
        )
    return {"kind": kind, "frames": out, "step_s": step, "old_after_s": old_after, "credit": CREDIT}
