"""FPL's Routes (/api/route-options): the ways to fly a route."""

from app.routers import route_options

ANSWER = {
    "options": [
        {
            "kind": "fastest",
            "kinds": ["fastest", "weather"],
            "title": "Fastest",
            "stops": ["KDSM"],
            "fuel": ["KDSM"],
            "food": [],
            "path": [[42.3, -88.1], [41.5, -93.7], [41.3, -95.9]],
            "distance_nm": 390.0,
            "air_min": 190.0,
            "ground_min": 30.0,
            "fuel_gal": 31.7,
            "landings": 1,
            # Through a MOA, which it stays open across (AIM 3-4-5), with
            # the card's warning in the engine's words.
            "crosses": [1],
            "marginal": [],
            "warning": "Crosses a MOA",
            "bands": [{"kind": "vfr", "min": 190.0}],
            "tail_kt": 6.0,
            "floor_ft": 2200,
            "water_nm": 0,
        }
    ],
    "own": None,
    "class_b": None,
    "current_path": [],
    "direct": [0],
    "ends": [],
    "current": [],
    "current_marginal": [],
    "current_along": {"bands": [{"kind": "storm", "min": 20.0}], "tail_kt": 2.0, "floor_ft": 2000, "water_nm": 0},
    "hazards": [{"kind": "storm", "name": "Thunderstorms forecast at KCID"}, {"kind": "moa", "name": "Howard West MOA"}],
    "unchecked": ["start and taxi fuel"],
}


