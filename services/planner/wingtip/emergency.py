"""What the emergency assistant ranks, gathered in one answer: the fields
nearest the airplane with their runways (each end's true heading), their
METAR's wind, altimeter and temperature, their ATC and CTAF frequencies,
phone and owner, and the wind aloft at the airplane's altitude. Nothing is
ranked or judged here: the engine's best_fields does that in the app
(the web's callEngine, the phones' `call`), so it works on what the
app last fetched. One request where the web's Nearest makes one and each
field's card another, as a phone in an emergency should not wait on ten.
"""

import logging

from . import airports, altitude, faa_data, weather
from .magnetic import magnetic_variation_deg
from .runway_wind import end_heading_true_deg

log = logging.getLogger(__name__)

#: The FAA's frequency kinds a pilot calls in an emergency: the radar
#: facilities (approach, departure), the tower, and the field's own CTAF or
#: UNICOM for its traffic (AIM 6-3-1(d): the frequency in use, else another
#: ATC assigns or a guarded one).
CALLED = ("APP", "DEP", "A/D", "TWR", "CTAF", "UNIC", "UNICOM")


def _runways(source: str, variation_deg: float) -> list[dict]:
    """A field's open runways as the engine reads one, each end with its
    true heading -- the table's, else its number's turned true."""
    out = []
    for r in airports.get_runways(source):
        if r["closed"]:
            continue
        out.append(
            {
                "surface": r["surface"],
                "length_ft": r["length_ft"],
                "closed": False,
                "runway_ends": [
                    {"ident": ident, "heading_true_deg": end_heading_true_deg(ident, heading, variation_deg)}
                    for ident, heading in r["end_headings"]
                ],
            }
        )
    return out


def _metar(report: dict | None) -> dict | None:
    """What the ranking reads of a METAR, and the report as sent."""
    if not report:
        return None
    return {
        "dir_true_deg": report.get("wind_dir_true_deg"),
        "speed_kt": report.get("wind_speed_kt"),
        "gust_kt": report.get("wind_gust_kt"),
        "altimeter_in_hg": report.get("altimeter_in_hg"),
        "temp_c": report.get("temp_c"),
        "flight_category": report.get("flight_category"),
        "raw": report.get("raw"),
    }


def _frequencies(listed: list[dict]) -> list[dict]:
    return [
        {"kind": (f["type"] or "").upper(), "mhz": f["frequency_mhz"], "description": f.get("description")}
        for f in listed
        if (f["type"] or "").upper() in CALLED and f["frequency_mhz"]
    ]


def fields_near(lat: float, lon: float, limit: int = 12) -> list[dict]:
    """The `limit` fields nearest (lat, lon), nearest first, each as the
    engine's best_fields reads a candidate, with its frequencies, phone
    and its METAR as sent beside. A field's weather or frequencies that
    cannot be had leave it without them, never out of the list."""
    found = airports.nearest(lat, lon, limit)
    sources = [p["source_ident"] for p in found]
    try:
        metars = weather.metar_for_idents(sources)
    except weather.WeatherServiceError:
        metars = {}
    try:
        frequencies = airports.get_frequencies_for(sources)
    except (OSError, RuntimeError, ValueError):
        frequencies = {}
    military = faa_data.military_fields(altitude.DEFAULT_FAA_CACHE_DIR)
    private = faa_data.private_fields(altitude.DEFAULT_FAA_CACHE_DIR)
    variation = magnetic_variation_deg(lat, lon)
    out = []
    for p in found:
        source, ident = p["source_ident"].upper(), p["ident"].upper()
        listed = frequencies.get(source, [])
        out.append(
            {
                "ident": p["ident"],
                "name": p["name"],
                "lat": p["lat"],
                "lon": p["lon"],
                "elevation_ft": p.get("elevation_ft"),
                "distance_nm": p["distance_nm"],
                "bearing_deg": p["bearing_deg"],
                "runways": _runways(p["source_ident"], variation),
                "metar": _metar(metars.get(p["source_ident"])),
                "towered": any((f["type"] or "").upper() == "TWR" for f in listed),
                "private": ident in private or source in private,
                "military": bool(military.get(ident) or military.get(source)),
                "frequencies": _frequencies(listed),
                # The FAA's listed phone for the field (NASR APT_CON), for a
                # call once down; none invented where it lists none.
                "phone": faa_data.airport_contact(p["ident"], altitude.DEFAULT_FAA_CACHE_DIR).get("phone"),
            }
        )
    return out


def wind_aloft(lat: float, lon: float, altitude_ft: float | None) -> dict | None:
    """The modelled wind at the airplane's altitude (weather.wind_at_altitude,
    the GFS's), {"from_deg", "kt"}; None where it cannot be had -- not
    calm, and the glide is then worked out in still air, said so."""
    if altitude_ft is None:
        return None
    try:
        wind = weather.wind_at_altitude(lat, lon, altitude_ft)
    except weather.WeatherServiceError:
        return None
    if not wind or wind.get("wind_dir_true_deg") is None:
        return None
    return {"from_deg": wind["wind_dir_true_deg"], "kt": wind["wind_speed_kt"]}
