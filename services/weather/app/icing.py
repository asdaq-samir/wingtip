"""The forecast icing the planner reads along an IFR route
(wingtip.icing_forecast): the icing severity of the NWS's In-Flight Icing
product (IFI, the FAA and NCAR's Forecast Icing Product run operationally;
the GFA's Icing map's grid, AIM 7-1-4) from the Diagnostic Aviation
Forecast System on NOMADS, stored on a grid the planner samples each leg
from, so no pilot's Brief waits on aviationweather.gov's cross-sections
(it asked one per leg, up to thirty, each up to 20 s, until 2026-11-27).

Each forecast hour's file (dafs.tHHz.ifi.3km.conus.fFFF.grib2, about 34 MB)
holds the severity (GRIB2 discipline 0, category 19, parameter 37), a
category 0 none to 4 heavy, the engine's icing_forecast scale, every
500 ft MSL from 500 to 30,000 ft on the HRRR's 3 km grid over the lower
48 (measured 2026-11-27: 60 records, one after another at the end of the
file, 5.7 MB together on a day of icing, beside the probability and the
SLD potential, not read). The .idx gives their byte offsets, so one Range
request a file takes the severity alone.

The levels kept are the planner's (icing_forecast.LEVELS_FT, the AWC's
cross-section's) the IFI has, every 1,000 ft to 25,000 and every 2,000 to
30,000; it has none above. Each is put on a grid of STEP_DEG cells, each
cell the worst of the 3 km points in it, toward the safer answer: icing
anywhere in a 14 km cell is read, not averaged away (the AWC's own FIP
was on a 13 km grid). A cell no point falls in is -1, no forecast, which
the engine reads as unchecked, never as no icing. The IFI writes 0 under
the ground, so the planner hands the engine the ground under each column
(the section's sfc_hgt) and the engine reads no level under it.

A cycle comes every hour; one is stored once its LAST_STEP is posted
(about an hour and a quarter after its hour), its hours 0 to LAST_STEP
as an int8 array each (levels x rows x cols, about 4.4 MB), and a newer
cycle is fetched only when it is whole: 16 files, about 90 MB, an hour
while a pilot is planning and every three otherwise (app.settings).
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import gribberish
import numpy as np
from wingtip import utc, weather_store
from wingtip.icing_forecast import LEVELS_FT, STORE_NAME
from wingtip.units import M_PER_FT

from . import flow_dafs, flow_grid

#: The cycle's last forecast hour stored: 15, so that a cycle up to three
#: hours old still reaches twelve hours past now, as far as the AWC's
#: sections did (icing_forecast's measure, 2026-11-08). The IFI goes to 18.
LAST_STEP = 15
#: Cycles looked back over for the newest whole one.
CYCLES_TRIED = 4
#: The IFI's highest level, ft MSL.
TOP_FT = 30_000
#: The stored grid: STEP_DEG cells, their centres from SOUTH and WEST to
#: NORTH and EAST, round the IFI's domain (measured 2026-11-27: 21.14 to
#: 52.62 N, 134.10 to 60.92 W).
STEP_DEG = 0.125
SOUTH, NORTH, WEST, EAST = 21.0, 53.0, -134.25, -60.75
ROWS = int(round((NORTH - SOUTH) / STEP_DEG)) + 1
COLS = int(round((EAST - WEST) / STEP_DEG)) + 1
#: A cell with no forecast in it.
NONE = -1
ARRAY_PREFIX = "icingf-"


class IcingUnavailable(RuntimeError):
    """NOMADS gave no whole IFI cycle, or one that could not be read."""


def levels_kept() -> list[float]:
    """The planner's levels the IFI has."""
    return [ft for ft in LEVELS_FT if ft <= TOP_FT]