def test_the_ways_with_the_airplanes_figures_and_the_pilots_minimums(monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    asked = []

    def options(dep, dest, profile, **given):
        asked.append((dep, dest, profile, given))
        return ANSWER

    monkeypatch.setattr(route_options, "resolve", lambda *idents: tuple({"lat": 1.0 + i, "lon": 2.0} for i, _ in enumerate(idents)))
    monkeypatch.setattr(route_options.wingtip_route_options, "options", options)
    ahead = []
    monkeypatch.setattr(route_options.prefetch, "route", lambda dep, dest, stops="": ahead.append((dep, dest, stops)))
    monkeypatch.setattr(
        route_options,
        "load_route",
        lambda dep, dest, stops="": type(
            "R", (), {"airports": ({"lat": 1.0, "lon": 2.0}, {"lat": 2.0, "lon": 2.0}), "idents": (dep.upper(), dest.upper())}
        )(),
    )
    client = TestClient(app)
    url = "/api/route-options?dep=c81&dest=koma&aircraft=c172&cruise_tas_kt=110&min_ceiling_ft=3000&min_visibility_sm=5"
    first = client.get(url)
    assert first.status_code == 200
    answer = first.json()
    assert {k: v for k, v in answer.items() if k != "chips"} == ANSWER
    # The route line's chips: None, the route as typed, and the way named
    # by what it is, its stops not in its name (the owner, 2026-10-28).
    assert [(c["key"], c["label"], c["stops"], c["crosses"]) for c in answer["chips"]] == [
        ("none", "As typed", [], [0]),
        ("weather", "Avoid Weather & Fastest", ["KDSM"], [1]),
    ]
    dep, dest, profile, given = asked[0]
    assert dep == {"ident": "C81", "lat": 1.0, "lon": 2.0} and dest["ident"] == "KOMA"
    assert profile["cruise_tas_kt"] == 110
    assert given["min_ceiling_ft"] == 3000 and given["min_visibility_sm"] == 5
    # Each chip's route read ahead of a tap on it, the route as typed not.
    assert ahead == [("c81", "koma", "KDSM")]
    # Asked again within ten minutes, the answer kept.
    assert client.get(url).json() == answer and len(asked) == 1 and len(ahead) == 1


def test_a_route_the_plan_refuses_still_gets_its_ways(monkeypatch):
    # A saved trip of too many stops (load_route's 422): the ways are
    # offered from the straight line, nothing of the route's own.
    from fastapi import HTTPException
    from fastapi.testclient import TestClient

    from app.main import app

    asked = []

    def options(dep, dest, profile, **given):
        asked.append(given)
        return ANSWER

    monkeypatch.setattr(route_options, "resolve", lambda *idents: tuple({"lat": 1.0 + i, "lon": 2.0} for i, _ in enumerate(idents)))
    monkeypatch.setattr(route_options.wingtip_route_options, "options", options)

    def refuse(dep, dest, stops=""):
        raise HTTPException(status_code=422, detail="too many stops")

    monkeypatch.setattr(route_options, "load_route", refuse)
    client = TestClient(app)
    answer = client.get("/api/route-options?dep=c81&dest=kdlh&stops=" + ",".join(f"K{i:03d}" for i in range(20)))
    assert answer.status_code == 200
    assert asked[0]["current"] is None and asked[0]["current_idents"] == [] and asked[0]["current_landed"] == []


def test_the_route_lines_chips_one_a_set_of_stops_in_the_owners_order():
    def way(kind, kinds, stops, fuel=(), crosses=()):
        return {**ANSWER["options"][0], "kind": kind, "kinds": kinds, "stops": stops, "fuel": list(fuel), "crosses": list(crosses)}

    found = {
        **ANSWER,
        "own": {**way("own", ["own"], ["KCOU", "KMVN"], ["KMVN"]), "landings": 1},
        "options": [
            way("fastest", ["fastest"], ["TBN"], ["TBN"]),
            way("weather", ["weather"], ["KMVN", "KJLN", "KABC", "KDEF"], crosses=[1]),
            # The same stops as the route with its fuel: not a chip of its own.
            way("land", ["land"], ["KCOU", "KMVN"]),
            way("stops", ["stops"], ["KXYZ"]),
        ],
        "current": [2],
    }
    chips = route_options._chips(found, ["COU", "@42.1,-88.2"])
    assert [(c["key"], c["label"]) for c in chips] == [
        ("none", "As typed"),
        ("fuel", "With Fuel Stops"),
        ("weather", "Avoid Weather"),
        ("fastest", "Fastest"),
    ]
    assert chips[0]["crosses"] == [2] and chips[2]["crosses"] == [1]
    # Nothing but the route itself: no line.
    assert route_options._chips({**ANSWER, "options": []}, []) == []
    # A route that lands where it needs to already, no fuel stop put in:
    # no "With Fuel Stops" (the owner, 2026-11-17).
    landed = {**found, "own": {**way("own", ["own"], ["KCOU", "KMVN"]), "landings": 1}}
    assert "fuel" not in [c["key"] for c in route_options._chips(landed, ["COU", "@42.1,-88.2"])]


def test_the_most_filed_route_is_the_last_chip_its_airway_named(monkeypatch):
    # The owner, 2026-10-27: "Most filed is how you get most flown".
    from fastapi.testclient import TestClient

    from app.main import app

    asked = []
    filed_way = {
        **ANSWER["options"][0],
        "kind": "filed",
        "kinds": ["filed"],
        "title": "Most Filed",
        "stops": ["BAE", "P1", "P2", "OBH"],
        "fuel": [],
        "crosses": [],
        "warning": None,
    }

    def options(dep, dest, profile, **given):
        asked.append(given)
        return {**ANSWER, "filed": filed_way}

    monkeypatch.setattr(route_options, "resolve", lambda *idents: tuple({"lat": 1.0 + i, "lon": 2.0} for i, _ in enumerate(idents)))
    monkeypatch.setattr(route_options.wingtip_route_options, "options", options)
    monkeypatch.setattr(route_options.prefetch, "route", lambda dep, dest, stops="": None)
    monkeypatch.setattr(
        route_options.filed_routes,
        "most_filed",
        lambda dep, dest: [{"stops": ["NOPE"], "flights": 9}, {"stops": ["BAE", "V100", "OBH"], "flights": 4}],
    )

    def load(dep, dest, stops=""):
        from fastapi import HTTPException

        if "NOPE" in stops:
            raise HTTPException(404, "No airport NOPE")
        idents = (dep.upper(), *(["BAE", "P1", "P2", "OBH"] if stops else []), dest.upper())
        return type("R", (), {"airports": tuple({"lat": 1.0 + i, "lon": 2.0} for i in range(len(idents))), "idents": idents})()

    monkeypatch.setattr(route_options, "load_route", load)
    answer = TestClient(app).get("/api/route-options?dep=kfiled&dest=klwd").json()
    # The first the planner can fly, flown fix by fix for the ways' read.
    assert asked[0]["filed"] == ([(2.0, 2.0), (3.0, 2.0), (4.0, 2.0), (5.0, 2.0)], ["BAE", "P1", "P2", "OBH"])
    assert answer["chips"][-1] == {"key": "filed", "label": "Most Filed", "stops": ["BAE", "V100", "OBH"], "fuel": [], "crosses": []}
    assert "filed" not in answer


def test_avoid_class_b_is_asked_at_the_routes_altitude_and_its_chip_comes_before_most_filed(monkeypatch):
    # The owner, 2026-11-17: "You can still avoid class B in the suggested
    # routes". The plan flies through it with its clearance (14 CFR
    # 91.131(a)(1)); the way round is a chip of its own.
    from fastapi.testclient import TestClient

    from app.main import app

    asked, built = [], []
    round_b = {"points": [[1.5, 2.0]], "idents": ["VPNEAR"], "landed": [False]}
    class_b_way = {
        **ANSWER["options"][0],
        "kind": "class_b",
        "kinds": ["class_b"],
        "title": "Avoid Class B",
        "stops": ["VPNEAR"],
        "fuel": [],
    }

    def options(dep, dest, profile, **given):
        asked.append(given)
        return {**ANSWER, "class_b": class_b_way if given["class_b"] else None}

    def route_round(points, idents, landed, cruise_ft):
        built.append((points, cruise_ft))
        return round_b

    monkeypatch.setattr(route_options, "resolve", lambda *idents: tuple({"lat": 1.0 + i, "lon": 2.0} for i, _ in enumerate(idents)))
    monkeypatch.setattr(route_options.wingtip_route_options, "options", options)
    monkeypatch.setattr(route_options.prefetch, "route", lambda dep, dest, stops="": None)
    monkeypatch.setattr(route_options.filed_routes, "most_filed", lambda dep, dest: [])
    monkeypatch.setattr(route_options, "class_b_route", route_round)

    def no_route(dep, dest, stops=""):
        from fastapi import HTTPException

        raise HTTPException(404, "not read here")

    # The straight line, as for a route the plan refuses.
    monkeypatch.setattr(route_options, "load_route", no_route)
    client = TestClient(app)

    answer = client.get("/api/route-options?dep=kmdw&dest=kdlh&altitude_ft=4500").json()
    assert built == [([(1.0, 2.0), (2.0, 2.0)], 4500.0)]
    assert asked[-1]["class_b"] == round_b
    assert answer["chips"][-1]["key"] == "class_b" and answer["chips"][-1]["label"] == "Avoid Class B"
    assert answer["class_b"]["stops"] == ["VPNEAR"]
    # Before the plan, with no altitude, none is asked or offered.
    answer = client.get("/api/route-options?dep=kmdw&dest=kdlh").json()
    assert asked[-1]["class_b"] is None and answer["class_b"] is None
    assert all(c["key"] != "class_b" for c in answer["chips"])
