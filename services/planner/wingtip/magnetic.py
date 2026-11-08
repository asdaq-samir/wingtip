"""Magnetic variation (declination), for converting true course/heading to
magnetic in the dead-reckoning nav-log math (wingtip.navlog).

Computed here from the World Magnetic Model itself (WMM-2025, worked out
by the engine, wingtip_engine::wmm -- the phones' same code -- and held
to pygeomag's answer in services/planner/tests_wingtip/test_flight_rules.py), not asked of NOAA's
web calculator and cached to a CSV. It is the same model that
calculator runs, so the answer is the same one -- checked against every
value this project had cached from NOAA, and the two agree to within
0.002 degrees, which is four decimal places past anything a compass
shows. What goes with the calculator is the network call, the retry
loop, the disk cache and the rounding that keyed it: a declination now
costs a polynomial evaluation rather than a round trip, and a route
planned with no connection at all still has one.

Sign convention (the model's own, and NOAA's): positive = easterly
variation, negative = westerly. To go from true to magnetic:
magnetic = true - declination (this falls out of "east is least, west is
best" automatically once the sign is applied consistently -- see
wingtip.navlog.magnetic_heading_deg).
"""
from datetime import date

from .engine import ask as engine


def magnetic_variation_deg(lat: float, lon: float, on: date | None = None) -> float:
    """Magnetic declination at (lat, lon), positive east / negative west,
    for `on` (today by default).

    Each edition of the World Magnetic Model is valid for five years. A date outside the
    window is clamped to its nearest edge rather than allowed to fail the
    whole nav log: declination drifts by a fraction of a degree a year,
    so the edge of a lapsed model is far closer to the truth than no
    heading at all. The next edition is a new coefficient table in the engine.
    """
    # The engine's own WMM-2025 (wingtip_engine::wmm), the phones' same,
    # held at the edge of the model's life as above; pygeomag stays as
    # the test's oracle (services/planner/tests_wingtip/test_flight_rules.py); the
    # model's decimal year is worked out from the day by the engine.
    return engine("magnetic_variation", lat=lat, lon=lon, date=(on or date.today()).isoformat())
