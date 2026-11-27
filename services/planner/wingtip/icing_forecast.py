"""Forecast icing along an IFR route (#216, item 6): each leg's vertical
cross-section of the icing severity, for the hour the airplane is on that
leg, handed to the engine, whose rule says what it means for the flight
(wingtip_brief::icing_forecast, `icing_forecast_route`).

The icing is the NWS's, which the weather service fetches each hour from
NOMADS and stores on a grid (services/weather/app/icing.py, the store's
"icing-forecast"): the hour's analysis, the Current Icing Product (CIP2),
and the hours after it, the In-Flight Icing forecast (IFI, the FAA and
NCAR's Forecast Icing Product run operationally; AIM 7-1-4). Both give the
severity as GRIB2 code table 4.228's "five categories: none, trace,
light, moderate, and severe", 0 to 4 (NWS Service Change Notice 26-87),
the engine's scale. A leg's section is read off that grid here, COLUMNS
points along the leg by LEVELS_FT up, the shape the AWC's own
cross-sections had when the planner asked aviationweather.gov for one per
leg inside the pilot's request (until 2026-11-27): the engine's call and
its input are unchanged.

Never less than the worst the store knows (the review of 2026-11-27, which
found the IFI alone a category or two under the AWC's sections on some
legs; the owner: "Grids, worst of nearby hours"): which stored hours a leg
is read off -- the nearest its middle, the CIP's for a leg flown in its
hour, and every other within an hour -- and how they merge, each point and
level the worst of them, the share the nearest hour's own, are the
engine's (icing_forecast_hours, icing_forecast_route); here each picked
hour is read off its grid along the leg and handed on.

A level the store has no forecast at -- above the products' 30,000 ft, a
place off their grid, the CIP's levels under the ground -- is -1, which
the engine reads as unchecked, never as no icing; so is a leg flown past
the stored forecast's last hour. The ground under each column (the
section's sfc_hgt) is the terrain tiles' (wingtip.terrain_detour), since
the IFI writes no icing, 0, under the ground, and the engine reads no
level under it.
"""

from __future__ import annotations

import threading
import time

import numpy as np
from cachetools import LRUCache

from . import geo, utc, weather_store
from .engine import ask as engine
from .grid_index import grid_index
from .units import M_PER_FT

#: The section's levels, ft MSL, as the AWC's page plots them (its cross
#: section's `alts`): every 1,000 ft to 25,000 over 500 ft, then every
#: 2,000 to 50,000.
LEVELS_FT = [500, *range(1000, 25001, 1000), *range(26000, 50001, 2000)]

#: The weather store's record (services/weather/app/icing.py).
STORE_NAME = "icing-forecast"

#: Points read along a leg, as many as the AWC's sections had columns.
COLUMNS = 300

#: The store's mark for no forecast; the engine's "negative, none".
NONE = -1


class IcingForecastUnavailable(RuntimeError):
    """The weather store holds no forecast icing that may be served."""


def _ground_m(lats: np.ndarray, lons: np.ndarray) -> list[float] | None:
    """The ground under each column, metres; None where the terrain tiles
    could not be had, when the engine reads every level."""
    from .terrain_detour import heights_ft  # its route search's imports, only when a section is read

    try:
        return [round(float(ft) * M_PER_FT, 1) for ft in heights_ft(lats, lons)]
    except (OSError, ValueError, RuntimeError):  # requests' errors are OSErrors
        return None


