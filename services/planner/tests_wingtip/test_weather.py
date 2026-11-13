"""The weather the planner reads, from the copies the weather service keeps
in the weather store (wingtip.weather_store): the winds aloft as looked up
(wind_at_altitude, the freezing level), the products served while their
own validity lasts and named in a pilot's words where they cannot be, and
the rules read over them.

Fetching and parsing are the weather service's, tested there
(services/weather/tests), with the readers here over what it stores.
"""

import time
from datetime import datetime, timezone

import pytest

from wingtip import weather, weather_store, winds_stations
from wingtip.weather import WeatherServiceError, metar_for_idents

T0200Z = datetime(2026, 9, 20, 2, 0, tzinfo=timezone.utc).timestamp()


def _store(name: str, data, fetched_at: float = T0200Z, until: float | None = None) -> None:
    weather_store.write(name, data, fetched_at=fetched_at, until=until)


# --- read from the store, never fetched --------------------------------------


def test_a_product_never_stored_is_unavailable_in_a_pilots_words():
    with pytest.raises(WeatherServiceError, match="METARs unavailable"):
        metar_for_idents(["KORD"])
    with pytest.raises(WeatherServiceError, match="AIRMETs and SIGMETs unavailable"):
        weather._dataset("airsigmets")


def test_the_stored_copy_is_served_while_its_product_is_valid_and_not_after(monkeypatch):
    """A TAF set is kept to the end of its latest period (the service's
    `until`): past it the planner says the TAFs cannot be had rather than
    read an expired forecast as current."""
    _store("tafs", [{"icaoId": "KDLH", "fcsts": []}], until=T0200Z + 3600)
    monkeypatch.setattr(weather_store.time, "time", lambda: T0200Z + 3500)
    assert weather._dataset("tafs")[0]["icaoId"] == "KDLH"
    monkeypatch.setattr(weather_store.time, "time", lambda: T0200Z + 3700)
    with pytest.raises(WeatherServiceError, match="TAFs unavailable"):
        weather._dataset("tafs")


def test_metars_have_no_limit_and_keep_their_own_times(monkeypatch):
    """A METAR has no period of validity, only the time it was made, which
    each report carries (FAA-H-8083-28B 24.4.1): the last set heard is served, its age
    said."""
    _store("metars", {"KORD": {"flight_category": "IFR", "observed_at": "2026-09-20T01:51:00.000Z"}})
    monkeypatch.setattr(weather_store.time, "time", lambda: T0200Z + 6 * 3600)
    assert metar_for_idents(["KORD", "C81"]) == {"KORD": {"flight_category": "IFR", "observed_at": "2026-09-20T01:51:00.000Z"}, "C81": None}
    assert weather.dataset_status()["metars"] == T0200Z
    assert weather.reporting_idents() == {"KORD"}


def test_a_read_tells_the_service_a_pilot_is_planning(monkeypatch):
    assert weather_store.last_asked() == 0.0
    _store("metars", {})
    weather._dataset("metars")
    assert time.time() - weather_store.last_asked() < 5


def test_the_winds_are_the_stored_periods_with_their_levels_by_altitude():
    period = {
        "valid_at": "2026-09-20T05:00:00Z",
        "use_from": "2026-09-20T01:00:00Z",
        "use_to": "2026-09-20T08:00:00Z",
        "run": "2026-09-19T18:00:00Z",
        "forecast_hour": 11,
    }
    _store(
        "winds-06",
        {"stations": {"DLH": {"9000": {"wind_dir_true_deg": 270, "wind_speed_kt": 30, "temp_c": -8}}}, "period": period},
        until=time.time() + 3600,
    )
    stations = winds_stations.fd_stations("06")
    assert stations == {"DLH": {9000: {"wind_dir_true_deg": 270, "wind_speed_kt": 30, "temp_c": -8}}}
    assert stations.period == period and stations.modelled
    assert winds_stations.fd_stations("06") is stations  # made once per copy
    assert weather.winds_period("06") == {
        **period,
        "modelled": True,
        "source": "gfs-stations",
        "label": "NOAA GFS, 18Z +11 h",
        "fallback": False,
        "stale": False,
    }


