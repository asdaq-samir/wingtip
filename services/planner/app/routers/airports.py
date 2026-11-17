"""Airports as places on the map, the way a maps app has places: the
fields in view, for the chart's own airport symbols to be tapped, the
nearest to a position, and a place searched.

Everything here is already in memory on this side: the OurAirports
tables are read once per process (wingtip.airports), the airspace polygons
are parsed once at startup (wingtip.airspace), and the METARs are the
national cache wingtip.weather keeps for minutes at a time; a field with
no report of its own has the weather modelled there for the hour, from
the gridded LAMP wingtip.glmp holds an hour at a time. A card costs a few
table lookups and a point-in-polygon test.

This module holds the lists (in view, search, nearest, waypoints); a
field's card is airport_card, its Stops airport_stops, its pictures and
charts airport_charts.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from wingtip import (
    airports,
    airspace_primaries,
    altitude,
    faa_data,
    field_facts,
    field_forecast,
    field_marks,
    geocode,
    map_weather,
    vfr_waypoints,
    weather,
)

from ..schemas.airports_in_view import AirportsInView
from ..schemas.airports import ForecastWind, PlacesFound, WaypointsInView
from ..gateway import PUBLIC
from ..field_marks import owners_of as _owners, surface_classes_of as _surface_classes
from ..schemas.nearest import NearestAirports

log = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/airports/in-view", response_model=AirportsInView, openapi_extra=PUBLIC)
def airports_in_view(
    south: float = Query(ge=-90, le=90),
    west: float = Query(ge=-180, le=180),
    north: float = Query(ge=-90, le=90),
    east: float = Query(ge=-180, le=180),
    limit: int = Query(default=300, ge=1, le=1000),
    reporting: bool = False,
) -> AirportsInView:
    """The landing fields inside the map's view, the ones that report first
    and then the biggest -- at most `limit`: a state holds thousands -- each
    with its METAR's flight category, for a weather chip (the limit drops
    small fields with nothing to show, never a chip seen further out), its
    class of airspace at its surface, and its mark's order and size as the
    overlay tiles carry them (wingtip.field_marks). The METARs are the
    national cache in memory; with the weather service out the fields come
    back without. With `reporting`, only the fields that report, before
    the limit: the map asks so once for a whole route's box."""
    if south > north or west > east:
        raise HTTPException(422, "The box's south is above its north, or its west east of its east.")
    try:
        stations = weather.reporting_idents()
    except weather.WeatherServiceError:
        stations = set()
    if reporting:
        places = airports.places_in(south, west, north, east, limit, only=stations)
    else:
        places = airports.places_in(south, west, north, east, limit, first=stations)
    try:
        metars = weather.metar_for_idents([p["source_ident"] for p in places])
    except weather.WeatherServiceError:
        metars = {}
    classes = _surface_classes(places)
    primaries = airspace_primaries.primaries()
    towers = faa_data.towered_fields(altitude.DEFAULT_FAA_CACHE_DIR)
    sites = field_marks.sites()
    return {
        "airports": [
            {
                **p,
                "flight_category": (metars.get(p["source_ident"]) or {}).get("flight_category"),
                "military": military,
                "private": private,
                "airspace_class": cls,
                "primary_of": primaries.get(p.get("faa_id") or ""),
                "towered": (tower := p["ident"].upper() in towers or p.get("source_ident", "").upper() in towers),
                **field_marks.fields(p, tower, primaries.get(p.get("faa_id") or ""), sites),
                "weather": map_weather.marks_of(p, metars.get(p["source_ident"])) or None,
            }
            for p, cls, (military, private) in zip(places, classes, _owners(places))
        ]
    }


@router.get("/api/places/search", response_model=PlacesFound, openapi_extra=PUBLIC)
def places_search(q: str = "") -> PlacesFound:
    """Where a place typed is, for Nearest to find the fields near it
    rather than near own ship: the airports whose ident or name starts
    with it, the towns that do (the Census gazetteer), and a street
    address where it starts with a house number (the Census geocoder) --
    each with where it is (wingtip.geocode)."""
    q = q.strip()
    if len(q) < 2:
        return {"places": []}
    found = []
    for row in airports.search_airports(q, limit=3):
        place = airports.find_place(row["ident"])
        if place:
            found.append({"label": f"{place['ident']} · {place['name']}", "kind": "airport", "lat": place["lat"], "lon": place["lon"]})
    found += [{**t, "kind": "town"} for t in geocode.find_towns(q)]
    found += [{**a, "kind": "address"} for a in geocode.find_addresses(q)]
    return {"places": found}


