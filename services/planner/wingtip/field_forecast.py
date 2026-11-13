"""A field's forecast flight category at a time, for a search's "VFR
at..." filter (the one search's Filters page, 2026-11-10): the TAF that
speaks for the field, read at that time, all by the engine's rules.

Which TAF is the engine's `field_taf`: the field's own, else the nearest
within its reach (25 nm, FAA-H-8083-28B 24.4.3.8.2's vicinity and the planner's reach
past it). What it forecasts then is `taf_window`'s worst at that moment,
TEMPO and PROB groups included (FAA-H-8083-28B 27.4.2.10's change groups) -- a filter
that keeps a field as VFR keeps it only where nothing in its forecast
then says otherwise. The category is `flight_category`'s (AIM 7-1-7,
the ceiling 14 CFR 1.1's). Nothing here works a figure out.
"""

from . import weather
from .engine import ask as _ask
from .geo import box_around

#: How far round a field the TAF stations are handed to the engine, nm:
#: past field_taf's 25 nm reach, so the engine, not this box, decides
#: which one speaks for it.
_BOX_NM = 30.0


def _near(stations: list, lat: float, lon: float) -> list:
    """The stations in a box round a point, for the engine to choose from:
    the national set is some seven hundred."""
    south, west, north, east = box_around(lat, lon, _BOX_NM)
    return [
        s
        for s in stations
        if s.get("lat") is not None and s.get("lon") is not None and south <= s["lat"] <= north and west <= s["lon"] <= east
    ]


def category_at(place: dict, at_unix: float, stations: list) -> dict | None:
    """What the TAF that speaks for a field forecasts at a time: {"at",
    "category" (VFR, MVFR, IFR, LIFR, or None where the TAF does not
    settle it or does not cover the time), "station", "distance_nm" (None
    for the field's own)}. None where no TAF speaks for it."""
    near = _near(stations, place["lat"], place["lon"])
    if not near:
        return None
    picked = _ask(
        "field_taf",
        ident=place["ident"],
        at={"lat": place["lat"], "lon": place["lon"]},
        stations=[{"icao_id": s["icaoId"], "lat": s["lat"], "lon": s["lon"]} for s in near],
    )
    if picked["index"] is None:
        return None
    station = near[picked["index"]]
    worst = _ask("taf_window", fcsts=station["fcsts"], start=at_unix)["worst"]
    category = (
        _ask(
            "flight_category",
            ceiling_ft=worst.get("ceiling_ft"),
            visibility_sm=worst.get("visibility_sm"),
            ceiling_unknown=bool(worst.get("ceiling_unknown")),
        )
        if worst
        else None
    )
    return {"at": at_unix, "category": category, "station": station["icaoId"], "distance_nm": picked["nm"]}


def categories_at(places: list[dict], at_unix: float | None) -> list[dict | None]:
    """category_at for each field, the TAFs read once; all None with no
    time asked, or with the forecasts out (a list without them, as the
    fields with no TAF have)."""
    if at_unix is None:
        return [None] * len(places)
    try:
        # Every TAF the weather service holds, as wingtip.weather's own readers take them.
        stations = weather._dataset("tafs")
    except weather.WeatherServiceError:
        return [None] * len(places)
    return [category_at(p, at_unix, stations) for p in places]