def test_winds_past_their_window_or_never_stored_are_a_weather_service_error_in_a_pilots_words():
    _store("winds-12", {"stations": {}, "period": {}}, until=time.time() - 1)
    with pytest.raises(WeatherServiceError, match="Winds aloft"):
        winds_stations.fd_stations("12")
    with pytest.raises(WeatherServiceError, match="Winds aloft"):
        winds_stations.fd_stations("24")
    assert weather.winds_period("24") is None


def test_sources_status_names_each_source_and_says_which_is_served_on():
    # The pilot's Status page: each source in a pilot's words, its copy's
    # age, to when a held copy is used, and which source is failing.
    _store("tafs", [], fetched_at=100.0, until=900.0)
    weather_store.write_attempt("tafs", 200.0, "TAFs unavailable from aviationweather.gov just now")
    _store("metars", {}, fetched_at=150.0)
    weather_store.write_attempt("metars", 150.0, None)
    by_name = {s["name"]: s for s in weather.sources_status()}
    assert by_name["TAFs"] == {"name": "TAFs", "key": "tafs", "fetched_at": 100.0, "kept_until": 900.0, "failing": True}
    assert by_name["METARs"] == {"name": "METARs", "key": "metars", "fetched_at": 150.0, "kept_until": None, "failing": False}
    # The winds aloft, modelled, each period to the end of its own window.
    winds = by_name["Winds aloft, modelled (GFS), 6-hour"]
    assert winds["fetched_at"] is None and not winds["failing"]


def test_a_fields_last_wind_is_kept_three_hours(monkeypatch):
    """The newest report of a field's with a direction and some speed
    (the service's "recent-winds"), for the runway in use when it has since
    gone calm: kept for RECENT_WIND_HOURS, then nothing."""
    _store("recent-winds", {"KDLH": {"wind_dir_true_deg": 270, "wind_speed_kt": 8, "observed": T0200Z}})
    monkeypatch.setattr(weather.time, "time", lambda: T0200Z + 3600)
    assert weather.recent_wind("KDLH") == {"wind_dir_true_deg": 270.0, "wind_speed_kt": 8.0}
    assert weather.recent_wind("KORD") is None
    monkeypatch.setattr(weather.time, "time", lambda: T0200Z + 3 * 3600 + 60)
    assert weather.recent_wind("KDLH") is None


# --- the basic VFR minimums, and the briefing's "VFR not recommended" ---


def test_the_minimums_are_under_1000_ft_or_3_sm_and_unknown_is_not_below():
    assert weather.below_vfr_minimums(900, 10)
    assert weather.below_vfr_minimums(5000, 2.5)
    assert not weather.below_vfr_minimums(1000, 3)
    assert not weather.below_vfr_minimums(None, None)


def test_vfr_not_recommended_names_each_reason_in_briefing_order():
    metars = {"C81": {"flight_category": "VFR"}, "KDLH": {"flight_category": "LIFR"}}
    forecast = {"min_ceiling_ft": 800.0, "min_visibility_sm": 2.5}
    assert weather.vfr_not_recommended_reasons(["C81", "KDLH"], metars, forecast) == [
        "KDLH currently reporting LIFR",
        "forecast ceiling as low as 800 ft along the route",
        "forecast visibility as low as 2.5 sm along the route",
    ]


def test_vfr_not_recommended_is_empty_when_nothing_warrants_it():
    metars = {"C81": None, "KDLH": {"flight_category": "MVFR"}}
    forecast = {"min_ceiling_ft": 1200.0, "min_visibility_sm": None}
    assert weather.vfr_not_recommended_reasons(["C81", "KDLH"], metars, forecast) == []


# --- the temperatures aloft ---


