"""wingtip.traffic: adsb.lol's answer read into the map's airplanes, and how
often adsb.lol is asked, with adsb.lol stubbed in its own shape (readsb's
JSON, `ac`) and the clock stood in for."""

import threading
import time
from unittest.mock import patch

import pytest
import requests

from wingtip import traffic

from .traffic_world import CESSNA, _answer, _turned_away
from .traffic_world import adsbx_fixture, clock_fixture  # noqa: F401 -- the fixtures, by the names the runner gives them


def test_an_airplane_in_the_air_as_the_map_draws_it(clock):
    with patch("requests.get", return_value=_answer([CESSNA])) as get:
        found = traffic.near(42.3246, -88.0741, 25)
    # Its region's middle, out to 80 nm.
    assert get.call_args.args[0] == "https://api.adsb.lol/v2/point/42.50/-88.00/80"
    assert found == {
        "age_s": 0.0,
        "aircraft": [
            {
                "hex": "a128b9",
                "callsign": "N174HA",
                "registration": "N174HA",
                "type": "C172",
                "lat": 42.30128,
                "lon": -88.14525,
                # The GNSS height, as the phone's own is, and its climb.
                "altitude_ft": 1325.0,
                "pressure_altitude": False,
                "track_deg": 320.19,
                "speed_kt": 93.7,
                "vertical_fpm": -384.0,
                "seen_s": 0.291,
                "squawk": None,
                "emergency": None,
                "category": None,
            }
        ],
    }


def test_on_the_ground_without_a_position_or_with_an_old_one_is_left_out(clock):
    entries = [
        {**CESSNA, "hex": "a1", "alt_baro": "ground"},
        {**CESSNA, "hex": "a2", "lat": None},
        {**CESSNA, "hex": "a3", "seen_pos": 45.0},
        {**CESSNA, "hex": "a4"},
    ]
    with patch("requests.get", return_value=_answer(entries)):
        assert [a["hex"] for a in traffic.near(42.3, -88.1, 25)["aircraft"]] == ["a4"]


def test_a_pressure_altitude_alone_is_said_to_be_one(clock):
    entry = {k: v for k, v in CESSNA.items() if k not in ("alt_geom", "geom_rate")}
    with patch("requests.get", return_value=_answer([entry])):
        (cessna,) = traffic.near(42.3, -88.1, 25)["aircraft"]
    assert cessna["altitude_ft"] == 1200.0 and cessna["pressure_altitude"] is True and cessna["vertical_fpm"] == -512.0


def test_a_view_is_given_the_airplanes_within_it_from_its_regions_answer(clock):
    far = {**CESSNA, "hex": "far", "lat": 42.9}  # 36 nm north of 42.3
    with patch("requests.get", return_value=_answer([CESSNA, far])) as get:
        near_view = traffic.near(42.3, -88.1, 20)["aircraft"]
        wide_view = traffic.near(42.35, -88.05, 50)["aircraft"]
    assert [a["hex"] for a in near_view] == ["a128b9"]
    assert [a["hex"] for a in wide_view] == ["a128b9", "far"]
    # One request for both: the same region, within five seconds.
    assert get.call_count == 1


def test_a_region_is_asked_again_after_five_seconds_and_says_how_old_it_is(clock):
    with patch("requests.get", return_value=_answer([CESSNA])) as get:
        traffic.near(42.3, -88.1, 25)
        clock.now += 3
        assert traffic.near(42.3, -88.1, 25)["age_s"] == 3.0
        clock.now += 3
        assert traffic.near(42.3, -88.1, 25)["age_s"] == 0.0
    assert get.call_count == 2


def test_two_requests_are_never_closer_than_five_seconds(clock):
    asked_at = []

    def get(*args, **kwargs):
        asked_at.append(clock.now)
        return _answer([])

    with patch("requests.get", side_effect=get):
        traffic.near(42.3, -88.1, 25)
        clock.now += 1
        # Another region, with nothing of its own yet: it waits its turn.
        traffic.near(45.0, -93.0, 25)
    assert asked_at == [1000.0, 1005.0]


def test_turned_away_the_last_answer_is_given_and_nothing_asked_for_fifteen_seconds(clock):
    with patch("requests.get", return_value=_answer([CESSNA])):
        traffic.near(42.3, -88.1, 25)
    clock.now += 6
    with patch("requests.get", return_value=_turned_away()) as get:
        assert traffic.near(42.3, -88.1, 25)["age_s"] == 6.0
        clock.now += 10
        assert traffic.near(42.3, -88.1, 25)["age_s"] == 16.0
    assert get.call_count == 1


def test_with_nothing_for_a_minute_traffic_is_unavailable(clock):
    with patch("requests.get", return_value=_answer([CESSNA])):
        traffic.near(42.3, -88.1, 25)
    with patch("requests.get", side_effect=requests.ConnectionError("down")):
        for _ in range(4):
            clock.now += 16
            try:
                traffic.near(42.3, -88.1, 25)
            except traffic.TrafficUnavailable:
                break
        else:
            pytest.fail("an answer over a minute old was still given")
    assert clock.now - 1000.0 >= traffic.KEEP_S


def test_askers_at_once_share_one_request(clock):

    def slow(*args, **kwargs):
        time.sleep(0.2)
        return _answer([])

    with patch("requests.get", side_effect=slow) as get:
        threads = [threading.Thread(target=traffic.near, args=(42.3, -88.1, 25)) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
    assert get.call_count == 1


def test_a_region_with_an_answer_is_not_kept_behind_another_regions_request(clock):
    with patch("requests.get", return_value=_answer([CESSNA])):
        traffic.near(42.3, -88.1, 25)
    started, release = threading.Event(), threading.Event()

    def slow(*args, **kwargs):
        started.set()
        release.wait(5)
        return _answer([])

    with patch("requests.get", side_effect=slow):
        clock.now += 6
        other = threading.Thread(target=traffic.near, args=(45.0, -93.0, 25))
        other.start()
        assert started.wait(5)
        # Its own answer is a second old, fresh: given while the other asks.
        traffic.near(42.3, -88.1, 25)
        release.set()
        other.join()
