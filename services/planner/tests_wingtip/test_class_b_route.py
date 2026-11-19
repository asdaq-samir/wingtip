"""Avoid Class B for the Routes (wingtip.class_b_route): the route as
planned with the best fix round the Class B put in each leg that enters it
at its altitude (14 CFR 91.131(a)(1)), none where no leg enters one or one
that does has no way round. Whether a leg enters and which fixes keep it
out are the engine's (class_b_entered, class_b_detours: test_airspace.py
and route/options/classb.rs hold them); here, how the route is put
together from them."""

from pathlib import Path

import pytest

from wingtip import airspace, class_b_route, fixes

A, MID, B = (0.0, 0.0), (0.0, 1.0), (0.0, 2.0)


@pytest.fixture
def world(monkeypatch):
    """The second leg alone enters Class B at 4,500 ft, VPNEAR the best
    way round it; the shapefile is never read."""
    entered = {(MID, B, 4500.0)}
    ways = {(MID, B): [{"ident": "VPNEAR", "kind": "VFR waypoint", "added_nm": 3.1}, {"ident": "VPFAR", "kind": "Fix", "added_nm": 9.0}]}
    monkeypatch.setattr(airspace, "ensure_class_airspace_shapefile", lambda cache_dir: Path("/nowhere"))
    monkeypatch.setattr(airspace, "class_b_entered", lambda start, end, shp, ft: (start, end, ft) in entered)
    monkeypatch.setattr(airspace, "detour_waypoints", lambda start, end, shp, ft: ways.get((start, end), []))
    monkeypatch.setattr(fixes, "find_fix", lambda ident: {"VPNEAR": {"lat": 0.2, "lon": 1.5}}.get(ident))
    class_b_route._CLASS_B_WAYS.clear()
    return ways


def test_the_best_fix_goes_in_the_leg_that_enters_and_the_rest_is_the_route_as_planned(world):
    route = class_b_route.class_b_route([A, MID, B], ["MID"], [True], 4500.0)

    assert route == {"points": [[0.0, 1.0], [0.2, 1.5]], "idents": ["MID", "VPNEAR"], "landed": [True, False]}


def test_none_where_no_leg_enters_class_b_at_the_altitude(world):
    # Under the shelf at 2,500 ft: the route as planned stays out already.
    assert class_b_route.class_b_route([A, MID, B], ["MID"], [True], 2500.0) is None


def test_none_where_a_leg_that_enters_has_no_way_round(world):
    world[(MID, B)] = []
    assert class_b_route.class_b_route([A, MID, B], ["MID"], [True], 4500.0) is None
