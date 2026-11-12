"""Modelled ceiling and visibility anywhere in the lower 48, for a field
with no weather report of its own: the National Weather Service's Gridded
LAMP (GLMP), its analysis hour ("hr00"), on the National Blend of Models'
2.5 km CONUS grid.

GLMP blends the latest observations into a statistical model and is
issued every hour at half past. It is planning guidance, not an
observation: the card says the weather is modelled, and the pilot still
reads the nearest reports and asks Flight Service.

The weather service (services/weather/app/glmp.py) fetches each issue
from NOMADS, reads its two GRIB2 grids and stores them in the weather
store (wingtip.weather_store, "glmp"): the grid's projection and spacing
in the record, the values as float32 arrays beside it, twelve megabytes
each, which this module maps rather than reads in. A point is found on
them through the grid's own Lambert conformal projection, as eccodes'
nearest-point search finds it (checked at six points across the grid,
2026-10-10). An issue is served while it is one of the last three posted
(the record's `until`); NOMADS is never asked from here.
"""

from __future__ import annotations

import json
import logging
import math
import sys
import threading
from datetime import datetime, timezone

import numpy as np
import wingtip_native
from pyproj import Proj

from . import weather_store
from .units import M_PER_SM, M_TO_FT

log = logging.getLogger(__name__)

#: GLMP's ceiling where there is none: no layer broken or overcast.
_NO_CEILING_M = -100.0


class GlmpUnavailable(RuntimeError):
    """No recent issue is in the weather store."""


class _Grid:
    """One field's values on the NBM CONUS grid, and how to find a point
    on it: `grid` as the weather service stored it ({"x0", "dx", "y0",
    "dy", "nx", "ny", "proj", "valid", "array"}), its values the array
    named."""

    def __init__(self, grid: dict):
        self.x0, self.dx, self.y0, self.dy = (float(grid[k]) for k in ("x0", "dx", "y0", "dy"))
        self.nx, self.ny = int(grid["nx"]), int(grid["ny"])
        self.proj = Proj(grid["proj"])
        self.valid = datetime.fromisoformat(grid["valid"].replace("Z", "+00:00"))
        # Missing points are NaN.
        self.values = weather_store.read_array(grid["array"])
        if self.values.shape != (self.ny, self.nx):
            raise ValueError("not the grid its record describes")

    def at(self, lat: float, lon: float) -> float | None:
        """The value at the grid point nearest (lat, lon); None off the
        grid or where it has none."""
        x, y = self.proj(lon, lat)
        i, j = round((x - self.x0) / self.dx), round((y - self.y0) / self.dy)
        if not (0 <= i < self.nx and 0 <= j < self.ny):
            return None
        value = float(self.values[j, i])
        return None if np.isnan(value) else value


# The issue's two grids, made once per record: (record, ceiling, visibility).
_HELD: dict = {}
_LOCK = threading.Lock()


def _grids(now: datetime) -> tuple[_Grid, _Grid]:
    """The latest issue's ceiling and visibility, as stored. GLMP is hourly
    guidance with no period of validity of its own (NWS MDL, Gridded LAMP),
    so an issue is served while it is one of the last three posted -- the
    age a late issue may reach on a normal day -- and its "valid_at" tells
    the card how old it is."""
    record = weather_store.read("glmp")
    if not weather_store.servable(record, now.timestamp()):
        raise GlmpUnavailable("no GLMP issue in the last three hours")
    with _LOCK:
        held = _HELD.get("issue")
        if held is not None and held[0] is record:
            return held[1], held[2]
        try:
            grids = _Grid(record.data["cig"]), _Grid(record.data["vis"])
        except (KeyError, OSError, ValueError) as err:
            raise GlmpUnavailable(f"GLMP's stored issue could not be read: {err}") from err
        _HELD["issue"] = (record, *grids)
        return grids


