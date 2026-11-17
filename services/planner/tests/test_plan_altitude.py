"""The altitude a plan flies: the pilot's own, the one chosen, none legal
and what that says, and the airplane's own ceiling. The stubbed world is
plan_world's."""

from wingtip import altitude as altitude_module
from wingtip import navlog

from app.main import app

from .conftest import AirplaneClient, select_cruise_altitude_stub
from .plan_world import _stubbed_world, no_winds  # noqa: F401 -- the stubbed world, autouse

client = AirplaneClient(app)


def test_plan_with_a_pilots_own_altitude_flies_it_and_still_offers_the_plans():
    resp = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "altitude_ft": 3500})

    body = resp.json()
    assert body["altitude_ft"] == 3500.0 and all(leg["altitude_ft"] == 3500.0 for leg in body["legs"])
    # No plan is being flown, but the three are there beside the pilot's
    # own, with the reasoning's floor and ceiling.
    assert body["altitude_choice"] is None
    assert [o["kind"] for o in body["altitude_options"]] == ["lowest", "highest", "fastest", "economical"]
    assert body["altitude_selection"]["floor_ft"] == 2200.0


def test_plan_flies_a_route_with_no_legal_altitude_anyway(monkeypatch, altitude):
    # The owner's "I don't want to put hard limits on anything": the lowest
    # altitude over the 2,200 ft floor on the westbound course, 2,500 ft,
    # flown as an altitude of the planner's own, no plan picked.
    monkeypatch.setattr(altitude_module, "select_cruise_altitude", select_cruise_altitude_stub({**altitude, "recommended_ft": None}))

    resp = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["altitude_ft"] == 2500.0 and body["altitude_choice"] is None
    assert all(leg["altitude_ft"] == 2500.0 for leg in body["legs"] if not leg.get("toc") and not leg.get("tod"))


def test_each_outcome_of_the_altitude_resolver(monkeypatch, altitude):
    from wingtip.aircraft import aircraft_profile
    from app.router_basics import load_route
    from wingtip.flight_plan import Flown, NoWinds, resolve_altitude

    r = load_route("C81", "KDLH")
    fix_list = navlog.fixes(r.dep_ident, r.dest_ident, r.start, r.end, [])
    profile = aircraft_profile("c172")

    chosen = resolve_altitude(r, fix_list, profile, "c172", None, "highest")
    assert isinstance(chosen, Flown) and chosen.choice == "highest" and chosen.altitude_ft == 4500.0

    typed = resolve_altitude(r, fix_list, profile, "c172", 3500.0, "lowest")
    assert isinstance(typed, Flown) and typed.choice is None and len(typed.options) == 4

    monkeypatch.setattr(altitude_module, "select_cruise_altitude", select_cruise_altitude_stub({**altitude, "recommended_ft": None}))
    from wingtip import planning

    planning._ALTITUDE_CACHE.clear()
    planning._PLANS_CACHE.clear()
    anyway = resolve_altitude(r, fix_list, profile, "c172", None, "lowest")
    assert isinstance(anyway, Flown) and anyway.choice is None and anyway.altitude_ft == 2500.0

    monkeypatch.setattr(altitude_module, "select_cruise_altitude", select_cruise_altitude_stub(altitude))
    planning._ALTITUDE_CACHE.clear()
    planning._PLANS_CACHE.clear()
    no_winds(monkeypatch)
    outcome = resolve_altitude(r, fix_list, profile, "c172", None, "lowest")
    assert isinstance(outcome, NoWinds) and outcome.options == []


def test_no_altitude_says_where_and_why_in_a_pilots_words():
    """Chicago to Las Vegas in a 172: the Rockies' floor over the climb
    the aeroplane has, not the whole route's highest floor beside its
    lowest ceiling and a query parameter to supply."""
    from wingtip import planning

    selection = {
        "segments": [
            {
                "from_nm": 0.0,
                "to_nm": 150.0,
                "floor_ft": 2500.0,
                "service_ceiling_ft": 14000.0,
                "airspace_ceiling_ft": 3000.0,
                "band_ceiling_ft": 3000.0,
                "course_magnetic_deg": 255.0,
                "eastbound": False,
                "candidates_ft": [2500.0],
            },
            {
                "from_nm": 980.0,
                "to_nm": 1040.0,
                "floor_ft": 13700.0,
                "service_ceiling_ft": 14000.0,
                "airspace_ceiling_ft": None,
                "band_ceiling_ft": 14000.0,
                "course_magnetic_deg": 255.0,
                "eastbound": False,
                "candidates_ft": [],
            },
        ]
    }

    why = planning.no_altitude(selection)

    assert why["title"] == "No legal VFR cruising altitude 980-1040 nm along the route"
    assert why["reasons"] == [
        "The terrain and obstacles there need 13,700 ft.",
        "The first westbound VFR altitude above that is 14,500 ft.",
        "The aircraft's service ceiling stops at 14,000 ft.",
    ]
    # In a few words, for the one line under the route: the ceiling, and
    # the terrain where it binds -- by the route's own points, else how far
    # along -- with the altitude it needs.
    assert why["brief"] == "Ceiling 14,000 ft: terrain 1,010 nm along needs 14,500"
    assert planning.no_altitude(selection, where="540 nm past KDLH")["brief"] == "Ceiling 14,000 ft: terrain 540 nm past KDLH needs 14,500"
    # One message for /api/plan's 422.
    detail = planning.no_altitude(selection)["detail"]
    assert detail.startswith("No legal VFR cruising altitude 980-1040 nm along the route. The terrain")
    assert "altitude_ft" not in detail