#: The one of a field's listed frequencies to show on its row: its
#: tower's where it has one, else its CTAF, else UNICOM -- OurAirports'
#: frequencies, as the card's Freq. tab lists them (wingtip.airports). It is
#: a listing, not advice on whom to call: a tower open part of the day
#: hands the field to its CTAF when closed (AIM 4-1-9), and inbound to a
#: Class B or C field a pilot calls approach control first (14 CFR
#: 91.130(c), 91.131(a)). The row names the kind, so the pilot sees which.
_INBOUND = (("TWR", "TWR"), ("CTAF", "CTAF"), ("UNIC", "UNICOM"))


def _inbound_radio(frequencies: list[dict]) -> dict | None:
    """The frequency to list for a field, of its frequencies."""
    for listed, kind in _INBOUND:
        for f in frequencies:
            if f["type"] == listed and f["frequency_mhz"]:
                return {"kind": kind, "mhz": f["frequency_mhz"]}
    return None


@router.get("/api/airports/nearest", response_model=NearestAirports, openapi_extra=PUBLIC)
def nearest_airports(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    limit: int = Query(default=10, ge=1, le=25),
    at: float | None = Query(default=None, description="A time, s since 1970: each field's forecast then (a search's VFR at...)."),
) -> NearestAirports:
    """The landing fields nearest a position -- own ship's, for the map's
    Nearest, and a search's results -- the nearest first: how far and
    which way, each one's longest open runway, a frequency listed for it,
    its flight category where it reports, and its class of airspace at
    the surface, as the map's marks have it; and what a search filters
    by: towered, fuel, runway surfaces, an instrument approach, the
    METAR's wind and visibility, and with `at` the forecast then."""
    found = airports.nearest(lat, lon, limit)
    try:
        metars = weather.metar_for_idents([p["source_ident"] for p in found])
    except weather.WeatherServiceError:
        metars = {}
    # Read once for the list, and like the weather, a list without it: the
    # frequency is on the row for convenience, the fields are the answer.
    try:
        frequencies = airports.get_frequencies_for([p["source_ident"] for p in found])
    except (OSError, RuntimeError, ValueError):
        frequencies = {}
    towers = faa_data.towered_fields(altitude.DEFAULT_FAA_CACHE_DIR)
    out = []
    for p, cls, (military, private), facts, forecast in zip(
        found, _surface_classes(found), _owners(found), field_facts.facts_for(found), field_forecast.categories_at(found, at)
    ):
        lengths = [r["length_ft"] for r in airports.get_runways(p["source_ident"]) if not r["closed"] and r["length_ft"]]
        metar = metars.get(p["source_ident"]) or {}
        out.append(
            {
                **p,
                **facts,
                **{k: metar.get(k) for k in ("wind_dir_true_deg", "wind_speed_kt", "wind_gust_kt", "visibility_sm")},
                "forecast": forecast,
                "towered": p["ident"].upper() in towers or p.get("source_ident", "").upper() in towers,
                "longest_runway_ft": max(lengths) if lengths else None,
                "flight_category": metar.get("flight_category"),
                "military": military,
                "private": private,
                "airspace_class": cls,
                "radio": _inbound_radio(frequencies.get(p["source_ident"].upper(), [])),
            }
        )
    return {"airports": out}


@router.get("/api/waypoints/in-view", response_model=WaypointsInView, openapi_extra=PUBLIC)
def waypoints_in_view(
    south: float = Query(ge=-90, le=90),
    west: float = Query(ge=-180, le=180),
    north: float = Query(ge=-90, le=90),
    east: float = Query(ge=-180, le=180),
    limit: int = Query(default=500, ge=1, le=1000),
) -> WaypointsInView:
    """The VFR waypoints inside the map's view (wingtip.fixes), at most
    `limit`: the magenta flags the sectional prints round busy airspace,
    for the map to mark each with a diamond a pilot can tap and route
    through. GPS waypoints and the rest of NASR's fixes are left out:
    they are not on a VFR chart."""
    if south > north or west > east:
        raise HTTPException(422, "The box's south is above its north, or its west east of its east.")
    return {"waypoints": vfr_waypoints.in_view(south, west, north, east, limit)}


@router.get("/api/airport/{ident}/forecast-wind", response_model=ForecastWind | None, openapi_extra=PUBLIC)
def airport_forecast_wind(ident: str, at: datetime = Query(..., description="When, ISO 8601; a naive time is UTC.")) -> dict | None:
    """The wind forecast at a field for a time -- a flight's arrival, for
    the runway it will find in use then, at the owner's pick (2026-10-20):
    its own TAF's prevailing wind, else the nearest TAF's within 30 nm.
    Null where none covers that time; a 503 where the forecasts cannot be
    had."""
    place = airports.find_place(ident)
    if place is None:
        raise HTTPException(404, f"No US airport goes by {ident.strip().upper()!r}.")
    when = (at if at.tzinfo else at.replace(tzinfo=timezone.utc)).timestamp()
    try:
        return weather.forecast_wind(place["lat"], place["lon"], when, place["source_ident"])
    except weather.WeatherServiceError as err:
        raise HTTPException(503, f"The forecasts could not be had: {err}") from err
