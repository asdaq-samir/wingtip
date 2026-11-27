"""Points on a regular latitude-longitude grid, each one's row and column:
the one indexing the weather service's stored grids (app.icing_grid,
app.flow_grid, app.flow_awc) and the planner's reads of them
(wingtip.icing_forecast) share, where each wrote its own."""

from __future__ import annotations

import numpy as np


def grid_index(lats: np.ndarray, lons: np.ndarray, at: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Each point's (row, column) on the grid `at` -- "west", "step_deg",
    "rows", "cols", and "south" where row 0 is the south or "north" where
    it is the north -- the nearest cell's, and which points fall on it."""
    step = at["step_deg"]
    from_edge = (np.asarray(lats) - at["south"]) if "south" in at else (at["north"] - np.asarray(lats))
    rows = np.rint(from_edge / step).astype(np.int64)
    cols = np.rint((np.asarray(lons) - at["west"]) / step).astype(np.int64)
    inside = (rows >= 0) & (rows < at["rows"]) & (cols >= 0) & (cols < at["cols"])
    return rows, cols, inside


def grid_cells(lats: np.ndarray, lons: np.ndarray, at: dict) -> np.ndarray:
    """Each point's cell, row * cols + col; -1 for one off the grid."""
    rows, cols, inside = grid_index(lats, lons, at)
    return np.where(inside, rows * at["cols"] + cols, -1)
