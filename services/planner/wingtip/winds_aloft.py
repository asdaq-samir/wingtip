"""The winds and temperatures aloft a plan flies, from the grid the map's
Model Weather layer draws (the owner, 2026-11-12: the map and the plan
agree): the Aviation Weather Center's GFA wind at its levels, and the
GFS's temperature there, each hour of the layer's timeline -- the last
hour, now, and every second hour to twelve ahead -- as the weather service
keeps them as numbers beside the pictures (services/weather/app/flow.py,
flow_store's store_numbers). Where AWC's part of an hour is past its
margin the frame's wind is NOAA's GFS in its place, as on the map, and
the nav log says so (winds_period's label). Read only from the weather
store: no pilot's request waits on AWC or NOMADS.

A plan's winds are named by a key (winds_key_for): its departure time
to the quarter hour where the grid's timeline holds it ("2026-11-12T15:15Z"),
and past the timeline -- tomorrow's flight -- the GFS's FB-station period
that holds it ("06", "12", "24"; wingtip.winds_stations), as before. Each
leg is read at its own time (later: the departure and the time to the
leg's middle at the airplane's cruise speed), at its middle, its
altitude between the grid's levels and its time between the grid's
hours: the engine's wind_aloft_at. Between the grid's points, the four
round the place weighed by nearness (bilinear), as the map's renderer
draws between them.
"""

from __future__ import annotations

import math
import re
import time
from datetime import datetime, timezone

import numpy as np

from . import weather, weather_flow, weather_store, winds_stations
from .engine import ask

#: A grid key's form: the time, UTC, to the minute.
_GRID_KEY = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\dZ$")
#: A key's time is rounded to this, so plans for "now" made a few minutes
#: apart share their cached work.
KEY_STEP_S = 900

# What the grid's numbers give, per record held: the arrays mapped, each
# frame's column at a place, and each altitude's air read from them.
_HELD: dict = {"record": None, "arrays": {}, "columns": {}, "air": {}}
_AIR_KEPT = 50_000
#: The most grid points route options are given at the half degree.
WIND_POINTS_MOST = 600


def _record():
    """The flow record, where it may be served and holds numbers."""
    record = weather_store.read("flow")
    if not weather_store.servable(record) or record is None or not (record.data or {}).get("numbers_grid"):
        return None
    if _HELD["record"] is not record:
        _HELD.update(record=record, arrays={}, columns={}, air={})
    return record


