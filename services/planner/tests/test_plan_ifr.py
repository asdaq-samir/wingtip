"""A plan under IFR (wingtip.ifr): its reserve, its altitudes and the fuel on
to the alternate. The stubbed world is plan_world's."""

from app.main import app

from .conftest import AirplaneClient
from .plan_world import _stubbed_world  # noqa: F401 -- the stubbed world, autouse

client = AirplaneClient(app)


def test_under_ifr_the_plan_says_so_and_the_reserve_is_45_minutes_by_day(messages):
    """rules=ifr plans the route under IFR (wingtip.ifr): the selection says
    which rules it was made under, and the fuel check keeps 14 CFR
    91.167(a)(3)'s 45 minutes where VFR's day reserve is 30."""
    lines = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH", "rules": "ifr"}))
    altitude = next(m for m in lines if m["type"] == "altitude")
    assert altitude["altitude_selection"]["rules"] == "ifr"
    totals = lines[-1]["totals"]
    assert totals["rules"] == "ifr" and totals["reserve_min"] == 45 and totals["reserve_gal"] == 6.38
    vfr = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH"}))
    vfr_altitude = next(m for m in vfr if m["type"] == "altitude")
    assert vfr_altitude["altitude_selection"]["rules"] == "vfr" and vfr[-1]["totals"]["reserve_min"] == 30
    assert client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH", "rules": "svfr"}).status_code == 422


def test_a_points_own_altitude_may_be_a_flight_level_under_ifr_alone():
    params = {"dep": "C81", "dest": "KDLH", "altitudes": "KDLH:19000"}
    assert client.get("/api/plan", params=params).status_code == 422
    assert client.get("/api/plan", params={**params, "rules": "ifr"}).status_code == 200


def test_an_altitude_the_pilot_set_under_ifr_is_checked_against_ifr_rules():
    """Under IFR a pilot's own altitude is warned under the minimum IFR
    altitude (91.177(a)) and off the thousands its direction takes
    (91.179(b)) -- ATC may assign otherwise, so a warning, never a refusal."""
    from wingtip import planning

    band = {"floor_ft": 4100.0, "eastbound": True, "service_ceiling_ft": 13000.0, "obstacle_clearance_ft": 2000.0}
    selection = {"rules": "ifr", "segments": [{**band, "from_nm": 0.0, "to_nm": 10.0}]}
    at = lambda ft: [{"altitude_ft": ft}]  # noqa: E731

    assert planning.own_altitude_caution(selection, at(5000.0), ("C81", "KDLH")) is None
    assert planning.own_altitude_caution(selection, at(6000.0), ("C81", "KDLH"))["reasons"] == [
        "Eastbound under IFR flies odd thousands, unless ATC assigns otherwise (14 CFR 91.179)"
    ]
    assert planning.own_altitude_caution(selection, at(3000.0), ("C81", "KDLH"))["reasons"] == [
        "Under the 4,100 ft minimum IFR altitude: 2,000 ft over the highest obstacle within 4 nm (14 CFR 91.177(a)(2))"
    ]
    assert planning.own_altitude_caution(selection, at(5500.0), ("C81", "KDLH"))["reasons"] == [
        "Eastbound under IFR flies odd thousands, unless ATC assigns otherwise (14 CFR 91.179)"
    ]


def test_no_ifr_altitude_says_the_minimum_ifr_altitude_and_the_service_ceiling():
    """A C172 direct from Rocky Mountain Metro to Aspen under IFR: the
    minimum IFR altitude over the Rockies is past what it climbs to."""
    from wingtip import planning

    stuck = {
        "from_nm": 0.0,
        "to_nm": 90.0,
        "floor_ft": 16300.0,
        "band_ceiling_ft": 11800.0,
        "service_ceiling_ft": 11800.0,
        "course_magnetic_deg": 235.7,
        "eastbound": False,
        "candidates_ft": [],
        "mountainous": True,
        "obstacle_clearance_ft": 2000.0,
    }
    why = planning.no_altitude({"rules": "ifr", "segments": [stuck]}, ("KBJC", "KASE"), where="45 nm past KBJC")
    assert why["title"] == "No IFR cruising altitude 0-90 nm out of KBJC toward KASE"
    assert why["brief"] == "Ceiling 11,800 ft: the minimum IFR altitude 45 nm past KBJC is 16,300"
    assert why["reasons"] == [
        "The minimum IFR altitude there is 16,300 ft: 2,000 ft over the highest obstacle within 4 nm"
        " over a mountainous area (14 CFR 91.177(a)(2)).",
        "The first westbound IFR altitude above that is 18,000 ft.",
        "The aircraft's service ceiling stops at 11,800 ft.",
    ]


def test_under_ifr_the_fuel_on_to_the_alternate_is_flown_before_the_reserve(messages):
    """14 CFR 91.167(a): to the destination, on to the alternate, then 45
    minutes: KMSN filed as the alternate for C81 to KDLH."""
    params = {"dep": "C81", "dest": "KDLH", "rules": "ifr"}
    without = messages(client.get("/api/navlog", params=params))[-1]["totals"]
    filed = messages(client.get("/api/navlog", params={**params, "alternate": "KMSN"}))[-1]["totals"]
    leg = filed["alternate"]
    assert without["alternate"] is None
    # The leg in its winds, as every leg here is stubbed (_air).
    assert leg["ident"] == "KMSN" and leg["distance_nm"] > 50 and leg["fuel_gal"] > 0 and not leg["still_air"]
    assert filed["fuel_required_gal"] == round(filed["fuel_gal"] + filed["taxi_gal"] + leg["fuel_gal"] + filed["reserve_gal"], 1)
    # Under VFR an alternate means nothing to the fuel.
    vfr = messages(client.get("/api/navlog", params={"dep": "C81", "dest": "KDLH", "alternate": "KMSN"}))[-1]["totals"]
    assert vfr["alternate"] is None
