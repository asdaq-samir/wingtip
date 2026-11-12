"""Temporary flight restrictions as the weather service stores them
(services/weather/app/tfr.py, whose tests read the site's own shapes and
XNOTAM files): which are near a route, in force during it, or over a
point, and a list kept through an outage."""

import math
from datetime import datetime, timedelta, timezone

import pytest

from wingtip import tfr, weather_store

T0 = 1791126000.0  # 2026-10-04T14:20:00Z


def _square(lat, lon, half=0.05):
    corners = [(lon - half, lat - half), (lon + half, lat - half), (lon + half, lat + half), (lon - half, lat + half)]
    return [[list(c) for c in corners + corners[:1]]]


def _tfr(notam_id: str, title: str, kind: str, square: list, **detail) -> dict:
    return {
        "notam_id": notam_id,
        "title": title,
        "kind": kind,
        "state": None,
        "geometry": {"type": "MultiPolygon", "coordinates": [square]},
        **detail,
    }


@pytest.fixture
def two_tfrs():
    """One on a route from (42, -88) north to (43, -88), one 60 nm off it."""
    times = {"effective": "2026-10-06T23:00:00Z", "expires": "2026-10-07T01:00:00Z"}
    weather_store.write(
        "tfrs",
        [_tfr("6/1", "ON IT", "Security", _square(42.5, -88.0), **times), _tfr("6/2", "FAR OFF", "Hazards", _square(42.5, -86.6), **times)],
        fetched_at=datetime.now(timezone.utc).timestamp(),
        until=None,
    )


def test_a_tfr_the_route_goes_through_during_the_flight_is_told(two_tfrs):
    start = datetime(2026, 10, 6, 22, 30, tzinfo=timezone.utc)
    found = tfr.along_route([(42.0, -88.0), (43.0, -88.0)], start, start + timedelta(hours=2))
    assert [(t["notam_id"], t["kind"], t["crosses"]) for t in found] == [("6/1", "Security", True)]
    assert found[0]["along_track_nm"] == pytest.approx(30.0, abs=1.0)


@pytest.mark.parametrize(("abeam_nm", "listed"), [(4.5, True), (5.5, False)])
def test_near_is_five_miles_east_and_west_at_the_poleward_end_of_a_long_route(abeam_nm, listed):
    """The stock audit's bug 2: a buffer of degrees sized at a 25 N to 49 N
    route's middle reached only cos 49 / cos 37 of 5 nm, 4.1 nm, abeam its
    north end. Here a TFR's nearest corner is `abeam_nm` east of the
    meridian at 48.97 N, from the spherical cross-track identity
    sin(d / R) = cos(lat) sin(dlon) (R 3,440.065 nm), not the code's own."""
    lat, half = 48.97, 0.005
    dlon = math.degrees(math.asin(math.sin(abeam_nm / 3440.065) / math.cos(math.radians(lat))))
    west, south = -86.0 + dlon, lat - 2 * half
    ring = [[west, south], [west + 2 * half, south], [west + 2 * half, lat], [west, lat], [west, south]]
    weather_store.write("tfrs", [_tfr("6/3", "ABEAM", "Hazards", [ring])], fetched_at=datetime.now(timezone.utc).timestamp(), until=None)
    start = datetime(2026, 10, 6, 22, 30, tzinfo=timezone.utc)
    found = tfr.along_route([(25.0, -86.0), (49.0, -86.0)], start, start + timedelta(hours=9))
    assert [t["notam_id"] for t in found] == (["6/3"] if listed else [])
    assert all(not t["crosses"] for t in found)


def test_a_tfr_over_before_the_flight_is_not(two_tfrs):
    start = datetime(2026, 10, 7, 2, 0, tzinfo=timezone.utc)
    assert tfr.along_route([(42.0, -88.0), (43.0, -88.0)], start, start + timedelta(hours=2)) == []


def test_the_tfrs_over_a_point_are_those_that_hold_it(two_tfrs):
    here = tfr.at_point(42.5, -88.0)
    assert [t["notam_id"] for t in here] == ["6/1"]
    assert here[0]["active_now"] is False
    assert tfr.at_point(44.0, -88.0) == []


def test_with_no_list_ever_stored_it_is_unavailable():
    assert tfr.fetched_at() is None
    with pytest.raises(tfr.TfrUnavailable):
        tfr.all_tfrs()


def test_a_list_kept_through_an_outage_leaves_out_the_ended(monkeypatch):
    """A momentary outage of tfr.faa.gov leaves the service's last list in
    the store, its age kept; past the time the service would have read it
    again, any TFR whose NOTAM has expired since is left out."""
    on_it = _tfr("6/1", "ON IT", "Security", _square(42.5, -88.0), expires="2026-10-07T01:00:00Z")
    open_ended = _tfr("6/3", "UNTIL FURTHER NOTICE", "Security", _square(42.5, -88.0), expires=None)
    weather_store.write("tfrs", [on_it, open_ended], fetched_at=T0, until=None)
    weather_store.write_attempt("tfrs", T0 + tfr.SHAPES_TTL_S, "tfr.faa.gov did not answer")
    monkeypatch.setattr(tfr.time, "time", lambda: T0 + tfr.SHAPES_TTL_S + 60)
    assert [t["notam_id"] for t in tfr.all_tfrs()] == ["6/3"]
    assert tfr.fetched_at() == T0 and tfr.failing()
