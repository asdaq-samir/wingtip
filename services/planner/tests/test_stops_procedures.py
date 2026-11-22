"""The procedures flown on a route with stops: a pattern, an approach, an
arrival or a departure, and the runway picked. The stubbed world is
stops_world's."""

import pytest
from wingtip import geo
from wingtip import flight_procedures, procedure_paths
from app.main import app

from .conftest import AirplaneClient, airport
from .stops_world import VIA_MADISON, _stubbed_world  # noqa: F401 -- the stubbed world, autouse

client = AirplaneClient(app)


def test_an_airports_own_pattern_is_the_one_a_flight_comes_down_to():
    legs = client.get("/api/plan", params={**VIA_MADISON, "altitudes": "KMSN:2400"}).json()["legs"]
    tods = {leg["to"]: leg["tod"]["to_ft"] for leg in legs if leg["tod"]}
    assert tods == {"KMSN": 2400.0, "KDLH": 1900.0}


def test_a_flight_landing_by_an_approach_comes_down_to_its_first_fix_by_it(monkeypatch):
    from app import plan_query

    field = airport("KDLH")

    # An approach from ANDOE, crossed at or above 3,000 ft three miles
    # out; its final approach fix lower and nearer, and a missed approach
    # fix higher: neither is the one the descent ends at.
    def fix(ident, north, min_ft, missed=False):
        return {
            "ident": ident,
            "lat": field["lat"] + north,
            "lon": field["lon"],
            "roles": [],
            "min_ft": min_ft,
            "max_ft": None,
            "missed": missed,
        }

    drawn = {"kind": "approach", "fixes": [fix("ANDOE", 0.05, 3000), fix("FAFIX", 0.02, 2300), fix("MISSD", -0.1, 4000, True)]}
    asked = []
    monkeypatch.setattr(
        plan_query.procedures,
        "procedure_drawing",
        lambda ident, procedure, transition=None: asked.append((ident, procedure, transition)) or drawn,
    )
    legs = client.get("/api/plan", params={**VIA_MADISON, "procedures": "DLH:I09:ANDOE"}).json()["legs"]
    tods = {leg["to"]: leg["tod"] for leg in legs if leg["tod"]}
    # Asked once, by the field as picked, for the descent and the leg alike.
    assert asked == [("DLH", "I09", "ANDOE")]
    assert (tods["KDLH"]["to_ft"], tods["KDLH"]["fix"], tods["KDLH"]["pattern"]) == (3000.0, "ANDOE", False)
    # Madison, with no approach picked, still down to its pattern.
    assert (tods["KMSN"]["to_ft"], tods["KMSN"]["fix"], tods["KMSN"]["pattern"]) == (1900.0, None, True)
    # 1,500 ft at three to one is 4.5 nm, short of ANDOE's three miles
    # out: 7.5 nm before the field, the last leg being 10.
    last = [leg for leg in legs if leg["to"] == "KDLH"][-1]
    assert last["tod"]["along_nm"] == pytest.approx(
        last["distance_nm"] - 4.5 - geo.distance_nm(field["lat"] + 0.05, field["lon"], field["lat"], field["lon"]), abs=0.1
    )


def test_a_flight_cruising_under_an_approachs_first_fix_comes_down_to_the_next_fix_lower(monkeypatch):
    from app import plan_query

    field = airport("KDLH")
    # The stub's plan cruises at 4,500: an initial fix at 5,000 is over
    # it, so the descent is to the final approach fix's 2,300.
    drawn = {
        "kind": "approach",
        "fixes": [
            {
                "ident": ident,
                "lat": field["lat"] + north,
                "lon": field["lon"],
                "roles": [],
                "min_ft": min_ft,
                "max_ft": None,
                "missed": False,
            }
            for ident, north, min_ft in (("HIGHR", 0.2, 5000), ("FAFIX", 0.05, 2300))
        ],
    }
    monkeypatch.setattr(plan_query.procedures, "procedure_drawing", lambda ident, procedure, transition=None: drawn)
    legs = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "procedures": "KDLH:R27:HIGHR"}).json()["legs"]
    tod = next(leg["tod"] for leg in legs if leg["tod"])
    assert (tod["to_ft"], tod["fix"]) == (2300.0, "FAFIX")


