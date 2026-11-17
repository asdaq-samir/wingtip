"""The world the stops tests stub (as plan_world's, each hop read off the same
two candidates under ids of its own), and the route most of them fly."""

import pytest
from wingtip import altitude as altitude_module
from wingtip import fixes, geo

from app import checkpoint_scoring

from .conftest import airport, select_cruise_altitude_stub
from .plan_world import CANDIDATES, stub_air

VIA_MADISON = {"dep": "C81", "dest": "KDLH", "stops": "KMSN"}

# The navaid lookup as it is before a test stubs it, for the tests that put it back.
REAL_FIND_NAVAID = fixes.find_navaid


@pytest.fixture(autouse=True)
def _stubbed_world(monkeypatch, altitude):
    # Each hop's own points, as two corridors' reads are: ids of their own.
    monkeypatch.setattr(checkpoint_scoring, "score", lambda dep, dest: [{**c, "id": f"{dep}:{c['id']}"} for c in CANDIDATES])
    monkeypatch.setattr(altitude_module, "select_cruise_altitude", select_cruise_altitude_stub(altitude))
    stub_air(monkeypatch)
    # No chart read to start: every hop's candidates are the stub's.
    monkeypatch.setattr(checkpoint_scoring.chart_model, "corridor", lambda route, wait: None)


def hop_nm(a: str, b: str) -> float:
    pa, pb = airport(a), airport(b)
    return geo.distance_nm(pa["lat"], pa["lon"], pb["lat"], pb["lon"])
