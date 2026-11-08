"""The service ceiling on the day as the altitude selection asks it: the
engine's `service_ceiling_on_the_day` (wingtip_weather::winds), in the
forecast temperatures. Its own tests, and the airplane's cruise and
climbs', are the engine's (winds.rs, engine/crates/flight/src/performance.rs)."""
from wingtip import performance
from wingtip.engine import ask as engine


def _isa_plus(dev_c):
    return [[ft, performance.isa_temp_c(ft) + dev_c] for ft in (0.0, 6000.0, 12000.0, 18000.0, 24000.0)]


def test_the_service_ceiling_comes_down_on_a_warm_day_and_up_on_a_cold_one():
    assert engine("service_ceiling_on_the_day", service_ceiling_ft=13500.0, profile=_isa_plus(0)) == 13500.0
    warm = engine("service_ceiling_on_the_day", service_ceiling_ft=13500.0, profile=_isa_plus(15))
    cold = engine("service_ceiling_on_the_day", service_ceiling_ft=13500.0, profile=_isa_plus(-10))
    assert 11500 < warm < 12000 and 14500 < cold < 15000


def test_no_temperatures_is_the_book_figure():
    assert engine("service_ceiling_on_the_day", service_ceiling_ft=13500.0, profile=[]) == 13500.0
