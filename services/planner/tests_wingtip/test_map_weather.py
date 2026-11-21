"""wingtip.map_weather: each field's open runways read once from
OurAirports' runways.csv, and a field's METAR as the map's marks read it."""

import pandas as pd

from wingtip import airport_tables, map_weather


def test_a_fields_open_runways_ends_with_their_true_headings(tmp_path, monkeypatch):
    path = tmp_path / "runways.csv"
    pd.DataFrame(
        [
            {"airport_ident": "KDLH", "le_ident": "09L", "he_ident": "27R", "le_heading_degT": 87.0, "he_heading_degT": 267.0, "closed": 0},
            {"airport_ident": "KDLH", "le_ident": "03", "he_ident": "21", "le_heading_degT": None, "he_heading_degT": None, "closed": 0},
            {"airport_ident": "KDLH", "le_ident": "14", "he_ident": "32", "le_heading_degT": 140.0, "he_heading_degT": 320.0, "closed": 1},
        ]
    ).to_csv(path, index=False)
    # map_weather reads the path from airport_tables, where the split put
    # it (airports only re-exports it), so the test's table is the one read.
    monkeypatch.setattr(airport_tables, "RUNWAYS_CACHE_PATH", path)
    monkeypatch.setattr(map_weather, "load_runways", lambda: pd.read_csv(path, low_memory=False))
    assert map_weather.end_headings("kdlh") == [[["09L", 87.0], ["27R", 267.0]], [["03", None], ["21", None]]]
    assert map_weather.end_headings("1D2") == []


def test_no_metar_no_marks_and_a_light_wind_no_crosswind(monkeypatch):
    kdlh = {"ident": "KDLH", "lat": 46.8, "lon": -92.2}
    assert map_weather.marks_of(kdlh, None) == {}
    monkeypatch.setattr(map_weather, "end_headings", lambda ident: [[["18", 180.0], ["36", 360.0]]])
    marks = map_weather.marks_of(kdlh, {"wind_dir_true_deg": 270, "wind_speed_kt": 6})
    assert marks["crosswind_kt"] is None and marks["ceiling_unknown"] is False


def test_the_fields_in_view_ask_the_engine_once_a_wind_not_once_a_field(monkeypatch):
    map_weather._arrow_shown.cache_clear()
    asked = []
    real = map_weather.ask
    monkeypatch.setattr(map_weather, "ask", lambda name, **given: asked.append(name) or real(name, **given))
    monkeypatch.setattr(map_weather, "end_headings", lambda ident: [])
    for i in range(5):
        map_weather.marks_of({"ident": f"K{i}", "lat": 46.8, "lon": -92.2}, {"wind_dir_true_deg": 270, "wind_speed_kt": 6})
    assert asked == ["wind_arrow"]
