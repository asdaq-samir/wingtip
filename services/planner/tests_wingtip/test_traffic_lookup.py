"""wingtip.traffic's search for one airplane: when adsb.lol's paced API is
asked, and when an answer already in hand settles it. The live sources are
stubbed as test_traffic stubs them; its clock and ADS-B Exchange fixtures
are shared."""

from unittest.mock import patch

import pytest
import requests
from wingtip import registry, traffic
from wingtip.config import get_settings
from wingtip.traffic import adsb_lol

from .traffic_world import CESSNA, _answer, _routed, _status
from .traffic_world import adsbx_fixture, clock_fixture  # noqa: F401 (the fixtures, by the names the runner gives them)

# The clock stood in for and ADS-B Exchange keyed, as test_traffic's own.
pytestmark = pytest.mark.usefixtures("adsbx")

#: N174HA's FAA record, the registry giving its address.
_N174HA = {"n_number": "N174HA", "mode_s_hex": "A128B9", "manufacturer": "Cessna", "model": "172S"}


def _registered(monkeypatch):
    def lookup(n_number=None, hex_id=None):
        return _N174HA if n_number == "N174HA" or hex_id == "a128b9" else None

    monkeypatch.setattr(registry, "lookup", lookup)


def test_an_n_number_ads_b_exchange_and_the_recent_trace_both_have_not_heard_asks_the_paced_api_nothing(monkeypatch):
    # ADS-B Exchange answered "none at that address" and adsb.lol's own
    # recent trace has none (a 404): adsb.lol's API, a search's turn
    # seconds behind the map's regions, would read the same data the trace
    # does, so it is not asked and the answer is at once.
    _registered(monkeypatch)
    get, asked = _routed(
        {"adsbexchange-com1.p.rapidapi.com/v2/icao/a128b9": _answer([]), "adsb.lol/data/traces/b9/trace_recent_a128b9.json": _status(404)}
    )
    with patch("requests.get", side_effect=get):
        found, credit = traffic.find_credited("N174HA")
    assert found == [] and credit == traffic.ADSB_LOL_SOURCE
    assert not any("api.adsb.lol" in u for u in asked)


def test_where_the_recent_trace_cannot_be_read_the_paced_api_is_still_asked(monkeypatch):
    # The globe turning the planner away (a 403, as it did from the owner's
    # network on 2026-11-14): ADS-B Exchange's "none" alone does not settle
    # it, since an airplane heard only by adsb.lol's receivers would then
    # be missed in the air; the API is asked, as before.
    _registered(monkeypatch)
    get, asked = _routed(
        {
            "adsbexchange-com1.p.rapidapi.com/v2/icao/a128b9": _answer([]),
            "adsb.lol/data/traces/b9/trace_recent_a128b9.json": _status(403),
            "api.adsb.lol/v2/reg/N174HA": _answer([CESSNA]),
        }
    )
    with patch("requests.get", side_effect=get):
        found, credit = traffic.find_credited("N174HA")
    assert [a["hex"] for a in found] == ["a128b9"] and credit == traffic.ADSB_LOL_SOURCE
    assert asked[-1] == "https://api.adsb.lol/v2/reg/N174HA"


def test_the_faa_record_needs_no_live_source(monkeypatch):
    # The record alone, from the registry on disk: nothing asked of anyone.
    _registered(monkeypatch)
    with patch("requests.get", side_effect=AssertionError("asked a live source")):
        assert traffic.registered("n174ha")["model"] == "172S"
        assert traffic.registered("A128B9")["n_number"] == "N174HA"
        assert traffic.registered("UAL2088") is None


def _unkeyed(monkeypatch):
    """ADS-B Exchange not keyed: a search goes straight to adsb.lol's API."""
    monkeypatch.delenv("ADSBX_RAPIDAPI_KEY")
    get_settings.cache_clear()


def test_a_refused_first_way_never_sends_a_second_inside_the_gap(clock, monkeypatch):
    """Round 5's audit: a search whose first way was refused, its turn too
    far off, sent its second way at once, so ten pilots typing were ten
    requests inside MIN_GAP_S. Only a way that was answered lends the next
    its turn."""
    _unkeyed(monkeypatch)
    sent = []

    def get(url, **kwargs):
        sent.append((clock.now, url))
        return _answer([])

    with patch("requests.get", side_effect=get):
        # The first pilot's search takes its turn: both ways, in it.
        assert traffic.find("FOO1") == []
        # Nine more, typed in the next seconds: each first way's turn is
        # past a search's wait, so nothing more is sent.
        for n in range(2, 11):
            clock.now += 0.3
            with pytest.raises(traffic.TrafficUnavailable):
                traffic.find(f"FOO{n}")
    first = sent[0][0]
    assert [u.rsplit("/", 2)[-2] for _, u in sent] == ["callsign", "reg"]
    assert all(at == first or at >= first + adsb_lol.MIN_GAP_S for at, _ in sent)


def test_two_searches_adsb_lol_leaves_hanging_hold_the_searches_alone_a_while(clock, monkeypatch):
    """Round 5's audit: adsb.lol hanging, each search spent its whole
    SEARCH_TIMEOUT_S every turn. Two in a row hold the searches for
    SEARCH_HOLD_S; the map's regions are asked as before."""
    _unkeyed(monkeypatch)
    sent = []

    def hanging(url, **kwargs):
        sent.append(url)
        if "/point/" in url:
            return _answer([CESSNA])
        raise requests.Timeout("read timed out")

    with patch("requests.get", side_effect=hanging):
        for text in ("FOO1", "FOO2"):
            with pytest.raises(traffic.TrafficUnavailable):
                traffic.find(text)
            clock.now += adsb_lol.MIN_GAP_S
        searches = len(sent)
        with pytest.raises(traffic.TrafficUnavailable):
            traffic.find("FOO3")
        assert len(sent) == searches  # held: not sent
        assert [a["hex"] for a in traffic.near(42.3, -88.1, 25)["aircraft"]] == ["a128b9"]
        assert not adsb_lol._LOL.held(clock.now)
        clock.now += adsb_lol.SEARCH_HOLD_S
        with pytest.raises(traffic.TrafficUnavailable):
            traffic.find("FOO4")
    assert sent[-1] == "https://api.adsb.lol/v2/callsign/FOO4"


def test_one_search_left_hanging_holds_nothing(clock, monkeypatch):
    _unkeyed(monkeypatch)
    answers = iter([requests.Timeout("read timed out"), _answer([]), _answer([]), requests.Timeout("read timed out")])

    def get(url, **kwargs):
        answer = next(answers)
        if isinstance(answer, Exception):
            raise answer
        return answer

    with patch("requests.get", side_effect=get):
        with pytest.raises(traffic.TrafficUnavailable):
            traffic.find("FOO1")
        clock.now += adsb_lol.MIN_GAP_S
        assert traffic.find("FOO2") == []
        clock.now += adsb_lol.MIN_GAP_S
        # A timeout after an answer is the first in a row again.
        with pytest.raises(traffic.TrafficUnavailable):
            traffic.find("FOO3")
    assert adsb_lol._STATE["searches_held_until"] < clock.now and adsb_lol._STATE["timeouts"] == 1