def test_a_freezing_level_below_the_lowest_reading_says_so(monkeypatch):
    """Below 0 degC already at 6,000 ft, the winds-aloft product's lowest
    temperature: the freezing level is there or lower, not at 6,000."""
    from wingtip import airports

    monkeypatch.setattr(winds_stations, "fd_stations", lambda fcst_hr: {"DLH": {6000: {"temp_c": -2}, 9000: {"temp_c": -8}}})
    monkeypatch.setattr(winds_stations, "nearest_station", lambda lat, lon, ids, df: "DLH")
    monkeypatch.setattr(airports, "load_airports", lambda: None)

    assert weather.freezing_level(46.8, -92.2) == {"ft": 6000.0, "at_or_below": True}


def test_a_freezing_level_between_readings_is_interpolated(monkeypatch):
    from wingtip import airports

    monkeypatch.setattr(winds_stations, "fd_stations", lambda fcst_hr: {"DLH": {6000: {"temp_c": 4}, 9000: {"temp_c": -2}}})
    monkeypatch.setattr(winds_stations, "nearest_station", lambda lat, lon, ids, df: "DLH")
    monkeypatch.setattr(airports, "load_airports", lambda: None)

    assert weather.freezing_level(46.8, -92.2) == {"ft": 8000.0, "at_or_below": False}


def test_the_temperature_between_two_reports_is_interpolated_and_below_them_lapsed(monkeypatch):
    """6,000 ft is the lowest temperature the product gives; under it the
    standard lapse rate (about 2 degC per 1,000 ft) is all there is."""
    from wingtip import airports

    monkeypatch.setattr(
        winds_stations, "fd_stations", lambda fcst_hr: {"DLH": {3000: {"temp_c": None}, 6000: {"temp_c": 4}, 9000: {"temp_c": -2}}}
    )
    monkeypatch.setattr(winds_stations, "nearest_station", lambda lat, lon, ids, df: "DLH")
    monkeypatch.setattr(airports, "load_airports", lambda: None)
    assert weather.temperatures_aloft(46.8, -92.2) == [(6000.0, 4), (9000.0, -2)]
    assert weather.temperature_at_altitude(46.8, -92.2, 7500.0) == pytest.approx(1.0)
    assert weather.temperature_at_altitude(46.8, -92.2, 3000.0) == pytest.approx(4 + 3 * 1.9812)
    assert weather.temperature_at([], 5000.0) is None


def test_the_forecast_hour_for_a_departure_ends_where_the_periods_windows_do():
    # The GFS periods' windows (services/weather/app/gfs.py): 06 to six
    # hours ahead, 12 to fifteen, 24 beyond.
    assert [weather.forecast_hour(h) for h in (None, 6, 6.5, 15, 15.5)] == ["06", "06", "12", "12", "24"]


# --- PIREPs and G-AIRMETs, as the service stores them ---


def test_the_pilot_reports_near_the_route_are_a_light_aeroplanes_not_the_airliners(monkeypatch):
    now = time.time()
    reports = [
        {
            "observed_at": "",
            "observed": now,
            "lat": 42.5,
            "lon": -88.1,
            "altitude_ft": 5500.0,
            "aircraft": "C172",
            "urgent": False,
            "turbulence": "MOD",
            "icing": "NEG",
            "raw": "UA /OV ... /TB MOD",
        },
        {
            "observed_at": "",
            "observed": now,
            "lat": 42.6,
            "lon": -88.0,
            "altitude_ft": 36000.0,
            "aircraft": "B738",
            "urgent": False,
            "turbulence": None,
            "icing": None,
            "raw": "UA FL360",
        },
        {
            "observed_at": "",
            "observed": now,
            "lat": 42.5,
            "lon": -80.0,
            "altitude_ft": 4000.0,
            "aircraft": None,
            "urgent": True,
            "turbulence": None,
            "icing": None,
            "raw": "UUA far east",
        },
    ]
    monkeypatch.setattr(weather, "_dataset", lambda name: reports)
    near = weather.pireps_along_route([(42.0, -88.0), (43.0, -88.0)])
    assert [(r["aircraft"], r["turbulence"], r["icing"]) for r in near] == [("C172", "MOD", "NEG")]
    assert near[0]["along_track_nm"] == pytest.approx(30.0, abs=1.0)