def cells(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Each point's cell, row * COLS + col with row 0 the south; -1 outside."""
    rows = np.rint((lats - SOUTH) / STEP_DEG).astype(np.int64)
    cols = np.rint((lons - WEST) / STEP_DEG).astype(np.int64)
    inside = (rows >= 0) & (rows < ROWS) & (cols >= 0) & (cols < COLS)
    return np.where(inside, rows * COLS + cols, -1)


def _reducer(where: np.ndarray):
    """How a field's points become the grid's cells, worked out once a
    grid: the points in cell order, where each cell's run starts, and
    which cells have any. A field then takes the worst of each run."""
    keep = np.flatnonzero(where >= 0)
    order = keep[np.argsort(where[keep], kind="stable")]
    ordered = where[order]
    starts = np.flatnonzero(np.r_[True, ordered[1:] != ordered[:-1]])
    filled = ordered[starts]

    def worst(field: np.ndarray) -> np.ndarray:
        out = np.full(ROWS * COLS, NONE, dtype=np.int8)
        values = np.nan_to_num(field[order], nan=NONE)
        out[filled] = np.clip(np.rint(np.maximum.reduceat(values, starts)), NONE, 4).astype(np.int8)
        return out.reshape(ROWS, COLS)

    return worst


#: The reducer of each grid met, by its shape: the IFI's is always the
#: HRRR's, so a cycle's sixteen files work out the cells once.
_REDUCERS: dict = {}


def _reducer_for(meta):
    key = tuple(meta.grid_shape)
    if key not in _REDUCERS:
        lats, lons = flow_grid._points(meta)
        _REDUCERS[key] = _reducer(cells(lats, lons))
    return _REDUCERS[key]


def read_levels(body: bytes, levels_ft: list[float]) -> np.ndarray:
    """The severity block of one file as levels x rows x cols int8, each
    level of `levels_ft` from the record at its height (the files' metres,
    to within about one), NONE everywhere for a level the block lacks."""
    out = np.full((len(levels_ft), ROWS, COLS), NONE, dtype=np.int8)
    worst, offset = None, 0
    while offset + 16 <= len(body) and body[offset : offset + 4] == b"GRIB":
        message = gribberish.parse_grib_message(body, offset)
        meta = message.metadata
        offset += meta.message_size
        height_ft = float(meta.level_value) / M_PER_FT
        at = [i for i, ft in enumerate(levels_ft) if abs(ft - height_ft) < 4.0]
        if not at:
            continue
        if worst is None:
            worst = _reducer_for(meta)
        out[at[0]] = worst(np.asarray(message.data(), dtype=np.float32).ravel())
    return out


def _span(records, levels_ft: list[float]) -> tuple[int, int | None] | None:
    """The bytes from the lowest level kept to the highest, one request."""
    low = flow_dafs.find(records, flow_dafs.ICING_VAR, levels_ft[0])
    high = flow_dafs.find(records, flow_dafs.ICING_VAR, levels_ft[-1])
    return (low[0], high[1]) if low and high else None


def _newest_whole(now: datetime) -> datetime | None:
    """The newest cycle whose LAST_STEP is posted."""
    hour = now.replace(minute=0, second=0, microsecond=0)
    for back in range(CYCLES_TRIED + 1):
        cycle = hour - timedelta(hours=back)
        if flow_dafs._index("ifi", cycle, LAST_STEP):
            return cycle
    return None


def _fetch_cycle(cycle: datetime, levels: list[float]) -> list[dict]:
    """Each of a cycle's hours read and written as an array: [{"valid",
    "array"}]."""
    hours = []
    for step in range(LAST_STEP + 1):
        records = flow_dafs._index("ifi", cycle, step)
        span = _span(records, levels) if records else None
        if span is None:
            raise IcingUnavailable(f"the IFI's {cycle:%H}Z hour {step} has no severity")
        try:
            grid = read_levels(flow_dafs._range(flow_dafs._url("ifi", cycle, step), span), levels)
        except (ValueError, RuntimeError, AttributeError) as err:
            raise IcingUnavailable(f"the IFI's {cycle:%H}Z hour {step} could not be read: {err}") from err
        name = f"{ARRAY_PREFIX}{cycle:%Y%m%d%H}-{step:02d}"
        weather_store.write_array(name, grid)
        hours.append({"valid": utc.iso(cycle + timedelta(hours=step)), "array": name})
    return hours


def fetch_latest(now: datetime | None = None) -> bool:
    """The newest whole IFI cycle fetched and stored, where newer than the
    one stored; True if one was. Raises IcingUnavailable where NOMADS has
    none or does not answer, the stored cycle left in place."""
    now = now or datetime.now(timezone.utc)
    held = weather_store.read(STORE_NAME)
    try:
        cycle = _newest_whole(now)
        if cycle is None:
            if held is not None and weather_store.servable(held, now.timestamp()):
                return False
            raise IcingUnavailable(f"no whole IFI cycle on NOMADS in the last {CYCLES_TRIED} hours")
        stamp = utc.iso(cycle)
        if held is not None and held.meta.get("cycle") == stamp:
            return False
        levels = levels_kept()
        hours = _fetch_cycle(cycle, levels)
    except flow_dafs.DafsUnavailable as err:
        raise IcingUnavailable(str(err)) from err
    data = {
        "cycle": stamp,
        "levels_ft": levels,
        "grid": {"south": SOUTH, "west": WEST, "step_deg": STEP_DEG, "rows": ROWS, "cols": COLS},
        "hours": hours,
    }
    # Served to half an hour past its last hour, the hour a leg is read for.
    until = (cycle + timedelta(hours=LAST_STEP, minutes=30)).timestamp()
    weather_store.write(STORE_NAME, data, fetched_at=time.time(), until=until, meta={"cycle": stamp})
    # The cycle before stays for a planner that has it mapped; older go.
    keep = {h["array"] for h in hours} | {h["array"] for h in (held.data.get("hours", []) if held else [])}
    weather_store.remove_arrays(ARRAY_PREFIX, keep)
    return True