def flight_category(ceiling_ft: float | None, visibility_sm: float) -> str:
    """AIM 7-1-7's categories: LIFR under a 500 ft ceiling or 1 sm; IFR
    under 1,000 ft or 3 sm; MVFR at 3,000 ft or 5 sm and under; VFR above
    both. No ceiling is no limit by ceiling. Worked out by the engine
    (wingtip_engine::forecast, through wingtip_native), the one copy the web
    app's categoryOf and the phones share."""
    asked = {"ceiling_ft": None if ceiling_ft is None else _finite(ceiling_ft), "visibility_sm": _finite(visibility_sm)}
    return json.loads(wingtip_native.call("flight_category", json.dumps(asked)))


def _finite(x: float) -> float:
    """A figure as JSON can carry it (a grid's float32 as a float): an
    unlimited one as the largest float, which every bound passes alike."""
    x = float(x)
    return x if math.isfinite(x) else (sys.float_info.max if x > 0 or math.isnan(x) else -sys.float_info.max)


def at(lat: float, lon: float, now: datetime | None = None) -> dict | None:
    """The modelled weather at a point: {"ceiling_ft" (above the ground,
    None with no ceiling), "visibility_sm", "flight_category", "valid_at"
    (ISO, UTC)}; None off the grid. Raises GlmpUnavailable where no
    recent issue can be had."""
    ceiling_grid, visibility_grid = _grids(now or datetime.now(timezone.utc))
    ceiling_m, visibility_m = ceiling_grid.at(lat, lon), visibility_grid.at(lat, lon)
    if ceiling_m is None or visibility_m is None:
        return None
    ceiling_ft = None if ceiling_m <= _NO_CEILING_M else ceiling_m * M_TO_FT
    visibility_sm = visibility_m / M_PER_SM
    # The category from the figures as modelled, before they are rounded
    # to say: 3,040 ft is VFR, though it reads 3,000.
    return {
        "ceiling_ft": None if ceiling_ft is None else round(ceiling_ft, -2),
        "visibility_sm": round(visibility_sm, 1),
        "flight_category": flight_category(ceiling_ft, visibility_sm),
        "valid_at": ceiling_grid.valid.isoformat().replace("+00:00", "Z"),
    }


# The forecast hours' grids, made once per record: (record, [(valid, ceiling, visibility)]).
_FORECAST: dict = {}


def _forecast_grids() -> list:
    """The latest issue's forecast hours as the weather service stored them
    ("glmp-forecast", services/weather/app/glmp_forecast.py): [(valid,
    ceiling grid, visibility grid)], the hours in order; none where no
    issue is held that may still be served."""
    record = weather_store.read("glmp-forecast")
    if not weather_store.servable(record):
        return []
    with _LOCK:
        held = _FORECAST.get("issue")
        if held is not None and held[0] is record:
            return held[1]
        try:
            hours = [
                (datetime.fromisoformat(h["valid"].replace("Z", "+00:00")).timestamp(), _Grid(h["cig"]), _Grid(h["vis"]))
                for h in record.data["hours"]
            ]
        except (KeyError, OSError, ValueError) as err:
            log.warning("GLMP's stored forecast could not be read: %s", err)
            return []
        _FORECAST["issue"] = (record, hours)
        return hours


def forecast_at(lat: float, lon: float, start: float, end: float) -> list[dict]:
    """The Gridded LAMP's forecast hours at a point valid within [start,
    end] (UNIX seconds), each {"valid", "ceiling_ft" (above the ground,
    None with no ceiling), "visibility_sm"}: the figures the engine's
    forecast dry run reads the hour nearest its time from
    (forecast/run, MODELLED_REACH_S). Empty off the grid or where no
    forecast is held: the run then reads the TAFs alone."""
    out = []
    for valid, ceiling_grid, visibility_grid in _forecast_grids():
        if not start <= valid <= end:
            continue
        ceiling_m, visibility_m = ceiling_grid.at(lat, lon), visibility_grid.at(lat, lon)
        if ceiling_m is None or visibility_m is None:
            continue
        out.append(
            {
                "valid": valid,
                "ceiling_ft": None if ceiling_m <= _NO_CEILING_M else round(ceiling_m * M_TO_FT, -1),
                "visibility_sm": round(visibility_m / M_PER_SM, 2),
            }
        )
    return out
