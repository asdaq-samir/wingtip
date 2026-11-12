"""The dry run played against the forecast (owner, 2026-11-09): the
products the run's airplane meets gathered for its points, and the
engine asked what they mean for it (forecast_run, engine/crates/weather/
src/forecast/run). Each app flies the run (the engine's dry_run) from the
plan's departure time and sends its points here; this module reads the
weather store and asks -- every rule is the engine's.

What is gathered, each from the weather service's copy:
- the TAFs near the run's path and at its fields;
- each point's Gridded LAMP forecast hours (wingtip.glmp.forecast_at);
- each point's winds aloft, the station nearest it in each GFS period;
- the SIGMETs and G-AIRMET snapshots over the path at its times, and the
  SPC's Day 1 convective outlook.

A product that cannot be had is named in `unavailable` and the run is
played against the rest, never failed for it.
"""

from __future__ import annotations

from . import airports, glmp, weather, weather_store, winds_stations
from .engine import ask as _ask
from .geo import corridor_bbox

#: How far round the run's path TAFs are handed over, nm: the engine's
#: reach for a TAF to speak for a point (forecast/field.rs TAF_REACH_NM).
TAF_REACH_NM = 25.0
HOUR_S = 3600.0


def _box(points: list[tuple[float, float]], pad_nm: float) -> tuple[float, float, float, float]:
    """The box round every point, padded (south, west, north, east)."""
    s, w, n, e = corridor_bbox(points[0], points[0], pad_nm)
    for p in points[1:]:
        ps, pw, pn, pe = corridor_bbox(p, p, pad_nm)
        s, w, n, e = min(s, ps), min(w, pw), max(n, pn), max(e, pe)
    return s, w, n, e


def _in_box(lat: float, lon: float, box: tuple) -> bool:
    s, w, n, e = box
    return s <= lat <= n and w <= lon <= e


def _ring_in_box(coords: list, box: tuple) -> bool:
    s, w, n, e = box
    lats, lons = [c[0] for c in coords], [c[1] for c in coords]
    return bool(coords) and not (max(lats) < s or min(lats) > n or max(lons) < w or min(lons) > e)


def _winds(track: list[dict], unavailable: list[str]) -> list[list[dict]]:
    """Each point's GFS periods: the levels at the station nearest it in
    each period held, and the hours the period is used for."""
    per_point: list[list[dict]] = [[] for _ in track]
    for hr in weather_store.WIND_PERIODS:
        try:
            stations = winds_stations.fd_stations(hr)
        except weather.WeatherServiceError:
            if "winds" not in unavailable:
                unavailable.append("winds")
            continue
        period = stations.period or {}
        use_from, use_to = weather._unix(period.get("use_from")), weather._unix(period.get("use_to"))
        if use_from is None or use_to is None:
            continue
        ids, table = set(stations.keys()), airports.load_airports()
        for i, p in enumerate(track):
            code = winds_stations.nearest_station(p["lat"], p["lon"], ids, table)
            if code is None:
                continue
            levels = {str(alt): level for alt, level in stations[code].items()}
            per_point[i].append({"use_from": use_from, "use_to": use_to, "levels": levels})
    return per_point


def _dataset(name: str, unavailable: list[str]) -> list:
    try:
        return weather._dataset(name)
    except weather.WeatherServiceError:
        unavailable.append(name)
        return []


def play(track: list[dict], fields: list[dict], rules: str, minimums: dict | None) -> dict:
    """The engine's forecast_run for the run's points `track` ({"t", "lat",
    "lon", "alt_ft", "row"}) and its `fields` ({"ident", "role", "t",
    "lat", "lon"}), flown under `rules` against the pilot's `minimums`
    ({"ceiling_ft", "visibility_sm"}), with "unavailable": the products
    that could not be had."""
    unavailable: list[str] = []
    if not track:
        return {"samples": [], "legs": [], "fields": [], "areas": [], "alerts": [], "unavailable": []}
    points = [(p["lat"], p["lon"]) for p in track] + [(f["lat"], f["lon"]) for f in fields]
    box = _box(points, TAF_REACH_NM)
    start, end = min(p["t"] for p in track), max(p["t"] for p in track)
    idents = {f["ident"].upper() for f in fields} | {f"K{f['ident'].upper()}" for f in fields}
    tafs = [s for s in _dataset("tafs", unavailable) if _in_box(s["lat"], s["lon"], box) or s["icaoId"] in idents]
    sigmets = [a for a in _dataset("airsigmets", unavailable) if len(a["coords"]) >= 3 and _ring_in_box(a["coords"], box)]
    gairmets: list = []
    try:
        gairmets = weather.gairmet_snapshots_along_route(points, (start, end))
    except weather.WeatherServiceError:
        unavailable.append("gairmets")
    outlooks: list = []
    outlook = weather_store.read("spc-outlook")
    if weather_store.servable(outlook):
        outlooks = [a for a in outlook.data if _ring_in_box(a["coords"], box)]
    else:
        unavailable.append("spc-outlook")
    # The model's hours either side of each point; the engine reads the
    # one nearest its time, and none too far off it.
    modelled = [glmp.forecast_at(p["lat"], p["lon"], p["t"] - HOUR_S, p["t"] + HOUR_S) for p in track]
    if not any(modelled):
        unavailable.append("glmp-forecast")
    winds = _winds(track, unavailable)
    answer = _ask(
        "forecast_run",
        track=[{**p, "modelled": m, "winds": w} for p, m, w in zip(track, modelled, winds, strict=True)],
        fields=fields,
        tafs=tafs,
        sigmets=sigmets,
        gairmets=gairmets,
        outlooks=outlooks,
        rules=rules,
        minimums=minimums,
    )
    return {**answer, "unavailable": unavailable}
