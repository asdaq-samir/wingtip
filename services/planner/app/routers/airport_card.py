"""One field's card: its name, the airspace over it, its runways with
their winds and traffic pattern, its radio and the weather there now,
and what it offers a pilot who lands (fuel, fees, parking, repair),
read from the tables already in memory on this side (see
app.routers.airports)."""

import logging

from fastapi import APIRouter, HTTPException, Response
from wingtip import (
    airports,
    altitude,
    diagram_crops,
    faa_data,
    field_details,
    field_use,
    glmp,
    nearby,
    pattern,
    publications,
    remarks,
    runway_wind,
    weather,
)

from ..schemas.airport_services import AirportServices
from ..schemas.airports import AirportPlace
from ..gateway import PUBLIC, SHARED
from ..field_marks import owners_of as _owners, surface_airspace_of

log = logging.getLogger(__name__)

router = APIRouter()


def _notes(ident: str) -> dict:
    """The lighting and mic-click remarks (wingtip.remarks), by the FAA's own
    identifier: KRFD's are RFD's, as are Alaska's and Hawaii's P-idents'.
    None where the remarks file cannot be had: a card without them."""
    candidates = [ident[1:], ident] if len(ident) == 4 and ident[0] in "KP" else [ident]
    try:
        for faa_id in candidates:
            notes = remarks.airport_notes(faa_id)
            if notes["lighting"] or notes["radio"]:
                break
    except (OSError, RuntimeError):
        return {}
    return {
        "lighting": notes["lighting"],
        "lights": notes["lights"],
        "light_notes": notes["light_notes"],
        "radio_notes": notes["radio"],
        "standard_keying": notes["standard_keying"],
    }


def _with_turf(runways: list[dict], ident: str) -> list[dict]:
    """Each runway with the part of it that is turf where the FAA's
    remarks say which (wingtip.remarks.runway_turf), by the FAA's own
    identifier as `_notes` takes it, each part's end named as the runway's
    own are: C81's 06/24 the 1,000 ft from its south-west end, 06. None
    where the remarks file cannot be had."""
    try:
        turf = next((found for faa_id in pattern.faa_ids(ident) if (found := remarks.runway_turf(faa_id))), {})
    except (OSError, RuntimeError):
        return runways
    # A runway is the same either way round: OurAirports may list 24/06.
    by_ends = {frozenset(map(pattern.end_key, ends.split("/"))): parts for ends, parts in turf.items()}
    with_turf = []
    for runway in runways:
        own = {pattern.end_key(end["ident"]): end["ident"] for end in runway.get("runway_ends", [])}
        parts = by_ends.get(frozenset(map(pattern.end_key, (runway.get("ends") or "").split("/"))), [])
        with_turf.append({**runway, "turf": [{**part, "end": own.get(pattern.end_key(part["end"]), part["end"])} for part in parts]})
    return with_turf


