"""`altitude_starts`, the waypoints whose own altitude begins there (Start
At, the profile's per-leg altitude), taken on the plan's endpoints."""

from app.main import app
from .conftest import AirplaneClient

client = AirplaneClient(app)


def test_altitude_starts_takes_points_of_a_route_alone():
    params = {"dep": "C81", "dest": "KDLH", "altitudes": "KDLH:3000", "altitude_starts": "not a point!"}
    # Refused before any planning, as a bad `altitudes` is; one read is
    # flown by wingtip.own_altitude (tests_wingtip/test_altitude_starts.py).
    response = client.get("/api/plan", params=params)
    assert response.status_code == 422 and "Start At" in response.text


def test_a_visit_is_a_count_from_one():
    # "VPBNG@2" is the second visit (wingtip.own_altitude); @0 or a word is
    # not one, refused as a bad altitude is.
    for params in ({"altitudes": "KDLH@0:3000"}, {"altitudes": "KDLH@two:3000"}, {"altitude_starts": "KDLH@0"}):
        response = client.get("/api/plan", params={"dep": "C81", "dest": "KDLH", **params})
        assert response.status_code == 422, params
