"""What wingtip.traffic's tests share: the stand-in for a name the package
holds in many parts, a Cessna as adsb.lol sends it, the clock the tests set,
ADS-B Exchange keyed, and the shapes of adsb.lol's answers. A test file
imports `clock_fixture` and `adsbx_fixture`, which the test runner hands out
by their names, `clock` and `adsbx`."""

from unittest.mock import Mock

import pytest
import requests
from cachetools import TTLCache

from wingtip import airports, registry, traffic, weather
from wingtip.traffic import adsbx as adsbx_part  # the name adsbx is the usage file's fixture
from wingtip.traffic import adsb_lol, alerts, bases, common, flights, lookup, radar, recorded, routes, store, view, watched
from wingtip.config import get_settings


# Every part of the package, for standing in for one of its names.
_PARTS = (traffic, adsb_lol, adsbx_part, alerts, bases, common, flights, lookup, radar, recorded, routes, store, view, watched)


def stand_in(monkeypatch, name, value):
    """Stands in for one of wingtip.traffic's names -- a clock, a cache, a
    helper -- wherever the package holds it: in the part that makes it, in
    every part that imports that same object, and on the package where it
    re-exports it, since each part calls its own reference. monkeypatch
    undoes each at the test's end."""
    held = [part for part in _PARTS if name in vars(part)]
    assert held, f"wingtip.traffic has no {name}"
    assert len({id(vars(part)[name]) for part in held}) == 1, f"the parts hold different {name}s"
    for part in held:
        monkeypatch.setattr(part, name, value)


CESSNA = {
    "hex": "a128b9",
    "type": "adsr_icao",
    "flight": "N174HA  ",
    "r": "N174HA",
    "t": "C172",
    "alt_baro": 1200,
    "alt_geom": 1325,
    "gs": 93.7,
    "track": 320.19,
    "baro_rate": -512,
    "geom_rate": -384,
    "lat": 42.301282,
    "lon": -88.145246,
    "seen_pos": 0.291,
}


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


@pytest.fixture(name="clock")
def clock_fixture(monkeypatch, tmp_path):
    clock = Clock()
    # Recorded tracks, the radar and the views are in the live store, which
    # the suite's conftest puts in each test's own folder.
    stand_in(monkeypatch, "_REGIONS", {})
    stand_in(monkeypatch, "_STATE", {"next_ask": 0.0, "last_ask": -1e9, "search_at": -1e9, "blocked_until": -1e9})
    stand_in(monkeypatch, "_FLIGHTS", {})
    stand_in(monkeypatch, "_FOUND", TTLCache(maxsize=256, ttl=traffic.FOUND_TTL_S, timer=clock))
    stand_in(monkeypatch, "_RECENT", TTLCache(maxsize=256, ttl=traffic.RECENT_TTL_S, timer=clock))
    # The FAA's registry, wherever a copy is on disk, is not this module's.
    monkeypatch.setattr(registry, "lookup", lambda **kwargs: None)
    # Nor the world's fields, which a past flight's ends fall back to.
    monkeypatch.setattr(airports, "nearest_abroad", lambda lat, lon, limit=3: [])
    stand_in(monkeypatch, "_clock", clock)
    stand_in(monkeypatch, "_sleep", clock.sleep)
    stand_in(monkeypatch, "_WATCHED", {})
    stand_in(monkeypatch, "_WATCH_ASKED", {})
    stand_in(monkeypatch, "_FOLLOW_ASKED", {})
    stand_in(monkeypatch, "_WATCH_SOURCE", {})
    stand_in(monkeypatch, "_GLOBE", {"blocked_until": -1e9})
    # The FAA's radar shown with no LADD list kept, as the owner's own stack
    # has it; the list's own tests hold it (test_traffic_ladd.py).
    monkeypatch.setenv("LADD_REQUIRED", "0")
    get_settings.cache_clear()
    # No METAR near: pressure altitudes as sent (on_altimeter's own test).
    monkeypatch.setattr(weather, "nearest_report", lambda lat, lon, **kw: None)
    return clock


def _answer(entries):
    resp = Mock()
    resp.raise_for_status = Mock()
    resp.json = Mock(return_value={"msg": "No error", "ac": entries})
    return resp


def _turned_away():
    resp = Mock()
    resp.raise_for_status = Mock(side_effect=requests.HTTPError("429 Too Many Requests"))
    return resp


def _routed(answers):
    """requests.get answering each URL from `answers` (a substring to an
    answer), and the URLs asked."""
    asked = []

    def get(url, *args, **kwargs):
        asked.append(url)
        for part, answer in answers.items():
            if part in url:
                return answer
        raise AssertionError(f"unexpected {url}")

    return get, asked


def _status(code, body=None):
    resp = Mock()
    resp.status_code = code
    resp.json = Mock(return_value=body)
    return resp


#: A Cessna's last minutes as adsb.lol's globe writes them: its callsign
#: and squawk in the one point that carries details, the last 4 s old.
RECENT = {
    "icao": "a128b9",
    "r": "N174HA",
    "t": "C172",
    "timestamp": 1791800000.0,
    "trace": [
        [
            100.0,
            42.29,
            -88.14,
            1300,
            92.0,
            321.0,
            0,
            -320,
            {"flight": "N174HA  ", "squawk": "1200", "emergency": "none"},
            "adsb_icao",
            1425,
            -256,
        ],
        [116.0, 42.301282, -88.145246, 1200, 93.7, 320.19, 0, -512, None, "adsb_icao", 1325, -384],
    ],
}


@pytest.fixture(name="adsbx")
def adsbx_fixture(clock, monkeypatch, tmp_path):
    """ADS-B Exchange keyed, its month's count kept in a scratch file."""
    monkeypatch.setenv("ADSBX_RAPIDAPI_KEY", "test-key")
    get_settings.cache_clear()
    stand_in(monkeypatch, "ADSBX_USAGE_FILE", tmp_path / "adsbx_usage.json")
    stand_in(monkeypatch, "_ADSBX", {"last": -1e9})
    stand_in(monkeypatch, "_FROM_ADSBX", set())
    stand_in(monkeypatch, "_wall", lambda: 1791800000.0)
    return tmp_path / "adsbx_usage.json"
