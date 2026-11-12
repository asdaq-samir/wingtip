"""/api/weather/map's winds aloft (wingtip.weather_map.winds_in), worked
once per forecast record and altitude and then cut to each box: the same
stations, figures and order as a lookup of each station in the box at
every ask."""

import math

import numpy as np
from wingtip import airports, weather, weather_map, winds_stations

STATIONS = {"MSN": (43.14, -89.34), "DLH": (46.84, -92.19), "GRB": (44.48, -88.13), "ORD": (41.98, -87.90), "MKE": (42.95, -87.90)}


def _stub(monkeypatch, asked):
    product = winds_stations.FdStations({code: {} for code in STATIONS})
    product.period = {"valid_at": "2026-10-20T18:00:00Z", "use_from": "2026-10-20T14:00:00Z", "use_to": "2026-10-20T21:00:00Z"}
    monkeypatch.setattr(winds_stations, "fd_stations", lambda fcst_hr="06": product)
    monkeypatch.setattr(airports, "load_airports", lambda: None)
    codes = np.array(list(STATIONS))
    lats, lons = (np.radians(np.array([p[i] for p in STATIONS.values()])) for i in (0, 1))
    monkeypatch.setattr(winds_stations, "station_rows", lambda ids, df: (codes, lats, lons))

    def wind(lat, lon, alt, fcst_hr="06"):
        asked.append((round(lat, 2), round(lon, 2), alt))
        # Duluth has none at the altitude; the rest a wind of their own.
        return None if lat > 46 else {"wind_dir_true_deg": 200 + lat + alt / 1000, "wind_speed_kt": 20.4 - lon / 10}

    monkeypatch.setattr(weather, "wind_at_altitude", wind)
    monkeypatch.setattr(weather, "temperatures_aloft", lambda lat, lon, fcst_hr="06": [(lat, lon)])
    monkeypatch.setattr(weather, "temperature_at", lambda profile, alt: profile[0][0] - 50.5 - alt / 1000)
    return product


def _by_lookup(box, altitude_ft, fcst_hr):
    """winds_in as it was: each station in the box looked up at the ask."""
    stations = winds_stations.fd_stations(fcst_hr)
    codes, lats, lons = winds_stations.station_rows(set(stations), airports.load_airports())
    south, west, north, east = box
    out = []
    for code, lat_r, lon_r in zip(codes, lats, lons):
        lat, lon = math.degrees(lat_r), math.degrees(lon_r)
        if not (south <= lat <= north and west <= lon <= east):
            continue
        wind = weather.wind_at_altitude(lat, lon, altitude_ft, fcst_hr)
        if wind is None:
            continue
        temp = weather.temperature_at(weather.temperatures_aloft(lat, lon, fcst_hr), altitude_ft)
        out.append(
            {
                "ident": str(code),
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "dir_true_deg": round(wind["wind_dir_true_deg"]),
                "speed_kt": round(wind["wind_speed_kt"]),
                "temp_c": None if temp is None else round(temp),
            }
        )
    return {"altitude_ft": altitude_ft, "period": stations.period, "stations": out}


def test_the_winds_in_each_box_are_those_looked_up_there_and_worked_once(monkeypatch):
    asked = []
    _stub(monkeypatch, asked)
    boxes = [(40.0, -92.0, 46.0, -84.0), (42.0, -90.0, 44.0, -88.0), (30.0, -100.0, 50.0, -80.0), (10.0, -10.0, 11.0, -9.0)]
    for altitude_ft in (3000.0, 9000.0):
        for box in boxes:
            assert weather_map.winds_in(box, altitude_ft, "06") == _by_lookup(box, altitude_ft, "06")
    asked.clear()
    for box in boxes:
        weather_map.winds_in(box, 9000.0, "06")
    assert asked == []