def _epoch(iso: str) -> float:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def _iso(at_s: float) -> str:
    return datetime.fromtimestamp(at_s, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _frames(record) -> list[tuple[float, dict]]:
    """The record's hours that hold numbers, oldest first."""
    frames = [(_epoch(f["valid"]), f) for f in (record.data or {}).get("frames", [])]
    return sorted(((t, f) for t, f in frames if any((p or {}).get("numbers") for p in (f.get("parts") or {}).values())), key=lambda x: x[0])


def _key(at_s: float) -> str:
    return datetime.fromtimestamp(round(at_s / KEY_STEP_S) * KEY_STEP_S, timezone.utc).strftime("%Y-%m-%dT%H:%MZ")


def is_grid(key: str | None) -> bool:
    return bool(key) and bool(_GRID_KEY.match(key))


def winds_key_for(depart: datetime | None) -> str:
    """The winds a departure flies (now where None; a naive time is UTC):
    the grid at its time where the grid's timeline holds it, else the
    GFS stations' period whose window does (winds_stations)."""
    at = datetime.now(timezone.utc) if depart is None else depart if depart.tzinfo else depart.replace(tzinfo=timezone.utc)
    # A pilot is planning: the weather service keeps the store at its pace.
    weather_store.mark_asked()
    record = _record()
    frames = _frames(record) if record is not None else []
    if frames and frames[0][0] <= at.timestamp() <= frames[-1][0]:
        return _key(at.timestamp())
    return winds_stations.station_period_for(depart)


def later(key: str | None, seconds: float) -> str | None:
    """The key `seconds` after `key`'s time: a leg's, from the departure's.
    A stations period is the flight's whole."""
    if not is_grid(key) or not seconds:
        return key
    return _key(_epoch(key.replace("Z", ":00Z")) + seconds)


def _at_s(key: str) -> float:
    return _epoch(key.replace("Z", ":00Z"))


def _resolved(key: str | None) -> str:
    """`key`, now's where None; a grid key whose grid is gone since, the
    stations' period for its time."""
    if key is None:
        key = winds_key_for(None)
    if is_grid(key) and _record() is None:
        return winds_stations.station_period_for(datetime.fromtimestamp(_at_s(key), timezone.utc))
    return key


def _bracket(at_s: float) -> list[tuple[float, dict]]:
    """The grid's hours round `at_s`: the one before and the one after, or
    the nearest at the ends."""
    frames = _frames(_HELD["record"])
    before = [f for f in frames if f[0] <= at_s]
    after = [f for f in frames if f[0] > at_s]
    return [*before[-1:], *after[:1]] or frames[:1]


def _array(name: str):
    held = _HELD["arrays"].get(name)
    if held is None:
        try:
            held = weather_store.read_array(name)
        except (OSError, ValueError):
            held = False
        _HELD["arrays"][name] = held
    return None if held is False else held


def _sample(numbers: dict | None, lat: float, lon: float) -> dict[str, list[float | None]]:
    """A part's fields at its levels at (lat, lon), bilinear between the
    four grid points round it (a point with nothing, under the ground or
    past the GFA's domain, left out of the weighing): {field: [value or
    None a level]}."""
    grid = (_HELD["record"].data or {})["numbers_grid"]
    array = _array(numbers["array"]) if numbers else None
    if array is None:
        return {}
    row = (grid["north"] - lat) / grid["step"]
    col = (((lon - grid["west"]) + 360.0) % 360.0) / grid["step"]
    r0, c0 = int(math.floor(row)), int(math.floor(col))
    if not (0 <= r0 < grid["rows"] - 1 and 0 <= c0 < grid["cols"] - 1):
        return {}
    fr, fc = row - r0, col - c0
    corners = np.asarray(array[:, :, r0 : r0 + 2, c0 : c0 + 2], dtype=np.float64)
    weights = np.array([[(1 - fr) * (1 - fc), (1 - fr) * fc], [fr * (1 - fc), fr * fc]])
    have = np.isfinite(corners)
    total = np.where(have, weights, 0.0).sum(axis=(2, 3))
    value = np.where(have, corners * weights, 0.0).sum(axis=(2, 3)) / np.where(total > 0, total, 1.0)
    return {f: [float(v) if t > 0 else None for v, t in zip(value[i], total[i])] for i, f in enumerate(numbers["fields"])}


def _column(at: tuple[float, dict], lat: float, lon: float) -> dict:
    """One hour's column at (lat, lon), as the engine's wind_aloft_at takes
    it: each level's wind from the part the map draws it from (the frame's
    "sources": AWC's, or the GFS's in its place) and the GFS's temperature."""
    valid_s, frame = at
    held_key = (valid_s, round(lat, 4), round(lon, 4))
    held = _HELD["columns"].get(held_key)
    if held is not None:
        return held
    parts, sources = frame.get("parts") or {}, frame.get("sources") or {}
    read = {name: _sample((parts.get(name) or {}).get("numbers"), lat, lon) for name in ("awc", "aloft")}
    levels = {}
    for name in ("awc", "aloft"):
        for i, level in enumerate(((parts.get(name) or {}).get("numbers") or {}).get("levels", [])):
            at_level = levels.setdefault(level["id"], {"altitude_ft": level["ft"], "u_kt": None, "v_kt": None, "temp_c": None})
            values = {f: read[name][f][i] for f in read[name]}
            if sources.get(f"wind-{level['id']}") == name and "u" in values:
                at_level.update(u_kt=values["u"], v_kt=values.get("v"))
            if name == "aloft" and "temp" in values:
                at_level["temp_c"] = values["temp"]
    column = {"valid_s": valid_s, "levels": sorted(levels.values(), key=lambda lv: lv["altitude_ft"])}
    _HELD["columns"][held_key] = column
    return column


def _air(lat: float, lon: float, altitudes: list[float], key: str) -> list[dict]:
    """The air at each of `altitudes` over (lat, lon) at `key`'s time:
    [{"wind" (or None), "temp_c" (or None)}], the engine's wind_aloft_at."""
    at_s = _at_s(key)
    hours = [_column(f, lat, lon) for f in _bracket(at_s)]
    return ask("wind_aloft_at", hours=hours, at_s=at_s, altitudes=[float(a) for a in altitudes])


def _air_at(lat: float, lon: float, altitude_ft: float, key: str) -> dict:
    held_key = (round(lat, 4), round(lon, 4), float(altitude_ft), key)
    held = _HELD["air"].get(held_key)
    if held is None:
        if len(_HELD["air"]) > _AIR_KEPT:
            _HELD["air"].clear()
        held = _HELD["air"][held_key] = _air(lat, lon, [altitude_ft], key)[0]
    return held


def wind_at_altitude(lat: float, lon: float, altitude_ft: float, key: str | None = None) -> dict | None:
    """The wind ({"wind_dir_true_deg", "wind_speed_kt"}) at an altitude
    over a place at `key`'s time; None where none is known, never calm."""
    key = _resolved(key)
    if not is_grid(key):
        return winds_stations.wind_at_altitude(lat, lon, altitude_ft, key)
    return _air_at(lat, lon, altitude_ft, key)["wind"]


def temperature_at_altitude(lat: float, lon: float, altitude_ft: float, key: str | None = None) -> float | None:
    """The temperature at an altitude over a place at `key`'s time; None
    where none is known (a standard day then, assumed, not known)."""
    key = _resolved(key)
    if not is_grid(key):
        return weather.temperature_at(winds_stations.temperatures_aloft(lat, lon, key), altitude_ft)
    return _air_at(lat, lon, altitude_ft, key)["temp_c"]


def temperatures_aloft(lat: float, lon: float, key: str | None = None) -> list:
    """The temperatures over a place at `key`'s time, [(altitude_ft,
    temp_c)] at the grid's levels from the lowest up; empty where none."""
    key = _resolved(key)
    if not is_grid(key):
        return winds_stations.temperatures_aloft(lat, lon, key)
    hours = _bracket(_at_s(key))
    heights = sorted({lv["altitude_ft"] for f in hours for lv in _column(f, lat, lon)["levels"]})
    air = _air(lat, lon, heights, key) if heights else []
    return [(ft, a["temp_c"]) for ft, a in zip(heights, air) if a["temp_c"] is not None]


def wind_points(box: tuple, key: str | None, altitudes: list) -> list[dict]:
    """The wind at each of `altitudes` at points over `box` (south, west,
    north, east), [{"lat", "lon", "winds": [[dir, kt] or None]}], for the
    engine's route options, which take the nearest to each cell: the
    grid's own points, every half degree, or every degree over a box so
    wide the half would be more than WIND_POINTS_MOST."""
    key = _resolved(key)
    if not is_grid(key):
        return winds_stations.wind_points(box, key, altitudes)
    south, west, north, east = box
    step = (_HELD["record"].data or {})["numbers_grid"]["step"]
    if ((north - south) / step + 1) * ((east - west) / step + 1) > WIND_POINTS_MOST:
        step *= 2
    out = []
    for lat in np.arange(math.ceil(south / step) * step, north + 1e-9, step):
        for lon in np.arange(math.ceil(west / step) * step, east + 1e-9, step):
            air = _air(float(lat), float(lon), altitudes, key)
            winds = [[a["wind"]["wind_dir_true_deg"], a["wind"]["wind_speed_kt"]] if a["wind"] else None for a in air]
            if any(winds):
                out.append({"lat": float(lat), "lon": float(lon), "winds": winds})
    return out


def winds_period(key: str | None = None) -> dict | None:
    """Whose winds a plan flies, for the nav log to say: {"valid_at" (the
    departure's time), "use_from", "use_to" (the grid's hours round it),
    "run" (AWC's cycle, or the GFS's run in its place), "forecast_hour",
    "source" ("awc", "gfs" in AWC's place, "gfs-stations" past the grid),
    "label" ("AWC winds, 12Z"; "NOAA GFS winds, 06Z, in place of AWC"),
    "fallback", "stale" (the map legend's own: the run past its source's
    cadence and margin), "modelled"}; None where none can be had."""
    key = _resolved(key)
    if not is_grid(key):
        return winds_stations.winds_period(key)
    at_s = _at_s(key)
    hours = _bracket(at_s)
    if not hours:
        return None
    valid_s, frame = hours[0]
    fields = weather_flow.field_sources(frame, time.time())
    level = next((f for f in sorted(fields) if f.startswith("wind-")), None)
    if level is None:
        return None
    wind = fields[level]
    part = (frame.get("parts") or {}).get((frame.get("sources") or {})[level]) or {}
    issued = wind.get("issued")
    hour = f", {issued[11:13]}Z" if issued else ""
    label = f"NOAA GFS winds{hour}, in place of AWC" if wind["fallback"] else f"AWC winds{hour}"
    span = (hours[0][0], hours[-1][0]) if len(hours) > 1 else (valid_s - 3600, valid_s + 3600)
    return {
        "valid_at": _iso(at_s),
        "use_from": _iso(span[0]),
        "use_to": _iso(span[1]),
        "run": issued,
        "forecast_hour": (part.get("key") or {}).get("forecast_hour"),
        "modelled": bool(wind["fallback"]),
        "source": "gfs" if wind["fallback"] else "awc",
        "label": label,
        "fallback": bool(wind["fallback"]),
        "stale": bool(wind["stale"]),
    }