def test_no_altitude_names_the_class_b_and_what_it_takes():
    """Midway to Duluth: the straight line runs over O'Hare, where the
    Chicago Class B reaches the ground. It said "The airspace over it
    stops at 0 ft"."""
    from wingtip import planning

    selection = {
        "airspace_transits": [
            {"name": "CHICAGO CLASS C", "class": "C", "floor_ft_msl": 0.0, "along_track_nm": 0.0},
            {"name": "CHICAGO CLASS B", "class": "B", "floor_ft_msl": 3600.0, "along_track_nm": 11.3},
        ],
        "segments": [
            {
                "from_nm": 0.0,
                "to_nm": 1.0,
                "floor_ft": 1700.0,
                "service_ceiling_ft": 12600.0,
                "airspace_ceiling_ft": None,
                "band_ceiling_ft": 12600.0,
                "course_magnetic_deg": 332.0,
                "eastbound": False,
                "candidates_ft": [2500.0],
            },
            {
                "from_nm": 1.0,
                "to_nm": 15.0,
                "floor_ft": 1700.0,
                "service_ceiling_ft": 12600.0,
                "airspace_ceiling_ft": 0.0,
                "band_ceiling_ft": 0.0,
                "course_magnetic_deg": 332.0,
                "eastbound": False,
                "candidates_ft": [],
            },
        ],
    }

    why = planning.no_altitude(selection)

    # From the ground up, the Class B is the whole of why, and the page
    # offers a clearance or a way round.
    assert why["reasons"] == ["The Chicago Class B reaches the ground there; going through it needs a clearance."]
    assert why["class_b"] is True
    assert why["advice"] == "Add a stop to route around it, or plan it with a Class B clearance."
    # The waypoint round it, when there is one.
    via = {"ident": "VPDVB", "kind": "VFR waypoint", "added_nm": 6.2}
    assert planning.no_altitude(selection, via=via)["advice"] == (
        "Fly via VPDVB (6 nm further) to stay out of it, or plan it with a Class B clearance."
    )

    # A shelf above the ground says where it starts, and the altitude
    # under it is the band's own: any 500 ft below the cruising-altitude
    # rule, which begins 3,000 ft above the ground, not the first
    # westbound one (it said 2,500 ft over a 1,700 ft floor).
    selection["segments"][1].update(airspace_ceiling_ft=1900.0, band_ceiling_ft=1900.0, hemispheric_rule_from_ft=3600.0)
    assert planning.no_altitude(selection)["reasons"] == [
        "The terrain and obstacles there need 1,700 ft.",
        "The lowest altitude above that is 2,000 ft.",
        "The Chicago Class B over it starts at 1,900 ft; going into it needs a clearance.",
    ]


def test_an_altitude_the_pilot_set_is_checked_against_the_band_and_warned_not_refused():
    """A pilot's own altitude is flown as set; what is wrong with it is
    said, with the rule each breaks."""
    from wingtip import planning

    band = {
        "floor_ft": 3200.0,
        "hemispheric_rule_from_ft": 3800.0,
        "eastbound": False,
        "airspace_ceiling_ft": 8000.0,
        "service_ceiling_ft": 13000.0,
        "cloud_ceiling_ft": 7000.0,
    }
    selection = {"segments": [{**band, "from_nm": 0.0, "to_nm": 10.0}, {**band, "from_nm": 10.0, "to_nm": 20.0}]}
    at = lambda ft: [{"altitude_ft": ft}, {"altitude_ft": ft}]  # noqa: E731

    # Westbound at 4,500: even thousands plus 500, over the floor, under all.
    assert planning.own_altitude_caution(selection, at(4500.0), ("C81", "VPBNG")) is None
    # 5,500 westbound, above 3,000 ft over the ground: off the rule.
    assert planning.own_altitude_caution(selection, at(5500.0), ("C81", "VPBNG")) == {
        "from_ident": "C81",
        "to_ident": "VPBNG",
        "altitude_ft": 5500.0,
        "reasons": ["Westbound more than 3,000 ft above the ground flies even thousands plus 500: fly 4,500 or 6,500 ft (14 CFR 91.159)"],
    }
    # Under the floor: under the rule too, so that alone.
    assert planning.own_altitude_caution(selection, at(3000.0), ("C81", "VPBNG"))["reasons"] == [
        "Under the 3,200 ft the terrain and obstacles need (14 CFR 91.119)"
    ]
    # Into the clouds' clearance and the Class B over it, each said once.
    assert planning.own_altitude_caution(selection, at(8500.0), ("C81", "VPBNG"))["reasons"] == [
        "Into Class B from 8,000 ft: it needs a clearance (14 CFR 91.131)",
        "Inside the cloud clearance under 7,000 ft (14 CFR 91.155)",
    ]


def test_an_airplanes_own_ceiling_is_flown_over_its_profiles():
    """The pilot's own service ceiling for their N-number (the owner's
    "give users a way to change these specs"): the profile's otherwise."""
    from wingtip.aircraft import aircraft_profile

    assert aircraft_profile("pa28140cruiser")["service_ceiling_ft"] == 10950
    assert aircraft_profile("pa28140cruiser", service_ceiling_ft=14300)["service_ceiling_ft"] == 14300
