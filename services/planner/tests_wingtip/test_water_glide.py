"""The glide to shore the route options judge water by (wingtip.water):
the engine's still-air glide at the airplane's own glide ratio, and none
for an airplane whose profile gives no glide."""

import numpy as np
import pytest
from wingtip import water


def test_out_of_glide_is_the_water_beyond_a_glide_of_land():
    # A strip of water 0.5 degrees wide (30 nm) between land: its middle,
    # 15 nm from either shore, out of a 6 nm glide from 4,000 ft; its edges
    # in reach.
    flat = water.is_water
    try:
        water.is_water = lambda lats, lons: (np.asarray(lons) > 1.0) & (np.asarray(lons) < 1.5)
        share = water.cell_shares(
            water.out_of_glide_samples(0.0, 0.0, 4, 10, 0.25, height_ft=4000.0, speed_kt=110.0, glide_ratio=9.0), 4, 10
        )
        # Too slow to be flying (under the engine's 40 kt): no glide, all of it out of reach.
        stopped = water.cell_shares(
            water.out_of_glide_samples(0.0, 0.0, 4, 10, 0.25, height_ft=4000.0, speed_kt=0.0, glide_ratio=9.0), 4, 10
        )
    finally:
        water.is_water = flat
    assert share[:, 0].max() == 0.0  # dry land
    assert share[:, 4].min() > 0.5 and share[:, 5].min() > 0.5  # the strait's middle
    assert share.max() <= 1.0
    assert stopped[:, 4].min() == 1.0 and stopped[:, 0].max() == 0.0


def test_the_glide_to_shore_is_the_engines_by_height():
    # The C172S POH's maximum glide, 9 to 1 (figure 3-1, the c172 profile's
    # glide.ratio): 9,000 ft forward for every 1,000 down, 5.9 nm from
    # 4,000 ft over the water, 3.7 nm from the 2,500 ft the grid's lowest
    # cruise is, none under the engine's 500 ft -- and none at all for an
    # airplane whose profile gives no glide, which is not assumed.
    ft_per_nm = 1852.0 / 0.3048
    assert water.glide_nm(4000.0, 110.0, 9.0) == pytest.approx(4 * 9000.0 / ft_per_nm)
    assert water.glide_nm(2500.0, 110.0, 9.0) == pytest.approx(2.5 * 9000.0 / ft_per_nm)
    assert water.glide_nm(400.0, 110.0, 9.0) == 0.0
    assert water.glide_nm(4000.0, 110.0, None) == 0.0
