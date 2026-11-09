"""wingtip.departure_window: how far the TAFs along a route reach, and a
field's weather an hour ahead as the Go / No-Go's checks read it."""
from wingtip import departure_window, weather

HOUR = 3600
NOW = 1_794_308_400


def taf(ident, lat, lon, until):
    return {"icaoId": ident, "lat": lat, "lon": lon,
            "fcsts": [{"timeFrom": NOW - HOUR, "timeTo": NOW + 6 * HOUR}, {"timeFrom": NOW + 6 * HOUR, "timeTo": until}]}


def test_the_reach_is_the_last_period_of_any_taf_along_the_route(monkeypatch):
    monkeypatch.setattr(weather, "_dataset", lambda name: [
        taf("KUGN", 42.42, -87.87, NOW + 24 * HOUR),
        taf("KOSH", 43.98, -88.56, NOW + 30 * HOUR),
        # Far off the route: its longer forecast is not this route's.
        taf("KDEN", 39.86, -104.67, NOW + 40 * HOUR),
    ])
    assert departure_window.taf_reach([(42.4222, -87.8679), (43.9844, -88.5570)]) == NOW + 30 * HOUR


def test_no_taf_near_is_no_reach(monkeypatch):
    monkeypatch.setattr(weather, "_dataset", lambda name: [taf("KDEN", 39.86, -104.67, NOW + 40 * HOUR)])
    assert departure_window.taf_reach([(42.4222, -87.8679), (43.9844, -88.5570)]) is None


def test_a_fields_report_ahead_is_its_tafs_wind_with_the_latest_air_and_no_ceiling(monkeypatch):
    monkeypatch.setattr(weather, "forecast_wind", lambda lat, lon, at, ident: {
        "ident": "KOSH", "distance_nm": 0.0, "dir_true_deg": 250, "speed_kt": 14, "gust_kt": 22,
        "valid_from": NOW, "valid_to": NOW + 6 * HOUR})
    latest = {"temp_c": 9, "altimeter_in_hg": 30.12, "ceiling_ft": 500, "visibility_sm": 1, "wind_speed_kt": 3, "flight_category": "IFR"}
    got = departure_window.forecast_report(43.98, -88.56, "KOSH", NOW + 5 * HOUR, latest)
    assert got == {"temp_c": 9, "altimeter_in_hg": 30.12, "wind_dir_true_deg": 250, "wind_speed_kt": 14, "wind_gust_kt": 22}


def test_no_forecast_wind_and_no_report_is_none(monkeypatch):
    monkeypatch.setattr(weather, "forecast_wind", lambda lat, lon, at, ident: None)
    assert departure_window.forecast_report(43.98, -88.56, "KOSH", NOW, None) is None
