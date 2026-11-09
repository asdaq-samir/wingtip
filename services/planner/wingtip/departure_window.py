"""The forecast data "When should I go?" reads for each departure hour
(app.window): how far the TAFs along a route reach, and a field's weather
an hour ahead as the Go / No-Go's checks read a report -- its wind from
its TAF, never the METAR of now. Data only: what an hour comes to is the
engine's (departure_window, wingtip_engine::gonogo::window)."""

from . import weather
from .geo import corridor_bbox

#: The corridor TAF stations are looked for in, either side of the route:
#: the one the briefing's forecast along the route reads
#: (weather.ceiling_visibility_along_route), so the reach is of the same
#: forecasts the hours are judged by.
TAF_CORRIDOR_NM = 10.0

#: A report's members the runway check reads for the field's air: its
#: temperature and altimeter setting (wingtip_engine::gonogo::runways
#: field_air). A TAF gives neither, so an hour ahead keeps the latest
#: report's -- a simplification, said where it is used.
AIR_KEYS = ("temp_c", "altimeter_in_hg")


def taf_reach(path: list[tuple[float, float]]) -> float | None:
    """The last time (UNIX seconds) any TAF along the route forecasts --
    the end of its last period as the AWC's cache file gives it (`timeTo`)
    -- or None where none is near: past it, an hour's weather is not
    known."""
    s, w, n, e = corridor_bbox(path[0], path[-1], TAF_CORRIDOR_NM)
    ends = [
        f.get("timeTo")
        for t in weather._dataset("tafs")
        if s <= t["lat"] <= n and w <= t["lon"] <= e  # noqa: SLF001
        for f in t.get("fcsts") or []
    ]
    ends = [float(x) for x in ends if isinstance(x, (int, float))]
    return max(ends) if ends else None


def forecast_report(lat: float, lon: float, ident: str, at_unix: float, latest: dict | None) -> dict | None:
    """A field's weather for the runway check and the pilot's wind
    minimum at `at_unix`: the prevailing wind its own TAF, else the
    nearest within reach, forecasts then (weather.forecast_wind, never a
    TEMPO or PROB group), with the latest report's temperature and
    altimeter for the field's density altitude. No ceiling, visibility or
    flight category: those an hour ahead are the forecast along the route's
    to say, which the briefing reads over the flight's own window. None
    where no TAF in reach covers that time and no report gives the air."""
    wind = weather.forecast_wind(lat, lon, at_unix, ident)
    air = {k: (latest or {}).get(k) for k in AIR_KEYS if (latest or {}).get(k) is not None}
    if wind is None and not air:
        return None
    return {
        **air,
        "wind_dir_true_deg": wind["dir_true_deg"] if wind else None,
        "wind_speed_kt": wind["speed_kt"] if wind else None,
        "wind_gust_kt": wind["gust_kt"] if wind else None,
    }
