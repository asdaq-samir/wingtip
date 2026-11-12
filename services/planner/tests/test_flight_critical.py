"""What must never break in the air, through the planner's own endpoints
(CI's "Flight-critical" job runs this file on every change): a route from
KMSN to KOSH with an airplane gives a nav log whose figures add up the way
the FAA's dead reckoning adds them (FAA-H-8083-25C ch. 16: time is
distance over groundspeed, fuel is time by the burn, the totals the legs'
sums), with the day's VFR reserve (14 CFR 91.151(a)(1)); and the
emergency's nearest fields come back nearest first, each with its
distance and bearing, with no airplane picked as with one.

The world is stood in for as the rest of the suite does (conftest.py), the
fields and their positions given here: the expected figures are worked
out from them in this file, never read off the code under test."""

import math

import pandas as pd
import pytest
from wingtip import altitude as altitude_module
from wingtip import airports, emergency, navlog

from app import checkpoint_scoring
from app.main import app

from .conftest import AirplaneClient, select_cruise_altitude_stub

client = AirplaneClient(app)

#: The great circle's radius in nautical miles (the FAI sphere): a
#: distance worked out here, apart from the planner's WGS84 geodesic, so
#: it agrees to well within a percent.
EARTH_NM = 3440.065

#: Fields round Oshkosh (OurAirports' airports.csv, its columns as
#: wingtip.airports reads them), and a heliport, which is no field for a
#: forced landing (airports._FIELD_KINDS).
FIELDS = [
    ("KOSH", "Wittman Regional", 43.9844, -88.5570, 808, "medium_airport"),
    ("KATW", "Appleton International", 44.2581, -88.5191, 918, "medium_airport"),
    ("KFLD", "Fond du Lac County", 43.7712, -88.4884, 808, "small_airport"),
    ("KUNU", "Dodge County", 43.4266, -88.7032, 934, "small_airport"),
    ("WI01", "Hospital heliport", 44.0300, -88.5500, 760, "heliport"),
]


