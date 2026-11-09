"""wingtip.route_options with no airplane picked (profile None): the ways
are the route's own -- their paths, distances and what they cross -- with
no minutes, fuel or fuel stops, which need an airplane (the owner,
2026-11-09: "If no airplane is entered, only show the distance and the
things you can without airplane profile, don't assume")."""

from wingtip import route_options

from .test_route_options import DEP, DEST, NO_FIELDS, PROFILE, fields, nearest_nm, sky, taf  # noqa: F401 -- sky, the fixture


def test_the_ways_with_no_airplane_have_their_miles_and_no_minutes_fuel_or_stops(sky):  # noqa: F811
    # 600 nm, which in PROFILE's airplane takes a fuel stop.
    dest = {"ident": "CCC", "lat": 0.0, "lon": 10.0}
    table = fields(*[(f"F{k}", 0.0, float(k)) for k in range(1, 10)])
    flown = route_options.options(DEP, dest, PROFILE, fields=table)
    assert any(o["landings"] for o in flown["options"])
    out = route_options.options(DEP, dest, None, fields=table)
    assert out["options"]
    for way in [*out["options"], out["own"]]:
        assert way["air_min"] is None and way["fuel_gal"] is None, way
        assert way["fuel"] == [] and way["landings"] == 0 and way["ground_min"] == 0
        assert abs(way["distance_nm"] - 600) < 15


def test_the_storms_are_gone_round_with_no_airplane_as_with_one(sky):  # noqa: F811
    sky["tafs"].append(taf("STRM", 0.0, 2.0, wx="TSRA"))
    out = route_options.options(DEP, DEST, None, fields=NO_FIELDS)
    fastest = out["options"][0]
    assert fastest["crosses"] == [] and fastest["air_min"] is None
    # AIM 7-1-27's 20 miles, less the grid's half cell.
    assert nearest_nm(fastest["path"], 0.0, 2.0) >= 20.0 - 8