def _values(grid: np.ndarray, at: dict, stored_levels: list[float], lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """A stored hour's severity under the points, COLUMNS x LEVELS_FT,
    NONE where the store has none: one fancy-indexed read of the levels
    stored, where a loop over the 39 levels took about 4 ms an hour read."""
    rows, cols, inside = grid_index(lats, lons, at)
    out = np.full((len(lats), len(LEVELS_FT)), NONE, dtype=np.int64)
    pairs = [(level, stored_levels.index(ft)) for level, ft in enumerate(LEVELS_FT) if ft in stored_levels]
    if pairs and inside.any():
        levels, stored = (np.array(side) for side in zip(*pairs))
        points = np.flatnonzero(inside)
        out[points[:, None], levels[None, :]] = grid[stored[None, :], rows[points][:, None], cols[points][:, None]]
    return out


def _section(values: np.ndarray, ground: list[float] | None) -> dict:
    found = {"width": len(values), "data_levels": len(LEVELS_FT), "values": values.ravel().tolist()}
    return {**found, "sfc_hgt": ground} if ground is not None else found


def section(grid: np.ndarray, at: dict, stored_levels: list[float], a: tuple, b: tuple) -> dict:
    """One leg's section from (lat, lon) a to b off a stored hour's grid
    (levels x rows x cols, `at` its corner and step): COLUMNS columns by
    LEVELS_FT, values level-fastest, NONE where the store has none."""
    lats, lons = geo.great_circle_points(a, b, COLUMNS)
    return _section(_values(grid, at, stored_levels, lats, lons), _ground_m(lats, lons))


#: Each leg's points and the ground under them, by its ends: the same for
#: every hour of a departure window, which read them again for each
#: (round 6's audit, N7). A ground the terrain tiles could not give is not
#: kept, so the next read asks again.
_LEGS: LRUCache = LRUCache(maxsize=256)
_LEGS_LOCK = threading.Lock()


def _leg_points(a: tuple, b: tuple) -> tuple[np.ndarray, np.ndarray, list[float] | None]:
    """(lats, lons, ground) of a leg's COLUMNS points, worked out once a leg."""
    key = (tuple(a), tuple(b))
    with _LEGS_LOCK:
        held = _LEGS.get(key)
    if held is not None:
        return held
    lats, lons = geo.great_circle_points(a, b, COLUMNS)
    lats.setflags(write=False)
    lons.setflags(write=False)
    found = (lats, lons, _ground_m(lats, lons))
    if found[2] is not None:
        with _LEGS_LOCK:
            _LEGS[key] = found
    return found


class _Grids:
    """The stored hours' grids, each mapped once a copy of the store: kept
    while the store's record is the same object (weather_store.read decodes
    it once a file), so a departure window's hours and the next Go / No-Go
    map the hour arrays once, where each read opened them again (N7)."""

    _held: dict = {"data": None, "grids": None}
    _lock = threading.Lock()

    @classmethod
    def of(cls, data: dict) -> _Grids:
        with cls._lock:
            if cls._held["data"] is not data:
                cls._held.update(data=data, grids=cls(data))
            return cls._held["grids"]

    def __init__(self, data: dict):
        self.data, self.held = data, {}

    def values(self, hour: dict, lats: np.ndarray, lons: np.ndarray) -> np.ndarray | None:
        name = hour["array"]
        try:
            if name not in self.held:
                self.held[name] = weather_store.read_array(name)
        except (OSError, ValueError):  # the hour's grid gone under a newer copy
            return None
        return _values(self.held[name], self.data["grid"], self.data["levels_ft"], lats, lons)


def _leg(grids: _Grids, a: tuple, b: tuple, picked: list[int]) -> list[dict | None]:
    """A leg's sections off the stored hours the engine picked for it
    (icing_forecast_hours), the nearest first, the ground under it on that
    one; None for an hour whose grid could not be read, and the others not
    read where the nearest's could not be, the leg then unchecked."""
    if not picked:
        return []
    hours = grids.data["hours"]
    lats, lons, ground = _leg_points(a, b)
    own = grids.values(hours[int(picked[0])], lats, lons)
    if own is None:
        return [None]
    others = [grids.values(hours[int(i)], lats, lons) for i in picked[1:]]
    return [_section(own, ground), *(None if v is None else _section(v, None) for v in others)]


def along(
    fixes: list[tuple[float, float]],
    altitudes_ft: list[float],
    leg_minutes: list[float],
    ground_minutes: list[float] | None,
    start: float,
    now: float | None = None,
) -> dict:
    """The engine's reading of the icing on each leg, from the nav log's
    fixes (one more than its legs), each leg's altitude, its ETE and its
    minutes on the ground after it, the flight leaving at `start` (UNIX
    seconds): each leg read for the hour of its middle, never less than
    the worst stored near it. IcingForecastUnavailable where the store
    holds nothing to serve."""
    legs = len(altitudes_ft)
    if len(fixes) != legs + 1 or len(leg_minutes) != legs:
        raise ValueError("one more fix than legs, and a time for each leg")
    ground = ground_minutes if ground_minutes and len(ground_minutes) == legs else [0.0] * legs
    now = time.time() if now is None else now
    record = weather_store.read(STORE_NAME)
    if not weather_store.servable(record, now):
        raise IcingForecastUnavailable("the weather service holds no forecast icing")
    data = record.data
    middles, t = [], start
    for minutes, after in zip(leg_minutes, ground):
        middles.append(t + minutes * 30)
        t += (minutes + after) * 60
    picked = engine(
        "icing_forecast_hours",
        hours=[{"valid_s": utc.epoch(h["valid"]), "source": h.get("source")} for h in data["hours"]],
        middles_s=middles,
    )["legs"]
    grids = _Grids.of(data)
    answer = engine(
        "icing_forecast_route",
        levels_ft=LEVELS_FT,
        legs=[
            {"altitude_ft": alt, "hours": _leg(grids, fixes[i], fixes[i + 1], picked[i]), "valid_s": middles[i]}
            for i, alt in enumerate(altitudes_ft)
        ],
    )
    return {**answer, "issued": data.get("cycle") or data.get("analysis")}
