"""wingtip.map_weather: each field's open runways read once from
OurAirports' runways.csv, and a field's METAR as the map's marks read it."""

import pandas as pd

from wingtip import airports, map_weather


def test_a_fields_open_runways_ends_with_their_true_headings(tmp_path, monkeypatch):
    path = tmp_path / "runways.csv"
    pd.DataFrame(
        [
            {"airport_ident": "KDLH", "le_ident": "09L", "he_ident": "27R", "le_heading_degT": 87.0, "he_heading_degT": 267.0, "closed": 0},
            {"airport_ident": "KDLH", "le_ident": "03", "he_ident": "21", "le_heading_degT": None, "he_heading_degT": None, "closed": 0},
            {"airport_ident": "KDLH", "le_ident": "14", "he_ident": "32", "le_heading_degT": 140.0, "he_heading_degT": 320.0, "closed": 1},
        ]
    ).to_csv(path, index=False)
    monkeypatch.setattr(airports, "RUNWAYS_CACHE_PATH", path)
    monkeypatch.setattr(airports, "load_runways", lambda: pd.read_csv(path, low_memory=False))
    assert map_weather.end_headings("kdlh") == [[["09L", 87.0], ["27R", 267.0]], [["03", None], ["21", None]]]
    assert map_weather.end_headings("1D2") == []


def test_no_metar_no_marks_and_a_light_wind_no_crosswind(monkeypatch):
    assert map_weather.marks_of(["KDLH"], 46.8, -92.2, None) == {}
    monkeypatch.setattr(map_weather, "end_headings", lambda ident: [[["18", 180.0], ["36", 360.0]]])
    marks = map_weather.marks_of(["KDLH"], 46.8, -92.2, {"wind_dir_true_deg": 270, "wind_speed_kt": 6})
    assert marks["crosswind_kt"] is None and marks["ceiling_unknown"] is False
