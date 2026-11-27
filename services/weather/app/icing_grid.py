"""The grid the forecast icing is stored on (app.icing), read from the
NWS's icing GRIB2: the Current Icing Product's analysis (CIP2, app.icing_cip)
and the In-Flight Icing forecast (IFI, app.icing), both on the HRRR's 3 km
grid over the lower 48, every 500 ft MSL from 500 to 30,000 ft.

The severity both give (GRIB2 discipline 0, category 19, parameter 37,
ICESEV) is a category of GRIB2 code table 4.228: "five categories: none,
trace, light, moderate, and severe" (NWS Service Change Notice 26-87, the
CIP2's, 2026-09-22; the IFI's v2.0 the same parameter, SCN 25-80), 0 to 4,
the scale the engine's icing_forecast reads (its "heavy" is the NWS's
"severe").

The levels kept are the planner's (wingtip.icing_forecast.LEVELS_FT, the
AWC's cross-section's) the products have: every 1,000 ft to 25,000 and
every 2,000 to 30,000. Each goes on a grid of STEP_DEG cells, each cell
the worst of the 3 km points in it, toward the safer answer: icing
anywhere in a 14 km cell is read, not averaged away. A cell no point falls
in, or one whose points have no value (the CIP's bitmap leaves the levels
under the ground out), is NONE, no forecast, which the engine reads as
unchecked, never as no icing.
"""

from __future__ import annotations

import struct

import gribberish
import numpy as np
from wingtip.grid_index import grid_cells
from wingtip.icing_forecast import LEVELS_FT
from wingtip.units import M_PER_FT

from . import flow_grid

#: The products' highest level, ft MSL.
TOP_FT = 30_000
#: The stored grid: STEP_DEG cells, their centres from SOUTH and WEST to
#: NORTH and EAST, round the products' domain (measured 2026-11-27: 21.14
#: to 52.62 N, 134.10 to 60.92 W).
STEP_DEG = 0.125
SOUTH, NORTH, WEST, EAST = 21.0, 53.0, -134.25, -60.75
ROWS = int(round((NORTH - SOUTH) / STEP_DEG)) + 1
COLS = int(round((EAST - WEST) / STEP_DEG)) + 1
#: A cell with no forecast in it.
NONE = -1
#: ICESEV: discipline 0, category 19, parameter 37 (SCN 26-87).
SEVERITY = (0, 19, 37)


def levels_kept() -> list[float]:
    """The planner's levels the products have."""
    return [ft for ft in LEVELS_FT if ft <= TOP_FT]


def grid_record() -> dict:
    """Where the stored grid is, for the planner."""
    return {"south": SOUTH, "west": WEST, "step_deg": STEP_DEG, "rows": ROWS, "cols": COLS}


def cells(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Each point's cell, row * COLS + col with row 0 the south; -1 outside
    (wingtip.grid_index, as the planner reads the stored grid)."""
    return grid_cells(lats, lons, grid_record())


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


#: The reducer of each grid met, by its shape: both products are on the
#: HRRR's, so a fetch's files work the cells out once.
_REDUCERS: dict = {}


def _reducer_for(meta):
    key = tuple(meta.grid_shape)
    if key not in _REDUCERS:
        lats, lons = flow_grid._points(meta)
        _REDUCERS[key] = _reducer(cells(lats, lons))
    return _REDUCERS[key]


def message_length(body: bytes, at: int) -> int | None:
    """A GRIB2 message's whole length from its section 0 (octets 9 to 16,
    WMO No. 306 FM 92 GRIB edition 2), where one starts at `at` and ends
    in "7777" inside `body`; None otherwise."""
    if body[at : at + 4] != b"GRIB" or at + 16 > len(body) or body[at + 7] != 2:
        return None
    (length,) = struct.unpack(">Q", body[at + 8 : at + 16])
    end = at + length
    return length if length > 16 and end <= len(body) and body[end - 4 : end] == b"7777" else None


def parameter(body: bytes, at: int) -> tuple[int, int, int] | None:
    """A message's (discipline, category, parameter): section 0's octet 7
    and section 4's octets 10 and 11."""
    length = message_length(body, at)
    if length is None:
        return None
    p = at + 16
    while p + 5 <= at + length - 4:
        (size,) = struct.unpack(">I", body[p : p + 4])
        if size < 5:
            return None
        if body[p + 4] == 4:
            return body[at + 6], body[p + 9], body[p + 10]
        p += size
    return None


def read_levels(body: bytes, levels_ft: list[float]) -> np.ndarray:
    """The severity records in a run of GRIB2 messages as levels x rows x
    cols int8, each level of `levels_ft` from the record at its height
    (the files' metres, to within about one), NONE everywhere for a level
    the run lacks; any other record (probability, SLD) passed over."""
    out = np.full((len(levels_ft), ROWS, COLS), NONE, dtype=np.int8)
    offset = 0
    while (length := message_length(body, offset)) is not None:
        at, offset = offset, offset + length
        if parameter(body, at) != SEVERITY:
            continue
        message = gribberish.parse_grib_message(body, at)
        height_ft = float(message.metadata.level_value) / M_PER_FT
        found = [i for i, ft in enumerate(levels_ft) if abs(ft - height_ft) < 4.0]
        if found:
            worst = _reducer_for(message.metadata)
            out[found[0]] = worst(np.asarray(message.data(), dtype=np.float32).ravel())
    return out


def complete(grid: np.ndarray) -> bool:
    """Whether every level kept was read: a level no record gave is NONE
    over the whole grid."""
    return bool((grid != NONE).any(axis=(1, 2)).all())