@router.get("/api/airport/{ident}", response_model=AirportPlace, openapi_extra=PUBLIC)
def airport_place(ident: str) -> AirportPlace:
    """One US airport's card, by any ident it goes by (C81, KC81, KDLH).

    `airspace_class` is the surface's class, `surface_airspace` with its hours.
    `towered` is whether it lists a tower frequency. No reporting station,
    no `metar`; `weather_unavailable` only where the service was not asked."""
    place = airports.find_place(ident)
    if place is None:
        raise HTTPException(404, f"No US airport goes by {ident.strip().upper()!r}.")
    source = place["source_ident"]
    frequencies = airports.get_frequencies(source)
    unavailable = False
    try:
        metar = weather.metar_for_idents([source]).get(source)
    except weather.WeatherServiceError:
        metar, unavailable = None, True
    # Its own forecast, the TAF as issued, for the card's hours: none for
    # most fields, and none asked for where the weather service is out.
    taf = None
    if not unavailable:
        try:
            taf = (weather.taf_for_idents([source]).get(source) or {}).get("raw")
        except weather.WeatherServiceError:
            taf = None
    military, private = _owners([place])[0]
    # No report of its own: the nearest station's, close enough to say
    # its weather approximately (wingtip.weather.nearest_report).
    nearby = None
    if metar is None and not unavailable:
        try:
            nearby = weather.nearest_report(place["lat"], place["lon"], exclude=source)
        except weather.WeatherServiceError:
            nearby = None
    # And the weather modelled at the field itself for the hour (wingtip.glmp),
    # whatever the reports' service said: its own source.
    modelled = None
    if metar is None:
        try:
            modelled = glmp.at(place["lat"], place["lon"])
        except glmp.GlmpUnavailable as err:
            log.warning("modelled weather at %s: %s", place["ident"], err)
    # Calm now, the field's last wind for the runway in use.
    runways = _with_turf(
        pattern.with_traffic(
            runway_wind.with_winds(
                [r for r in airports.get_runways(source) if not r["closed"]],
                metar,
                place["lat"],
                place["lon"],
                weather.recent_wind(place["ident"]) if metar and metar.get("wind_speed_kt") == 0 else None,
            ),
            place["ident"],
            place["lat"],
            place["lon"],
        ),
        place["ident"],
    )
    return {
        **{key: value for key, value in place.items() if key != "source_ident"},
        **surface_airspace_of(place),  # the class at its surface, part-time or not (the engine's)
        "military": military,
        "private": private,
        "towered": any(f["type"] == "TWR" for f in frequencies),
        **_notes(place["ident"]),
        **{k: v for k, v in (field_use.record_of(source) or {}).items() if k not in ("name", "status")},  # NASR's record (AirportRecord)
        "pattern": pattern.pattern_at(place["ident"], place["elevation_ft"]),
        "runways": runways,
        "frequencies": frequencies,
        "metar": metar,
        "nearby_metar": nearby,
        "modelled_weather": modelled,
        "taf": taf,
        "weather_unavailable": unavailable,
        **field_details.of(place, altitude.DEFAULT_FAA_CACHE_DIR),  # its phones, address, airspace hours and zone
        "airport_diagram_url": publications.airport_diagram_url(place["ident"]),
        "airport_diagram_cycle": publications.airport_diagram_cycle(place["ident"]),
        # Whether its diagram's crop to the runways is worth asking for: not
        # where it is already known not to be found this cycle (WEB-41). The
        # ends as airport_diagram_runways reads them.
        "airport_diagram_runways": not diagram_crops.runways_missing(
            place["ident"], any(e.get("lat") is not None for r in runways for e in r.get("runway_ends", []))
        ),
        "chart_supplement_url": publications.chart_supplement_url(place["ident"]),
        "procedures": publications.terminal_charts(place["ident"]),
    }


@router.get("/api/airport/{ident}/services", response_model=AirportServices, openapi_extra=SHARED)
def airport_services(ident: str, response: Response) -> dict:
    """What a field offers a pilot who lands there, for a stop's card: its
    fuel, fees, parking, repair and oxygen and its courtesy car from the
    FAA's airport file and remarks (wingtip.faa_data.airport_services,
    wingtip.remarks.service_notes), and the places to eat, sleep and hire a
    car near it (wingtip.nearby). Its own request, not the card's: Overture's
    first read of a field is a second or two, which the card's weather
    and runways do not wait on."""
    place = airports.find_place(ident)
    if place is None:
        raise HTTPException(404, f"No US airport goes by {ident.strip().upper()!r}.")
    faa_ids = pattern.faa_ids(place["ident"])
    try:
        notes = next(
            (found for faa_id in faa_ids if (found := remarks.service_notes(faa_id))["fuel"] or found["ground"]),
            {"fuel": [], "ground": [], "courtesy_car": False},
        )
    except (OSError, RuntimeError):
        notes = {"fuel": [], "ground": [], "courtesy_car": False}
    try:
        near = nearby.around(place["ident"], place["lat"], place["lon"])
        unavailable = False
    except nearby.NearbyUnavailable as err:
        log.warning("nearby places at %s: %s", place["ident"], err)
        near, unavailable = {}, True
    # Kept six hours by the browser: the airport file changes by the FAA's
    # 28-day cycle and the places near a field by the month, and the card
    # asked for them afresh on every opening (0.3 to 0.8 s, the 23 Oct
    # timings). Not where the places could not be had: asked again.
    if not unavailable:
        response.headers["Cache-Control"] = "public, max-age=21600"
    return {
        "ident": place["ident"],
        **faa_data.airport_services(place["ident"], altitude.DEFAULT_FAA_CACHE_DIR),
        "fuel_notes": notes["fuel"],
        "fuel_remarks": notes.get("fuel_as_written", []),
        "courtesy_car": notes["courtesy_car"],
        "ground_notes": notes["ground"],
        **near,
        "nearby_unavailable": unavailable,
    }
