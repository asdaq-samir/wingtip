"""The weather as it was along a replayed flight, for the Studio
(app.routers.studio_history): the METARs of the stations near its track,
the TAFs in force over it, and the NEXRAD composite's frames for its
span. The reports are IEM's archive's (wingtip.history.iem), kept once
read; the radar is IEM's tile cache of the composite at each five-minute
mosaic, which the web draws straight from IEM (wingtip.weather_loop).

Which stations: those with a METAR in the weather store now (the
stations aviationweather.gov lists, as the weather service last read
them), within NEAR_NM of any point of the track, the MOST_STATIONS
nearest it. With no store to hand, the larger fields near the track
(wingtip.airports), each asked of IEM by its ICAO name.
"""

from __future__ import annotations

import datetime as dt

import numpy as np

from .. import airports, geo, weather_loop, weather_store
from . import iem

#: How near the track a station's reports are given: a design choice for
#: the replay, not a rule, about the reach of a station's report a
#: briefing gives with a route (the owner's brief, 2026-11-12).
NEAR_NM = 25.0
#: The most stations given, the nearest the track: enough for a long
#: cross-country's departure, en route and arrival, few enough to read.
MOST_STATIONS = 12
#: METARs from an hour before the span to an hour after it, so the
#: report in force at its start (issued up to an hour before) is there.
METAR_MARGIN_S = 3600
#: The radar composite is a mosaic every five minutes (IEM's "constant
#: availability at minute modulo 5", wingtip.weather_loop).
RADAR_STEP_S = weather_loop.RADAR_STEP_S
#: The most radar frames given: a day at the mosaic's own step; a longer
#: span is thinned evenly.
MOST_FRAMES = 288
#: The most points a track's nearness is worked out from: a long track
#: is thinned evenly, which leaves the stations near it the same.
MOST_POINTS = 200


def _iso(t: float) -> str:
    return dt.datetime.fromtimestamp(t, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _epoch(iso: str) -> float:
    return dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def _thinned(items: list, most: int) -> list:
    """At most `most` of `items`, evenly spaced, the first and last kept."""
    if len(items) <= most:
        return list(items)
    picks = np.linspace(0, len(items) - 1, most).round().astype(int)
    return [items[i] for i in picks]


def _stored_stations() -> dict[str, tuple[float, float]]:
    """The stations with a METAR in the weather store, {ident: (lat, lon)};
    none where the store has none."""
    record = weather_store.read("metars")
    data = record.data if record and isinstance(record.data, dict) else {}
    out = {}
    for ident, report in data.items():
        lat, lon = (report or {}).get("lat"), (report or {}).get("lon")
        if lat is not None and lon is not None and len(ident) == 4:
            out[ident] = (float(lat), float(lon))
    return out


def _fields_near(points: list[tuple[float, float]]) -> dict[str, tuple[float, float]]:
    """The larger fields near the track (wingtip.airports.nearest), by an
    ICAO name, where the weather store has no stations: most of them
    report."""
    out = {}
    for lat, lon in _thinned(points, 20):
        for field in airports.nearest(lat, lon, limit=8):
            ident = field.get("ident") or ""
            if field.get("kind") in ("large", "medium") and len(ident) == 4 and ident.isalpha():
                out[ident] = (field["lat"], field["lon"])
    return out


def stations_near(points: list[tuple[float, float]]) -> list[str]:
    """The stations within NEAR_NM of any of the points, the nearest the
    track first, MOST_STATIONS at most."""
    if not points:
        return []
    track = _thinned(points, MOST_POINTS)
    known = _stored_stations() or _fields_near(track)
    if not known:
        return []
    idents = list(known)
    lats = np.array([known[i][0] for i in idents])
    lons = np.array([known[i][1] for i in idents])
    # A box round the track first, a degree of latitude being 60 nm, so
    # the distances are worked out for the few stations it holds.
    pad = NEAR_NM / 60.0
    t_lats = np.array([p[0] for p in track])
    t_lons = np.array([p[1] for p in track])
    pad_lon = pad / max(np.cos(np.radians(np.abs(t_lats).max())), 0.1)
    inside = (
        (lats >= t_lats.min() - pad) & (lats <= t_lats.max() + pad) & (lons >= t_lons.min() - pad_lon) & (lons <= t_lons.max() + pad_lon)
    )
    near = np.full(len(idents), np.inf)
    for i in np.flatnonzero(inside):
        near[i] = float(np.min(geo.distance_nm(np.full(len(track), lats[i]), np.full(len(track), lons[i]), t_lats, t_lons)))
    order = [i for i in np.argsort(near) if near[i] <= NEAR_NM]
    return [idents[i] for i in order[:MOST_STATIONS]]


def _days(start: float, end: float) -> list[dt.date]:
    first = dt.datetime.fromtimestamp(start, dt.timezone.utc).date()
    last = dt.datetime.fromtimestamp(end, dt.timezone.utc).date()
    return [first + dt.timedelta(days=i) for i in range((last - first).days + 1)]


def metars(stations: list[str], start: float, end: float) -> list[dict]:
    """The stations' METARs from METAR_MARGIN_S before `start` to as long
    after `end`, in time order."""
    lo, hi = start - METAR_MARGIN_S, end + METAR_MARGIN_S
    out = []
    for day in _days(lo, hi):
        for reports in iem.day_reports("metar", stations, day).values():
            out.extend(r for r in reports if lo <= _epoch(r["time"]) <= hi)
    return sorted(out, key=lambda r: (r["time"], r["station"]))


def tafs(stations: list[str], start: float, end: float) -> list[dict]:
    """The TAFs in force over the span, each {"station", "issued", "raw"}:
    a station's newest issued by `start` (looked for from the UTC day
    before) and every one issued after it until `end`, each replacing the
    one before as the NWS issues them. A station with none issued in that
    time has none."""
    by_station: dict[str, list[dict]] = {s: [] for s in stations}
    for day in _days(start - 86400, end):
        for station, reports in iem.day_reports("taf", stations, day).items():
            by_station[station].extend(reports)
    out = []
    for station in stations:
        issued = sorted(by_station[station], key=lambda r: r["issued"])
        before = [r for r in issued if _epoch(r["issued"]) <= start]
        during = [r for r in issued if start < _epoch(r["issued"]) <= end]
        out.extend(([before[-1]] if before else []) + during)
    return [{"station": r["station"], "issued": r["issued"], "raw": r["raw"]} for r in out]


def radar_frames(start: float, end: float) -> list[dict]:
    """The radar composite's frames over the span, each {"valid" (ISO
    UTC), "tiles" (the XYZ template of IEM's mosaic then)}: one a mosaic
    from `start` floored to its five minutes to `end`, MOST_FRAMES at
    most, thinned evenly beyond."""
    first = int(start // RADAR_STEP_S * RADAR_STEP_S)
    stamps = list(range(first, int(end) + 1, RADAR_STEP_S))
    return [{"valid": _iso(t), "tiles": weather_loop.radar_tiles(t)} for t in _thinned(stamps, MOST_FRAMES)]


def weather_then(start: float, end: float, points: list[tuple[float, float]]) -> dict:
    """The weather as it was over a flight: {"metars", "tafs", "radar",
    "source", "credit"}. iem.WeatherHistoryUnavailable where IEM cannot
    be read now."""
    stations = stations_near(points)
    return {
        "metars": metars(stations, start, end),
        "tafs": tafs(stations, start, end),
        "radar": radar_frames(start, end),
        "source": iem.SOURCE,
        "credit": iem.CREDIT,
    }


__all__ = ["metars", "radar_frames", "stations_near", "tafs", "weather_then"]