def test_a_leg_flown_by_an_arrival_is_the_longer_by_its_path_and_so_are_its_time_fuel_and_the_totals(monkeypatch):
    from app import plan_query

    field = airport("KDLH")
    # An arrival out 0.5° west of the field and back: its path from the
    # last leg's start runs miles past the field and round, where the leg
    # runs straight in. Its fix crossed at 12,000, over the plan's cruise.
    west = [field["lat"], field["lon"] - 0.5]
    drawn = {
        "kind": "arrival",
        "holds": [],
        "fixes": [{"ident": "WESTX", "lat": west[0], "lon": west[1], "roles": [], "min_ft": 12000, "max_ft": None, "missed": False}],
        "lines": [{"role": "common", "points": [west, [field["lat"] + 0.05, field["lon"]]]}],
    }
    monkeypatch.setattr(plan_query.procedures, "procedure_drawing", lambda ident, procedure, transition=None: drawn)
    plain = client.get("/api/plan", params=VIA_MADISON).json()
    flown = client.get("/api/plan", params={**VIA_MADISON, "procedures": "KDLH:WEST1"}).json()
    before, after = plain["legs"][-1], flown["legs"][-1]
    more = after["procedure"]["more_nm"]
    assert more > 10
    # The leg keeps the route's own distance, the miles more at its ground
    # speed and burn in its time and fuel.
    assert after["distance_nm"] == before["distance_nm"]
    assert after["ete_min"] == pytest.approx(before["ete_min"] + more / before["groundspeed_kt"] * 60, abs=0.2)
    assert after["fuel_gal"] == pytest.approx(before["fuel_gal"] + after["procedure"]["more_min"] / 60 * before["fuel_burn_gph"], abs=0.02)
    assert after["procedure"]["landing"] is True
    assert after["procedure"]["path"][0] != after["procedure"]["path"][-1]
    # And the totals, the fuel the reserve and the fuel required are added to.
    assert flown["totals"]["distance_nm"] == pytest.approx(plain["totals"]["distance_nm"] + more, abs=0.2)
    assert flown["totals"]["fuel_gal"] == pytest.approx(plain["totals"]["fuel_gal"] + after["procedure"]["more_gal"], abs=0.1)
    # Madison's leg in, with nothing picked there, as it was.
    madison = [leg for leg in flown["legs"] if leg["to"] == "KMSN"][-1]
    assert madison.get("procedure") is None


def test_a_procedure_flown_direct_to_a_fix_is_read_from_its_fourth_part(monkeypatch):
    from app import plan_query

    asked = []

    def drawing(ident, procedure, transition=None):
        asked.append((ident, procedure, transition))
        return {"kind": "approach", "fixes": []}

    monkeypatch.setattr(plan_query.procedures, "procedure_drawing", drawing)
    q = plan_query.PlanQuery(dep="C81", dest="KDLH", procedures="KDLH:I09::ANDOE,KDLH:R27:HIGHR:WIRSA")
    assert q.procedure_picks() == [("KDLH", "I09", None, "ANDOE", False), ("KDLH", "R27", "HIGHR", "WIRSA", False)]
    assert [d.get("direct") for _, d in q.drawn_procedures()] == ["ANDOE", "WIRSA"]
    assert asked == [("KDLH", "I09", None), ("KDLH", "R27", "HIGHR")]


def test_a_loaded_approach_is_not_flown_and_an_unsuspended_one_flies_its_missed_approach(monkeypatch):
    """The owner's load-then-activate (2026-11-22): an approach loaded
    ("L") is left out of the route flown; activated and unsuspended ("M"),
    its missed approach is flown on from the MAP (AIM 5-4-21)."""
    from app import plan_query

    monkeypatch.setattr(plan_query.procedures, "procedure_drawing", lambda *_a: {"kind": "approach", "fixes": []})
    q = plan_query.PlanQuery(dep="C81", dest="KDLH", procedures="KMSN:I36:::L,KDLH:I27:::M")
    assert q.procedure_picks() == [("KDLH", "I27", None, None, True)]
    assert [d.get("fly_missed") for _, d in q.drawn_procedures()] == [True]


def test_a_fix_given_an_altitude_to_cross_is_crossed_at_it_for_the_descent(monkeypatch):
    """The owner's ask ("set an altitude when crossing it"): ANDOE given
    2,500 where the chart has 3,000 or above, the descent planned to it."""
    from app import plan_query

    field = airport("KDLH")
    drawn = {
        "kind": "approach",
        "fixes": [
            {
                "ident": "ANDOE",
                "lat": field["lat"] + 0.05,
                "lon": field["lon"],
                "roles": [],
                "min_ft": 3000,
                "max_ft": None,
                "missed": False,
            }
        ],
    }
    monkeypatch.setattr(plan_query.procedures, "procedure_drawing", lambda ident, procedure, transition=None: drawn)
    params = {"dep": "C81", "dest": "KDLH", "procedures": "KDLH:I09:ANDOE", "crossings": "ANDOE:2500"}
    legs = client.get("/api/plan", params=params).json()["legs"]
    tod = next(leg["tod"] for leg in legs if leg["tod"])
    assert (tod["to_ft"], tod["fix"]) == (2500.0, "ANDOE")
    assert client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", "crossings": "ANDOE:99999"}).status_code == 422


