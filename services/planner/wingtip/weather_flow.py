"""The map's flow layer (the owner, 2026-11-11: Windy's and Apple
Weather's wind map): the model weather's timeline the weather service
stores (services/weather/app/flow.py) -- each hour's frame, which models
and runs made it, and a PNG per field -- and, for the hours already
past, the radar mosaic made by then, which the precipitation field
shows in place of the model's (wingtip.weather_loop's tiles).

Read only from the weather store; nothing here asks AWC or NOMADS.
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
    "Aviation Weather Center (aviationweather.gov): GFA winds and clouds, IFI icing, GTG turbulence. "
    "NOAA HRRR and GFS via NOMADS for precipitation, ceiling, temperature, visibility, CAPE and freezing level. "
    "Radar: NWS NEXRAD composite via the Iowa Environmental Mesonet."
)

#: Each source's name on the legend, by the frame's part and the field.
LABELS = {
    "awc": lambda field: "AWC clouds" if field in ("cloud", "tops") else "AWC winds",
    "dafs": lambda field: "AWC icing" if field.startswith("icing") else "AWC turbulence",
    "aloft": lambda field: "NOAA GFS",
}
#: How old a part's run may be before the legend shows its time in the
#: caution colour, seconds: the source's cadence and a margin -- the GFA,
#: IFI and GTG a cycle every hour, two hours more (as app.flow's
#: AWC_MARGIN); the GFS every six hours, posted about four after, two more.
#: The feed's health, not an aviation rule.
STALE_AFTER_S = {"awc": 3 * 3600, "dafs": 3 * 3600, "nomads": 12 * 3600, "aloft": 12 * 3600}
#: The fields NOMADS gives only in AWC's place (app.flow's fallback).
FALLBACK_FIELDS = ("wind", "gust", "cloud")


def _issued(part_name: str, key: dict, field: str) -> str | None:
    """When the run a part's picture came from was made, ISO UTC."""
    if part_name == "awc":
        return key.get("cycle")
    if part_name == "dafs":
        return (key.get("icing" if field.startswith("icing") else "turbulence") or {}).get("cycle")
    if part_name == "nomads":
        return (key.get("gfs") or {}).get("run")
    return key.get("run")


def field_sources(frame: dict, now: float) -> dict[str, dict]:
    """Each field's source as the legend says it: {"label", "issued",
    "stale", "fallback"}."""
    out = {}
    parts = frame.get("parts") or {}
    for field, part_name in (frame.get("sources") or {}).items():
        key = (parts.get(part_name) or {}).get("key") or {}
        issued = _issued(part_name, key, field)
        fallback = part_name in ("nomads", "aloft") and (field in FALLBACK_FIELDS or field.startswith("wind-"))
        if part_name == "nomads":
            label = "NOAA HRRR and GFS" if key.get("hrrr") else "NOAA GFS"
        else:
            label = LABELS[part_name](field)
        out[field] = {
            "label": label,
            "issued": issued,
            "stale": issued is None or now - _epoch(issued) > STALE_AFTER_S[part_name],
            "fallback": fallback,
        }
    return out


def _version(blob: str) -> str:
    """The run tag a picture's blob name ends with (the weather service's
    app.flow_store): its address changes only when its picture does."""
    return blob.rsplit("-", 1)[-1]


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
                "versions": {field: _version(blob) for field, blob in f.get("files", {}).items()},
                "sources": field_sources(f, now),
                "radar_tiles": radar,
            }
        )
    return {
        "frames": frames,
        "bounds": data.get("bounds"),
        "world_bounds": data.get("world_bounds"),
        "levels": data.get("levels") or {},
        "fields": data.get("fields", {}),
        "fetched_at": record.fetched_at,
        "credit": CREDIT,
    }


def picture(frame_id: str, field: str) -> tuple[Path, str] | None:
    """A frame's PNG of `field` and its version (_version), where the
    record lists it; None otherwise."""
    if not FRAME_ID.match(frame_id):
        return None
    record = weather_store.read("flow")
    if record is None:
        return None
    for f in (record.data or {}).get("frames", []):
        if _frame_id(f["valid"]) == frame_id:
            name = f.get("files", {}).get(field)
            return (weather_store.blob_path(name, ".png"), _version(name)) if name else None
    return None
