"""The map's flow layer (the owner, 2026-11-11: Windy's and Apple
Weather's wind map): the model weather's timeline the weather service
stores (services/weather/app/flow.py) -- each hour's frame, which models
and runs made it, and a PNG per field -- and, for the hours already
past, the radar mosaic made by then, which the precipitation field
shows in place of the model's (wingtip.weather_loop's tiles).

Read only from the weather store; nothing here asks NOMADS.
"""

from __future__ import annotations

import calendar
import re
import time
from pathlib import Path

from . import weather_loop, weather_store

#: A frame's hour as its files are named: YYYYMMDDHH.
FRAME_ID = re.compile(r"^\d{10}$")

CREDIT = (
    "Model forecast, not an observation: NOAA HRRR over the lower 48, NOAA GFS beyond, via NOMADS. "
    "Radar: NWS NEXRAD composite via the Iowa Environmental Mesonet. Not for navigation."
)


def _epoch(iso: str) -> float:
    return float(calendar.timegm(time.strptime(iso[:19], "%Y-%m-%dT%H:%M:%S")))


def _frame_id(iso: str) -> str:
    return iso[0:4] + iso[5:7] + iso[8:10] + iso[11:13]


def layer(now: float | None = None) -> dict | None:
    """The timeline as the apps draw it: {"frames" (oldest first, each
    {"id", "valid", "model", "gfs_run", "gfs_forecast_hour", "hrrr_run",
    "hrrr_forecast_hour", "past", "fields", "radar_tiles"}), "bounds"
    [west, south, east, north], "fields" {name: {"unit", "unscale",
    "vector"}}, "fetched_at", "credit"}; None where the service has stored
    none or what it stored is past serving."""
    now = time.time() if now is None else now
    record = weather_store.read("flow")
    if not weather_store.servable(record, now) or record is None:
        return None
    weather_store.mark_asked()
    data = record.data or {}
    radar_newest = weather_loop.newest_radar()
    frames = []
    for f in data.get("frames", []):
        valid = _epoch(f["valid"])
        past = valid <= now
        radar = None
        if past and radar_newest is not None and radar_newest >= valid - weather_loop.RADAR_OLD_AFTER_S:
            # The newest mosaic made by the frame's hour, or the newest of
            # all for the current hour's frame.
            at = min(radar_newest, valid // weather_loop.RADAR_STEP_S * weather_loop.RADAR_STEP_S)
            if valid > now - 3600:
                at = radar_newest
            radar = weather_loop.radar_tiles(at)
        key = f.get("key") or {}
        gfs, hrrr = key.get("gfs") or {}, key.get("hrrr") or {}
        frames.append(
            {
                "id": _frame_id(f["valid"]),
                "valid": f["valid"],
                "model": f.get("model", "GFS"),
                "gfs_run": gfs.get("run"),
                "gfs_forecast_hour": gfs.get("forecast_hour"),
                "hrrr_run": hrrr.get("run"),
                "hrrr_forecast_hour": hrrr.get("forecast_hour"),
                "past": past,
                "fields": sorted(f.get("files", {})),
                "radar_tiles": radar,
            }
        )
    return {
        "frames": frames,
        "bounds": data.get("bounds"),
        "fields": data.get("fields", {}),
        "fetched_at": record.fetched_at,
        "credit": CREDIT,
    }


def picture(frame_id: str, field: str) -> Path | None:
    """A frame's PNG of `field`, where the record lists it; None otherwise."""
    if not FRAME_ID.match(frame_id):
        return None
    record = weather_store.read("flow")
    if record is None:
        return None
    for f in (record.data or {}).get("frames", []):
        if _frame_id(f["valid"]) == frame_id:
            name = f.get("files", {}).get(field)
            return weather_store.blob_path(name, ".png") if name else None
    return None
