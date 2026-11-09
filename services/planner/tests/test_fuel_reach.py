"""The figures a fuel stop is picked on: each stop's flight as its nav log
flies it -- the engine's navlog_fuel_stop_need, which
wingtip.flight_plan.fuel_stops_of asks (it was app.routers.plan's
worst_burn_per_nm and night_on_the_way until 2026-11-09)."""
from datetime import datetime, timezone

from wingtip.engine import ask as engine

#: El Paso to Hartford, 1,670 nm on 40 gallons usable: short.
START, END = {"lat": 31.8, "lon": -106.4}, {"lat": 41.9, "lon": -72.7}
SHORT = {"fuel_margin_gal": -80.0, "usable_fuel_gal": 40.0, "distance_nm": 1670.0, "fuel_gal": 120.0, "ete_min": 600.0,
         "taxi_gal": 1.4, "reserve_gal": 4.5, "rules": "vfr", "night": False}


def _need(legs, leave, **totals):
    return engine("navlog_fuel_stop_need", totals={**SHORT, **totals}, legs=legs, start=START, end=END,
                  depart_s=leave.timestamp())


def test_the_worst_stretch_not_the_average():
    # The first half at 0.07 gal/nm, the second into a headwind at 0.08:
    # a tankful's stretch is under half the way, so the 0.08 is planned on.
    legs = [{"distance_nm": 278.0, "fuel_gal": 0.07 * 278}] * 3 + [{"distance_nm": 278.0, "fuel_gal": 0.08 * 278}] * 3
    morning = datetime(2026, 6, 21, 12, 0, tzinfo=timezone.utc)
    need = _need(legs, morning, fuel_gal=sum(leg["fuel_gal"] for leg in legs), distance_nm=1668.0)
    straight = engine("distance_nm", lat1=31.8, lon1=-106.4, lat2=41.9, lon2=-72.7)
    assert abs(need["fuel_per_nm"] - 0.08 * max(1.0, 1668.0 / straight)) < 1e-9
    # A leg whose fuel is not known: the average.
    need = _need([{"distance_nm": 1670.0, "fuel_gal": None}], morning)
    assert abs(need["fuel_per_nm"] - 120.0 / 1670.0 * max(1.0, 1670.0 / straight)) < 1e-9


def test_a_trip_running_into_the_night_keeps_the_nights_reserve():
    # Leaving at 15:00Z in October: day at the start, past dusk in the east
    # ten hours on -- 14 CFR 91.151(a)(2)'s 45 minutes for (a)(1)'s 30.
    leave = datetime(2026, 10, 23, 15, 0, tzinfo=timezone.utc)
    assert _need([], leave)["reserve_gal"] == 4.5 * 45 / 30
    # Two hours of it end in daylight: the day's reserve.
    assert _need([], leave, ete_min=60.0, fuel_gal=30.0, distance_nm=150.0, fuel_margin_gal=-1.0)["reserve_gal"] == 4.5


def test_none_where_the_fuel_check_passes_or_is_not_known():
    leave = datetime(2026, 10, 23, 15, 0, tzinfo=timezone.utc)
    assert _need([], leave, fuel_margin_gal=2.0) is None
    assert _need([], leave, fuel_gal=None) is None
    assert _need([], leave, usable_fuel_gal=None) is None
