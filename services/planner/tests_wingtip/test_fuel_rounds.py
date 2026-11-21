"""Add Fuel Stops' stops checked in the planner (wingtip.fuel_rounds): the
route planned again with them in till no flight is short, in one request."""

from wingtip import fuel_rounds

# The owner's trip of 2026-11-20 (N654FL, 36 gal usable): from a present
# position near Chicago to Las Vegas and on to KPWK.
POS = "@42.1,-87.9"


def stop(ident: str) -> dict:
    return {"ident": ident, "from_nm": 1.0, "minutes": 1.0, "lands_with_gal": 9.0}


def flight(departure: str, destination: str, idents: list[str]) -> dict:
    return {"departure": departure, "destination": destination, "usable_gal": 36.0, "reason": "fuel", "stops": [stop(i) for i in idents]}


def plan(points: list[str], short: set[tuple[str, str]], fuel_stops: list[dict]) -> dict:
    """A plan's totals: a flight between each two points, those in `short`
    with their fuel margin under nothing."""
    hops = [
        {
            "departure": a,
            "destination": b,
            "totals": {"distance_nm": 100.0, "ete_min": 50.0, "lands_with_gal": 12.0, "fuel_margin_gal": -3.0 if (a, b) in short else 4.0},
        }
        for a, b in zip(points, points[1:])
    ]
    return {"hops": hops, "fuel_stops": fuel_stops}


FIRST = [flight(POS, "KLAS", ["KDSM", "KCBK", "KAIB"]), flight("KLAS", "KPWK", ["KSYF"])]


def test_the_owners_route_converges_in_one_request():
    # The first plan's KDSM to KCBK, flown on its own at 6,500 ft into the
    # wind, landed 3 gal short; the plan with it in suggests KPMV there, and
    # KCWI on KSYF to KPWK; the plan with those in has no flight short.
    asked = []

    def replan(stops):
        asked.append(stops)
        points = [POS, *stops, "KPWK"]
        if "KPMV" not in stops:
            return plan(points, {("KDSM", "KCBK"), ("KSYF", "KPWK")}, [flight("KDSM", "KCBK", ["KPMV"]), flight("KSYF", "KPWK", ["KCWI"])])
        return plan(points, set(), [])

    out = fuel_rounds.converged(POS, ["KLAS"], "KPWK", FIRST, replan, 16)
    assert asked == [["KDSM", "KCBK", "KAIB", "KLAS", "KSYF"], ["KDSM", "KPMV", "KCBK", "KAIB", "KLAS", "KSYF", "KCWI"]]
    assert [[s["ident"] for s in f["stops"]] for f in out] == [["KDSM", "KPMV", "KCBK", "KAIB"], ["KSYF", "KCWI"]]
    assert all(f["passes"] and f["short"] is None for f in out)
    # Each stop's figures are the last plan's, from its flight's departure:
    # KPMV is the second landing, 200 nm and 100 minutes on.
    kpmv = out[0]["stops"][1]
    assert (kpmv["from_nm"], kpmv["minutes"], kpmv["lands_with_gal"]) == (200.0, 100.0, 12.0)


def test_a_flight_with_no_field_in_reach_is_named_short():
    # The plan with the stop in finds KDSM to KCBK short with no field to
    # suggest: it is named, the stops it has kept.
    out = fuel_rounds.converged(
        POS, [], "KCBK", [flight(POS, "KCBK", ["KDSM"])], lambda stops: plan([POS, *stops, "KCBK"], {("KDSM", "KCBK")}, []), 16
    )
    assert [s["ident"] for s in out[0]["stops"]] == ["KDSM"]
    assert out[0]["passes"] is False
    assert out[0]["short"] == {"departure": "KDSM", "destination": "KCBK"}


def test_the_rounds_are_bounded_and_a_plan_not_made_is_unchecked():
    # A stop suggested every time: ROUNDS plans and no more, still short.
    asked = []

    def again(stops):
        asked.append(stops)
        last = stops[-1] if stops else POS
        return plan([POS, *stops, "KXYZ"], {(last, "KXYZ")}, [flight(last, "KXYZ", [f"S{len(stops)}"])])

    out = fuel_rounds.converged(POS, [], "KXYZ", [flight(POS, "KXYZ", ["S0"])], again, 16)
    assert len(asked) == fuel_rounds.ROUNDS
    assert out[0]["passes"] is False and out[0]["short"] is not None
    # The route could not be planned: the first stops offered, unchecked.
    out = fuel_rounds.converged(POS, [], "KXYZ", [flight(POS, "KXYZ", ["S0"])], lambda stops: None, 16)
    assert [s["ident"] for s in out[0]["stops"]] == ["S0"]
    assert out[0]["passes"] is False and out[0]["short"] is None


def test_none_suggested_or_a_break_is_left_as_it_came():
    def never(stops):
        raise AssertionError("planned")

    assert fuel_rounds.converged(POS, [], "KXYZ", [], never, 16) == []
    brk = {**flight(POS, "KXYZ", ["KMID"]), "reason": "break"}
    assert fuel_rounds.converged(POS, [], "KXYZ", [brk], never, 16) == [brk]


def test_stops_go_in_after_their_flights_departure_up_to_the_limit():
    assert fuel_rounds.with_fuel_stops(POS, ["KLAS"], FIRST, 16) == (
        ["KDSM", "KCBK", "KAIB", "KLAS", "KSYF"],
        ["KDSM", "KCBK", "KAIB", "KSYF"],
    )
    # A field already in the route is not put in again; no room, none.
    assert fuel_rounds.with_fuel_stops("KDSM", ["KLAS"], [flight("KDSM", "KLAS", ["DSM"])], 16) is None
    assert fuel_rounds.with_fuel_stops(POS, ["KLAS"], FIRST, 1) is None
