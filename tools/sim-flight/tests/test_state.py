"""State lines read in either sim's units, and refused with a reason."""

import json

import pytest
from sim_flight.state import StateError, as_json, parse
from wingtip.units import M_PER_FT, MS_TO_KT


def line(**over) -> bytes:
    base = {
        "sim": "xplane",
        "seq": 3,
        "t": 12.5,
        "utc": 1763900000.0,
        "lat": 43.1,
        "lon": -89.3,
        "alt_m": 1676.4,
        "gs_mps": 50.0,
        "track_deg": 365.0,
    }
    return json.dumps({**base, **over}).encode()


def test_metric_lines_give_both_units():
    s = parse(line(vs_mps=2.0, phase="climb"))
    assert s.own.alt_ft == pytest.approx(5500.0)
    assert s.own.gs_kt == pytest.approx(50.0 * MS_TO_KT)
    assert s.own.vs_fpm == pytest.approx(2.0 / M_PER_FT * 60.0)
    assert s.own.track_deg == pytest.approx(5.0)
    assert s.phase == "climb"


def test_the_msfs_agents_feet_and_knots_are_read_as_metres():
    s = parse(json.dumps({"sim": "msfs", "utc": 1.0, "lat": 1, "lon": 2, "alt_ft": 1000, "gs_kt": 100, "vs_fpm": 500}).encode())
    assert s.own.alt_m == pytest.approx(304.8)
    assert s.own.gs_kt == pytest.approx(100.0)
    assert s.own.vs_fpm == pytest.approx(500.0)


def test_traffic_is_read_as_own_ship_is():
    s = parse(
        line(traffic=[{"hex": "a4f001", "callsign": "N4SIM", "lat": 43.2, "lon": -89.2, "alt_m": 1828.8, "gs_mps": 56.0, "track_deg": 270}])
    )
    assert s.traffic[0].callsign == "N4SIM"
    assert s.traffic[0].alt_ft == pytest.approx(6000.0)
    assert as_json(s)["traffic"][0]["alt_ft"] == pytest.approx(6000.0)


@pytest.mark.parametrize(
    "raw, why",
    [
        (b"\xff", "not JSON"),
        (b"[1]", "one JSON object"),
        (json.dumps({"lat": 1, "lon": 2, "alt_m": 3}).encode(), "no seq, t or utc"),
        (line(lat=91), "off the earth"),
        (line(alt_m=None), "no altitude"),
        (line(traffic={}), "traffic is a list"),
    ],
)
def test_a_line_that_is_not_a_state_is_refused_with_its_reason(raw, why):
    with pytest.raises(StateError, match=why):
        parse(raw)