def test_a_departure_is_flown_by_its_transition_for_the_runway_left_from(monkeypatch):
    """St. Louis's BERYY6 left 30R by its runway 11 transition (the audit of
    2026-10-21): the runway the pilot picked goes to the path."""
    from app import plan_query

    field = airport("C81")
    drawn = {
        "kind": "departure",
        "fixes": [],
        "holds": [],
        "lines": [{"role": "runway", "name": "RW27", "points": [[field["lat"], field["lon"]], [field["lat"] + 0.05, field["lon"]]]}],
    }
    monkeypatch.setattr(plan_query.procedures, "procedure_drawing", lambda ident, procedure, transition=None: drawn)
    asked = []
    real = procedure_paths.flown
    monkeypatch.setattr(procedure_paths, "flown", lambda *a, **k: asked.append(k.get("runway")) or real(*a, **k))
    params = {"dep": "C81", "dest": "KDLH", "procedures": "C81:DEP1", "runways": "C81:27,KDLH:9"}
    assert client.get("/api/plan", params=params).status_code == 200
    assert set(asked) == {"27"}  # the floor's read of the path (AV-2) and the path flown alike
    # By the FAA's ident, as the procedures are (_bare_field).
    assert plan_query.PlanQuery(dep="C81", dest="KDLH", runways="kstl:30r").departure_runways() == {"STL": "30R"}
    assert client.get("/api/plan", params={**params, "runways": "C81:west"}).status_code == 422


@pytest.mark.parametrize("picks", ["KDLH", "KDLH:", "KDLH:I09:ANDOE:X", "KDLH:I09;KMSN:R18"])
def test_a_procedure_that_is_not_one_is_refused(picks):
    params = {**VIA_MADISON, "procedures": picks}
    assert client.get("/api/plan", params=params).status_code == 422
    assert client.get("/api/navlog", params=params).status_code == 422


def test_the_runways_picked_are_flown_off_the_runway_and_into_the_pattern(monkeypatch):
    """The owner's "is it not flying that and landing?" (2026-10-27): with a
    runway picked at each end and no procedure, the first leg leaves along
    the runway and its upwind, and the last comes in by the traffic pattern
    to the threshold, its miles in its time and fuel."""

    def runway(ident, airport_, end):
        lat, lon = airport_["lat"], airport_["lon"]
        return {
            "runway_ends": [
                {"ident": "09", "heading_true_deg": 90.0, "traffic": "left", "lat": lat, "lon": lon - 0.01},
                {"ident": "27", "heading_true_deg": 270.0, "traffic": "right", "lat": lat, "lon": lon + 0.01},
            ]
        }

    monkeypatch.setattr(flight_procedures, "_field_runway", runway)
    # With checkpoints, as when it was written: each hop is then more than
    # one leg, so the first leg only leaves and the last only lands. With
    # none (the default since 2026-11-18) C81 to Madison is one leg that
    # does both, and says it lands.
    asked = {**VIA_MADISON, "checkpoints": "true"}
    plain = client.get("/api/plan", params=asked).json()
    flown = client.get("/api/plan", params={**asked, "runways": "C81:9,KMSN:27", "patterns": "KMSN:27,KDLH:9"}).json()
    first, last = flown["legs"][0], flown["legs"][-1]
    c81, dlh = airport("C81"), airport("KDLH")
    assert first["procedure"]["path"][0] == [round(c81["lat"], 6), round(c81["lon"] - 0.01, 6)]
    assert first["procedure"]["landing"] is False
    assert last["procedure"]["landing"] is True
    assert last["procedure"]["path"][-1] == [round(dlh["lat"], 6), round(dlh["lon"] - 0.01, 6)]
    assert last["ete_min"] == pytest.approx(plain["legs"][-1]["ete_min"] + last["procedure"]["more_min"], abs=0.2)
    # Into Madison by its pattern, out of it by its runway: each its own leg.
    into_madison = [leg for leg in flown["legs"] if leg["to"] == "KMSN"][-1]
    assert into_madison["procedure"]["landing"] is True


def test_a_runway_landed_on_is_read_from_the_address():
    from app import plan_query

    assert plan_query.PlanQuery(dep="C81", dest="KDLH", patterns="KDLH:9,UGN:23R").landing_runways() == {"DLH": "9", "UGN": "23R"}
