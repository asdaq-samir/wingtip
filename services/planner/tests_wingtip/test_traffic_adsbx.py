"""wingtip.traffic with ADS-B Exchange keyed: where it answers when adsb.lol
turns us away, and its gap, its month's allowance and the count it keeps."""

import json
from unittest.mock import patch

import pytest

from wingtip import registry, traffic
from wingtip.traffic import adsbx as adsbx_part  # the name adsbx is the usage file's fixture
from wingtip.traffic import adsb_lol
from wingtip.config import get_settings

from .traffic_world import CESSNA, RECENT, _answer, _routed, _status, _turned_away
from .traffic_world import adsbx_fixture, clock_fixture  # noqa: F401 -- the fixtures, by the names the runner gives them


def test_where_adsb_lol_turns_us_away_ads_b_exchange_answers_and_is_credited(adsbx, clock):
    get, asked = _routed({"api.adsb.lol": _turned_away(), "adsbexchange-com1": _answer([CESSNA])})
    with patch("requests.get", side_effect=get):
        found = traffic.near(42.3246, -88.0741, 25)
    assert [a["hex"] for a in found["aircraft"]] == ["a128b9"]
    assert found["source"] == "ADS-B Exchange"
    assert asked[-1] == "https://adsbexchange-com1.p.rapidapi.com/v2/lat/42.50/lon/-88.00/dist/80/"
    # Counted against the month, on disk.
    assert json.loads(adsbx.read_text()) == {"2026-10": 1}


def test_ads_b_exchange_is_asked_no_more_than_its_gap_and_its_month_allow(adsbx, clock, monkeypatch):
    get, asked = _routed({"api.adsb.lol": _turned_away(), "adsbexchange-com1": _answer([CESSNA])})
    with patch("requests.get", side_effect=get):
        traffic.near(42.3, -88.1, 25)
        # Another region at once: within the gap, not asked; nothing to give.
        with pytest.raises(traffic.TrafficUnavailable):
            traffic.near(45.0, -93.0, 25)
        clock.now += traffic.ADSBX_MIN_GAP_S
        # The month spent: not asked either.
        adsbx.write_text(json.dumps({"2026-10": traffic.ADSBX_MONTHLY}))
        with pytest.raises(traffic.TrafficUnavailable):
            traffic.near(45.0, -93.0, 25)
    assert sum("adsbexchange" in u for u in asked) == 1


def test_a_search_adsb_lol_cannot_take_now_is_asked_of_ads_b_exchange_at_once(adsbx, clock):
    adsb_lol._STATE["blocked_until"] = clock.now + 60
    # A region asked of it a moment ago: a search is not held to that gap.
    adsbx_part._ADSBX["last"] = clock.now
    get, asked = _routed({"adsbexchange-com1.p.rapidapi.com/v2/callsign/UAL2088": _answer([{**CESSNA, "flight": "UAL2088 "}])})
    with patch("requests.get", side_effect=get):
        (ual,) = traffic.find("UAL2088")
    assert ual["callsign"] == "UAL2088"
    assert asked == ["https://adsbexchange-com1.p.rapidapi.com/v2/callsign/UAL2088/"]


def test_without_a_key_ads_b_exchange_is_never_asked(clock, monkeypatch):
    monkeypatch.delenv("ADSBX_RAPIDAPI_KEY", raising=False)
    get_settings.cache_clear()
    get, asked = _routed({"api.adsb.lol": _turned_away()})
    with patch("requests.get", side_effect=get), pytest.raises(traffic.TrafficUnavailable):
        traffic.near(42.3, -88.1, 25)
    assert not any("adsbexchange" in u for u in asked)


def test_a_search_is_asked_of_ads_b_exchange_first_by_what_the_name_is_and_credited(adsbx, clock, monkeypatch):
    # The owner's ask: ADS-B Exchange for a search, so it is fast -- one
    # request, by the address an N-number has in the FAA's registry, by a
    # callsign for a flight number, by registration for another country's.
    monkeypatch.setattr(registry, "lookup", lambda **kw: {"mode_s_hex": "A128B9"} if kw.get("n_number") == "N174HA" else None)
    get, asked = _routed(
        {
            "adsbexchange-com1.p.rapidapi.com/v2/icao/a128b9": _answer([CESSNA]),
            "adsbexchange-com1.p.rapidapi.com/v2/callsign/UAL2088": _answer([{**CESSNA, "hex": "a0b7d8", "flight": "UAL2088 "}]),
            "adsbexchange-com1.p.rapidapi.com/v2/registration/G-ABCD": _answer([{**CESSNA, "hex": "400abc", "r": "G-ABCD"}]),
        }
    )
    with patch("requests.get", side_effect=get):
        found, credit = traffic.find_credited("N174HA")
        assert [a["hex"] for a in found] == ["a128b9"] and credit == traffic.ADSBX_SOURCE
        assert [a["hex"] for a in traffic.find("UAL2088")] == ["a0b7d8"]
        assert [a["hex"] for a in traffic.find("G-ABCD")] == ["400abc"]
    assert asked == [
        "https://adsbexchange-com1.p.rapidapi.com/v2/icao/a128b9/",
        "https://adsbexchange-com1.p.rapidapi.com/v2/callsign/UAL2088/",
        "https://adsbexchange-com1.p.rapidapi.com/v2/registration/G-ABCD/",
    ]
    assert json.loads(adsbx.read_text()) == {"2026-10": 3}


def test_an_address_ads_b_exchange_does_not_have_is_read_from_the_free_recent_trace(adsbx, clock):
    get, asked = _routed(
        {
            "adsbexchange-com1.p.rapidapi.com/v2/icao/a128b9": _answer([]),
            "adsb.lol/data/traces/b9/trace_recent_a128b9.json": _status(200, RECENT),
        }
    )
    with patch("requests.get", side_effect=get):
        found, credit = traffic.find_credited("a128b9")
    assert credit == traffic.ADSB_LOL_SOURCE
    assert [u.split("/")[2] for u in asked] == ["adsbexchange-com1.p.rapidapi.com", "adsb.lol"]
    assert [a["hex"] for a in found] == ["a128b9"]


def test_with_the_months_requests_spent_a_search_goes_to_adsb_lol_as_before(adsbx, clock):
    adsbx.write_text(json.dumps({"2026-10": traffic.ADSBX_MONTHLY}))
    get, asked = _routed({"api.adsb.lol/v2/callsign/UAL2088": _answer([{**CESSNA, "flight": "UAL2088 "}])})
    with patch("requests.get", side_effect=get):
        found, credit = traffic.find_credited("UAL2088")
    assert credit == traffic.ADSB_LOL_SOURCE and len(found) == 1
    assert not any("adsbexchange" in u for u in asked)


def test_the_months_count_follows_what_rapidapi_says_the_key_has_used(adsbx, clock):
    # The key spent elsewhere too: RapidAPI's own count, on each answer.
    answer = _answer([CESSNA])
    answer.headers = {"x-ratelimit-api-requests-limit": "10000", "x-ratelimit-api-requests-remaining": "950"}
    get, asked = _routed({"adsbexchange-com1.p.rapidapi.com/v2/callsign/UAL2088": answer})
    with patch("requests.get", side_effect=get):
        traffic.find("UAL2088")
    assert json.loads(adsbx.read_text()) == {"2026-10": 9050}
    # Past the month's own budget now: the next search goes to adsb.lol.
    assert not adsbx_part._adsbx_spend(search=True)