def great_circle_nm(a: tuple[float, float], b: tuple[float, float]) -> float:
    (lat1, lon1), (lat2, lon2) = (tuple(map(math.radians, p)) for p in (a, b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_NM * math.asin(math.sqrt(h))


@pytest.fixture
def east_of_madison(monkeypatch, altitude):
    """KMSN to KOSH, 040 degrees magnetic or so: eastbound, so 5,500 ft,
    an odd thousand plus 500 (14 CFR 91.159(a)(1)), in a 270 at 15 kt
    wind, 4 degC and 3 degrees west variation (as test_plan's air); one
    checkpoint halfway."""
    eastbound = {**altitude, "recommended_ft": 5500.0, "candidates_ft": [5500.0], "course_magnetic_deg": 40.0, "eastbound": True}
    monkeypatch.setattr(altitude_module, "select_cruise_altitude", select_cruise_altitude_stub(eastbound))
    halfway = {
        "id": "town@43.56,-88.95",
        "category": "town",
        "name": "Beaver Dam",
        "lat": 43.56,
        "lon": -88.95,
        "predicted_score": 4.2,
        "along_track_nm": 30.0,
    }
    monkeypatch.setattr(checkpoint_scoring, "score", lambda dep, dest: [dict(halfway)])
    west_15 = {"wind_dir_true_deg": 270.0, "wind_speed_kt": 15.0}
    monkeypatch.setattr(navlog, "air_at", lambda lat, lon, altitudes, fcst_hr="06": [{"wind": west_15, "temp_c": 4.0} for _ in altitudes])
    monkeypatch.setattr(navlog, "magnetic_variation_deg", lambda lat, lon, on=None: -3.0)


def test_kmsn_to_kosh_with_an_airplane_adds_up(east_of_madison):
    resp = client.get("/api/plan", params={"dep": "KMSN", "dest": "KOSH", "aircraft": "c172"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    legs, totals = body["legs"], body["totals"]
    assert legs[0]["from"] == "KMSN" and legs[-1]["to"] == "KOSH"
    assert all(leg["altitude_ft"] == 5500.0 for leg in legs)
    assert totals["unflyable_legs"] == 0

    # The legs join up, and the whole is about the straight line, 61 nm
    # (the sphere here, the ellipsoid there: within a percent).
    straight = great_circle_nm((43.1399, -89.3375), (43.9844, -88.5570))
    assert totals["distance_nm"] == pytest.approx(sum(leg["distance_nm"] for leg in legs), abs=0.15)
    assert straight * 0.99 <= totals["distance_nm"] <= straight * 1.05

    # Each leg as the handbook works it: T = D / GS, fuel = time x burn.
    for leg in legs:
        assert leg["groundspeed_kt"] > 0, leg
        if leg.get("toc") or leg.get("tod") or leg.get("climb_min"):
            continue  # a climb's minutes and burn are its own
        assert leg["ete_min"] == pytest.approx(leg["distance_nm"] / leg["groundspeed_kt"] * 60, abs=0.15), leg
        assert leg["fuel_gal"] == pytest.approx(leg["ete_min"] / 60 * leg["fuel_burn_gph"], abs=0.06), leg
        # East is least, west is best: 3 degrees west is added (ch. 16).
        assert leg["magnetic_heading_deg"] == pytest.approx((leg["true_heading_deg"] + 3.0) % 360, abs=0.6), leg

    # The totals are the legs' sums.
    assert totals["ete_min"] == pytest.approx(sum(leg["ete_min"] for leg in legs), abs=0.15)
    assert totals["fuel_gal"] == pytest.approx(sum(leg["fuel_gal"] for leg in legs), abs=0.15)

    # By day (conftest's noon): 30 minutes at the cruise burn, 91.151(a)(1),
    # and the fuel required is the trip, the taxi allowance and the reserve.
    burn = body["aircraft"]["fuel_burn_gph"]
    assert totals["reserve_min"] == 30
    assert totals["reserve_gal"] == pytest.approx(30 / 60 * burn, abs=0.01)
    taxi = totals["taxi_gal"] or 0.0
    assert totals["fuel_required_gal"] == pytest.approx(totals["fuel_gal"] + taxi + totals["reserve_gal"], abs=0.11)


@pytest.fixture
def round_oshkosh(monkeypatch):
    """The fields table (FIELDS) for the real airports.nearest, and every
    other lookup a field's card makes stood in for."""
    table = pd.DataFrame(
        [
            {
                "ident": ident,
                "_display_ident": ident,
                "local_code": ident[1:] if ident.startswith("K") else ident,
                "name": name,
                "municipality": None,
                "iso_region": "US-WI",
                "latitude_deg": lat,
                "longitude_deg": lon,
                "elevation_ft": elevation,
                "type": kind,
            }
            for ident, name, lat, lon, elevation, kind in FIELDS
        ]
    )
    monkeypatch.setattr(airports, "_us_airports", lambda cache_path=None: table)
    monkeypatch.setattr(emergency.airports, "get_runways", lambda source: [])
    monkeypatch.setattr(emergency.airports, "get_frequencies_for", lambda idents: {})
    monkeypatch.setattr(emergency.weather, "metar_for_idents", lambda idents: {})
    monkeypatch.setattr(emergency.weather, "wind_at_altitude", lambda lat, lon, alt: None)
    monkeypatch.setattr(emergency, "magnetic_variation_deg", lambda lat, lon, on=None: -3.0)


@pytest.mark.parametrize("aircraft", [None, "c172"], ids=["no airplane", "c172"])
def test_the_nearest_fields_come_nearest_first_with_their_distances(round_oshkosh, aircraft):
    here = (44.10, -88.60)
    params = {"lat": here[0], "lon": here[1], "altitude_ft": 3000, "limit": 3}
    if aircraft:
        params["aircraft"] = aircraft
    resp = client.get("/api/emergency/fields", params=params)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    fields = body["fields"]

    # The three nearest landing fields, the heliport left out, nearest first.
    places = {ident: (lat, lon) for ident, _, lat, lon, _, kind in FIELDS if kind != "heliport"}
    want = sorted(places, key=lambda i: great_circle_nm(here, places[i]))[:3]
    assert [f["ident"] for f in fields] == want
    distances = [f["distance_nm"] for f in fields]
    assert distances == sorted(distances)
    for f in fields:
        assert f["distance_nm"] == pytest.approx(great_circle_nm(here, places[f["ident"]]), rel=0.01), f
        assert 0 <= f["bearing_deg"] < 360
    # KOSH lies south-south-east of the airplane.
    kosh = next(f for f in fields if f["ident"] == "KOSH")
    assert 150 <= kosh["bearing_deg"] <= 180
    # No airplane: the fields still, and no airplane's figure in its place.
    assert (body["airplane"] is None) == (aircraft is None)
