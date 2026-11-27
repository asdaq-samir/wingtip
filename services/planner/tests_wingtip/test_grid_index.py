"""wingtip.grid_index: a point's row and column on a regular grid, row 0
the south or the north, and a point off it marked."""

import numpy as np

from wingtip.grid_index import grid_cells, grid_index


def test_rows_count_from_the_south_or_the_north_and_a_point_off_the_grid_is_minus_one():
    lats, lons = np.array([21.0, 21.2, 53.0, 60.0]), np.array([-134.25, -134.0, -60.75, -100.0])
    south = {"south": 21.0, "west": -134.25, "step_deg": 0.125, "rows": 257, "cols": 589}
    rows, cols, inside = grid_index(lats, lons, south)
    assert rows[:3].tolist() == [0, 2, 256] and cols[:3].tolist() == [0, 2, 588] and inside.tolist() == [True, True, True, False]
    assert grid_cells(lats, lons, south).tolist() == [0, 2 * 589 + 2, 256 * 589 + 588, -1]
    north = {"north": 53.0, "west": -134.25, "step_deg": 0.125, "rows": 257, "cols": 589}
    assert grid_index(lats, lons, north)[0][:3].tolist() == [256, 254, 0]
