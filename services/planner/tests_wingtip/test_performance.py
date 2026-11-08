"""The service ceiling on the day, which the altitude selection still asks
wingtip.performance for (TODO(phase3)). The airplane's cruise and climbs
moved into the engine with the nav log, and their tests with them
(engine/crates/flight/src/performance.rs)."""
import pytest

from wingtip import performance


def _isa_plus(dev_c):
    return lambda altitude_ft: performance.isa_temp_c(altitude_ft) + dev_c


def test_the_service_ceiling_comes_down_on_a_warm_day_and_up_on_a_cold_one():
    assert performance.altitude_at_density_altitude(13500.0, _isa_plus(0)) == pytest.approx(13500.0, abs=1)
    warm = performance.altitude_at_density_altitude(13500.0, _isa_plus(15))
    cold = performance.altitude_at_density_altitude(13500.0, _isa_plus(-10))
    assert 11500 < warm < 12000 and 14500 < cold < 15000
