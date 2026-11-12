"""The weather drawn on the map, at the owner's pick (the canvas's map
weather, layers button A, 2026-10-20): the SIGMETs and G-AIRMETs as
areas, the pilot reports where they were made, and the forecast winds
aloft at one altitude at the FD stations -- within the part of the chart
in sight. From the same aviationweather.gov products the briefing reads
(wingtip.weather's held copies), so the map and the Brief never disagree.
The radar and the satellite picture are tiles the browser draws itself
(the Iowa Environmental Mesonet's NEXRAD and GOES mosaics); `radar_valid`
says when the radar was made, as the weather service last read it
(services/weather/app/radar.py).
"""

from __future__ import annotations

import math

from . import weather, weather_store, winds_stations

#: A SIGMET is a flight's for as long as it is valid; a G-AIRMET is a
#: snapshot valid at its time, three hours apart (wingtip.weather): the one
#: nearest the time asked for is drawn, within this.
GAIRMET_NEAREST_S = 90 * 60


def _in_box(coords: list, box: tuple) -> bool:
    south, west, north, east = box
    lats, lons = [lat for lat, _ in coords], [lon for _, lon in coords]
    return not (max(lats) < south or min(lats) > north or max(lons) < west or min(lons) > east)


def advisories_in(box: tuple, at: float) -> list[dict]:
    """The SIGMETs (convective among them) valid at `at`, UNIX seconds, and
    the G-AIRMET snapshot of each hazard nearest `at` -- each whose area
    reaches into `box` (south, west, north, east) -- as areas to draw:
    {"id", "kind", "hazard", "severity", "low_ft", "high_ft",
    "from_freezing_level", "valid_from", "valid_to", "raw", "coords"}.
    A product that cannot be had leaves its own out, not the others."""
    out: list[dict] = []
    try:
        sigmets = weather._dataset("airsigmets")
    except weather.WeatherServiceError:
        sigmets = []
    for i, a in enumerate(sigmets):
        if len(a["coords"]) < 3 or not _in_box(a["coords"], box):
            continue
        if (a["valid_from"] is not None and a["valid_from"] > at) or (a["valid_to"] is not None and a["valid_to"] <= at):
            continue
        kind = (a["type"] or "SIGMET").upper()
        out.append(
            {
                "id": f"sigmet-{i}",
                "kind": "convective"
                if "CONVECTIVE" in (a["hazard"] or "") or "CONVECTIVE" in kind
                else ("airmet" if "AIRMET" in kind else "sigmet"),
                "hazard": a["hazard"],
                "severity": None,
                "low_ft": a["altitude_low_ft"],
                "high_ft": a["altitude_high_ft"],
                "from_freezing_level": False,
                "valid_from": a["valid_from"],
                "valid_to": a["valid_to"],
                "raw": a["raw"],
                "coords": [list(c) for c in a["coords"]],
            }
        )
    try:
        gairmets = weather._dataset("gairmets")
    except weather.WeatherServiceError:
        gairmets = []
    nearest: dict[str, float] = {}
    for a in gairmets:
        if a["valid"] is not None and abs(a["valid"] - at) <= GAIRMET_NEAREST_S:
            nearest[a["hazard"]] = min(nearest.get(a["hazard"], 1e18), abs(a["valid"] - at))
    for i, a in enumerate(gairmets):
        if a["valid"] is None or nearest.get(a["hazard"]) != abs(a["valid"] - at):
            continue
        if len(a["coords"]) < 3 or not _in_box(a["coords"], box):
            continue
        out.append(
            {
                "id": f"gairmet-{i}",
                "kind": "gairmet",
                "hazard": a["hazard"],
                "severity": a["severity"],
                "low_ft": a["altitude_low_ft"],
                "high_ft": a["altitude_high_ft"],
                "from_freezing_level": a["from_freezing_level"],
                "valid_from": a["valid"],
                "valid_to": None,
                "raw": a["due_to"],
                "coords": [list(c) for c in a["coords"]],
            }
        )
    return out


def pireps_in(box: tuple, now: float | None = None) -> list[dict]:
    """The pilot reports still told made in `box` -- the last 90 minutes,
    at or under 18,000 ft, a light airplane's sky, the engine's
    (wingtip.weather.pireps_in_box) -- urgent ones last, so they are drawn
    on top."""
    try:
        return weather.pireps_in_box(box, now)
    except weather.WeatherServiceError:
        return []


# Each FD station's wind and temperature at an altitude, worked once per
# forecast record held: (fcst_hr, altitude_ft) -> (stations, airports, {its
# row: its entry, or None for no wind}). The same for every view of the
# map until the record changes, so a pan works out only the stations it
# has not seen and reads the rest from here.
_WINDS: dict = {}
_WINDS_KEPT = 64


def _worked(stations, airports_df, altitude_ft: float, fcst_hr: str) -> dict:
    held = _WINDS.get((fcst_hr, altitude_ft))
    if held is None or held[0] is not stations or held[1] is not airports_df:
        if len(_WINDS) >= _WINDS_KEPT:
            _WINDS.clear()
        held = _WINDS[(fcst_hr, altitude_ft)] = (stations, airports_df, {})
    return held[2]


def _entry(code, lat: float, lon: float, altitude_ft: float, fcst_hr: str) -> dict | None:
    wind = weather.wind_at_altitude(lat, lon, altitude_ft, fcst_hr)
    if wind is None:
        return None
    temp = weather.temperature_at(weather.temperatures_aloft(lat, lon, fcst_hr), altitude_ft)
    return {
        "ident": str(code),
        "lat": round(lat, 4),
        "lon": round(lon, 4),
        "dir_true_deg": round(wind["wind_dir_true_deg"]),
        "speed_kt": round(wind["wind_speed_kt"]),
        "temp_c": None if temp is None else round(temp),
    }


def winds_in(box: tuple, altitude_ft: float, fcst_hr: str) -> dict | None:
    """The FD stations' forecast wind and temperature at `altitude_ft` in
    `box`, each where the station is (wingtip.weather.wind_at_altitude's own
    interpolation between the altitudes the product gives; each station's
    worked once per record and altitude, _worked), and the period the
    product is for; None where it cannot be had."""
    from . import airports

    try:
        stations = winds_stations.fd_stations(fcst_hr)
    except weather.WeatherServiceError:
        return None
    airports_df = airports.load_airports()
    worked = _worked(stations, airports_df, altitude_ft, fcst_hr)
    codes, lats, lons = winds_stations.station_rows(set(stations), airports_df)
    south, west, north, east = box
    out = []
    for row, (code, lat_r, lon_r) in enumerate(zip(codes, lats, lons)):
        lat, lon = math.degrees(lat_r), math.degrees(lon_r)
        if not (south <= lat <= north and west <= lon <= east):
            continue
        if row not in worked:
            worked[row] = _entry(code, lat, lon, altitude_ft, fcst_hr)
        if worked[row] is not None:
            out.append(dict(worked[row]))
    return {"altitude_ft": altitude_ft, "period": getattr(stations, "period", None), "stations": out}


def radar_valid() -> str | None:
    """When the radar mosaic the map draws was made, ISO UTC, as the
    weather service last read it from IEM's own record of it (every two
    minutes); None where it has none (the tiles may still draw)."""
    record = weather_store.read("radar")
    return (record.data or {}).get("valid") if record else None