def test_the_g_airmets_the_route_crosses_are_every_snapshot_with_its_time_and_area(monkeypatch):
    square = [[42, -89], [42, -87], [43, -87], [43, -89]]

    def icing(valid_at: str, valid: float, top: float) -> dict:
        return {
            "hazard": "Icing",
            "severity": "MOD",
            "due_to": "ICE",
            "valid_at": valid_at,
            "valid": valid,
            "issued": None,
            "altitude_low_ft": None,
            "from_freezing_level": True,
            "altitude_high_ft": top,
            "coords": square,
        }

    start = 1791126000.0  # 2026-10-04T15:00:00Z
    advisories = [icing("2026-10-04T15:00:00.000Z", start, 16000.0), icing("2026-10-04T18:00:00.000Z", start + 3 * 3600, 18000.0)]
    monkeypatch.setattr(weather, "_dataset", lambda name: advisories)
    # Every snapshot the route crosses, with its time and area, for the
    # briefing to pick the one for when the flight is in it (app.exposure).
    snapshots = weather.gairmet_snapshots_along_route([(41.5, -88.0), (43.5, -88.0)], (start, start + 2 * 3600))
    assert [s["valid_at"] for s in snapshots] == ["2026-10-04T15:00:00.000Z", "2026-10-04T18:00:00.000Z"]
    assert len(snapshots[0]["coords"]) == 4


# --- the nearest report ---


def test_a_field_with_no_report_is_given_the_nearest_and_told_whether_it_is_near(monkeypatch):
    # One station 6 nm north of the point, one 12 nm east -- past ten
    # statute miles (8.7 nm), within thirty -- and one with no place.
    now = datetime.fromtimestamp(time.time() - 600, timezone.utc).isoformat()
    reports = {
        "KNEAR": {"flight_category": "MVFR", "lat": 42.4, "lon": -88.0, "observed_at": now},
        "KFAR": {"flight_category": "VFR", "lat": 42.3, "lon": -88.0 + 12 / 60 / 0.7396, "observed_at": now},
        "KNONE": {"flight_category": "VFR", "lat": None, "lon": None, "observed_at": now},
        # The METAR table's empty cell, a NaN: argmin took it as the least
        # and C81's card answered 500 ("cannot convert float NaN to integer").
        "KNAN": {"flight_category": "VFR", "lat": float("nan"), "lon": float("nan"), "observed_at": now},
    }
    monkeypatch.setattr(weather, "_dataset", lambda name: reports)
    near = weather.nearest_report(42.3, -88.0)
    assert near["ident"] == "KNEAR" and near["distance_nm"] == 6.0 and near["bearing_deg"] == 0 and near["near"]
    assert near["metar"]["flight_category"] == "MVFR"
    # The nearest past ten statute miles: given, and not near.
    far = weather.nearest_report(42.3, -88.0, exclude="KNEAR")
    assert far["ident"] == "KFAR" and abs(far["distance_nm"] - 12) < 0.2 and far["bearing_deg"] == 90 and not far["near"]
    # None within thirty.
    assert weather.nearest_report(45.0, -100.0) is None


def test_the_nearest_report_is_a_current_one(monkeypatch):
    # An old station nearer than a current one must not hide it, and one
    # with no time is not known to be current.
    fresh = datetime.fromtimestamp(time.time() - 1800, timezone.utc).isoformat()
    old = datetime.fromtimestamp(time.time() - 3 * 3600, timezone.utc).isoformat()
    reports = {
        "KOLD": {"flight_category": "IFR", "lat": 42.31, "lon": -88.0, "observed_at": old},
        "KNOTIME": {"flight_category": "IFR", "lat": 42.32, "lon": -88.0},
        "KNEW": {"flight_category": "VFR", "lat": 42.4, "lon": -88.0, "observed_at": fresh},
    }
    monkeypatch.setattr(weather, "_dataset", lambda name: reports)
    assert weather.nearest_report(42.3, -88.0)["ident"] == "KNEW"
    assert weather.nearest_report(42.3, -88.0, exclude="KNEW") is None
