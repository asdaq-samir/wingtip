"""Forecast icing along an IFR route (#216, item 6): each leg's vertical
cross-section of the forecast icing severity, for the hour the airplane is
on that leg, handed to the engine, whose rule says what it means for the
flight (wingtip_brief::icing_forecast, `icing_forecast_route`).

The icing is the NWS's In-Flight Icing product (IFI, the FAA and NCAR's
Forecast Icing Product run operationally, the grid the AWC's Graphical
Forecasts for Aviation draw their Icing from; AIM 7-1-4), which the
weather service fetches each hour from NOMADS and stores on a grid
(services/weather/app/icing.py, the store's "icing-forecast"). A leg's
section is read off that grid here, COLUMNS points along the leg by
LEVELS_FT up, the shape the AWC's own cross-sections had when the planner
asked aviationweather.gov for one per leg inside the pilot's request
(until 2026-11-27): the engine's call and its input are unchanged.

A level the store has no forecast at -- above the IFI's 30,000 ft, or a
place off its grid -- is -1, which the engine reads as unchecked, never
as no icing; so is a leg flown past the stored cycle's last hour. The
ground under each column (the section's sfc_hgt) is the terrain tiles'
(wingtip.terrain_detour), since the IFI writes no icing, 0, under the
ground, and the engine reads no level under it.
"""

from __future__ import annotations

import time

import numpy as np

from . import geo, utc, weather_store
from .engine import ask as engine
from .units import M_PER_FT

#: The section's levels, ft MSL, as the AWC's page plots them (its cross
#: section's `alts`): every 1,000 ft to 25,000 over 500 ft, then every
#: 2,000 to 50,000.
LEVELS_FT = [500, *range(1000, 25001, 1000), *range(26000, 50001, 2000)]

#: The weather store's record (services/weather/app/icing.py).
STORE_NAME = "icing-forecast"

#: Points read along a leg, as many as the AWC's sections had columns.
COLUMNS = 300

#: How far past the stored cycle's last hour a leg is still read from it:
#: the nearest hour, as each hour's forecast stands for the half hour
#: either side of it.
HALF_HOUR_S = 1800

#: The store's mark for no forecast; the engine's "negative, none".
NONE = -1


class IcingForecastUnavailable(RuntimeError):
    """The weather store holds no forecast icing that may be served."""


def _hour(hours: list[dict], valid_s: float) -> dict | None:
    """The stored hour nearest `valid_s`; the first for a time before it,
    None for one more than half an hour past the last."""
    times = [utc.epoch(h["valid"]) for h in hours]
    if not times or valid_s > times[-1] + HALF_HOUR_S:
        return None
    return hours[int(np.argmin([abs(t - valid_s) for t in times]))]


def _ground_m(lats: np.ndarray, lons: np.ndarray) -> list[float] | None:
    """The ground under each column, metres; None where the terrain tiles
    could not be had, when the engine reads every level."""
    from .terrain_detour import heights_ft  # its route search's imports, only when a section is read

    try:
        return [round(float(ft) * M_PER_FT, 1) for ft in heights_ft(lats, lons)]
    except (OSError, ValueError, RuntimeError):  # requests' errors are OSErrors
        return None


def section(grid: np.ndarray, at: dict, stored_levels: list[float], a: tuple, b: tuple) -> dict:
    """One leg's section from (lat, lon) a to b off a stored hour's grid
    (levels x rows x cols, `at` its corner and step): COLUMNS columns by
    LEVELS_FT, values level-fastest, NONE where the store has none."""
    lats, lons = geo.great_circle_points(a, b, COLUMNS)
    rows = np.rint((lats - at["south"]) / at["step_deg"]).astype(np.int64)
    cols = np.rint((lons - at["west"]) / at["step_deg"]).astype(np.int64)
    inside = (rows >= 0) & (rows < at["rows"]) & (cols >= 0) & (cols < at["cols"])
    out = np.full((COLUMNS, len(LEVELS_FT)), NONE, dtype=np.int64)
    for level, ft in enumerate(LEVELS_FT):
        if ft in stored_levels:
            stored = np.asarray(grid[stored_levels.index(ft)])
            out[inside, level] = stored[rows[inside], cols[inside]]
    found = {"width": COLUMNS, "data_levels": len(LEVELS_FT), "values": out.ravel().tolist()}
    ground = _ground_m(lats, lons)
    return {**found, "sfc_hgt": ground} if ground is not None else found


def along(
    fixes: list[tuple[float, float]],
    altitudes_ft: list[float],
    leg_minutes: list[float],
    ground_minutes: list[float] | None,
    start: float,
    now: float | None = None,
) -> dict:
    """The engine's reading of the forecast icing on each leg, from the
    nav log's fixes (one more than its legs), each leg's altitude, its
    ETE and its minutes on the ground after it, the flight leaving at
    `start` (UNIX seconds): each leg's section for the hour of its middle.
    IcingForecastUnavailable where the store holds no forecast to serve."""
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
    sections, grids = [], {}
    for i in range(legs):
        hour = _hour(data["hours"], middles[i])
        if hour is None:
            sections.append(None)
            continue
        try:
            if hour["array"] not in grids:
                grids[hour["array"]] = weather_store.read_array(hour["array"])
            grid = grids[hour["array"]]
        except (OSError, ValueError):  # the hour's grid gone under a newer cycle
            sections.append(None)
            continue
        sections.append(section(grid, data["grid"], data["levels_ft"], fixes[i], fixes[i + 1]))
    answer = engine(
        "icing_forecast_route",
        levels_ft=LEVELS_FT,
        legs=[{"altitude_ft": alt, "section": sections[i], "valid_s": middles[i]} for i, alt in enumerate(altitudes_ft)],
    )
    return {**answer, "issued": data["cycle"]}
