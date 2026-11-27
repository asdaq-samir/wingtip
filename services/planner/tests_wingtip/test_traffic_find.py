"""wingtip.traffic: an airplane found by its callsign, registration or
address, from the regions' answers and from its recent trace, and the turn a
search takes between the map's requests."""

from unittest.mock import patch

import pytest

from wingtip import registry, traffic
from wingtip.traffic import adsb_lol

from .traffic_world import CESSNA, RECENT, _answer, _routed, _status, stand_in
from .traffic_world import adsbx_fixture, clock_fixture  # noqa: F401 -- the fixtures, by the names the runner gives them


def test_an_airplane_is_found_by_its_callsign_registration_or_address(clock):
    # The recent trace cannot be read here, so an address is asked of the API too.
    get, asked = _routed(
        {
            "/callsign/UAL2088": _answer([{**CESSNA, "flight": "UAL2088 ", "squawk": "3324"}]),
            "/reg/N174HA": _answer([CESSNA]),
            "/hex/a128b9": _answer([CESSNA]),
            "trace_recent_": _status(503),
        }
    )
    with patch("requests.get", side_effect=get):
        (ual,) = traffic.find("ual 2088")
        assert ual["callsign"] == "UAL2088" and ual["squawk"] == "3324" and ual["emergency"] is None
        clock.now += adsb_lol.MIN_GAP_S
        assert [a["hex"] for a in traffic.find("N174HA")] == ["a128b9"]
        clock.now += adsb_lol.MIN_GAP_S
        assert [a["hex"] for a in traffic.find("A128B9")] == ["a128b9"]
    assert [u.rsplit("/", 2)[-2:] for u in asked] == [
        ["callsign", "UAL2088"],
        ["reg", "N174HA"],
        ["b9", "trace_recent_a128b9.json"],
        ["hex", "a128b9"],
    ]


def test_an_airplane_named_by_its_address_or_n_number_is_found_from_its_recent_trace_without_the_api(clock, monkeypatch):
    """The owner's searches waited behind the map's requests to the API
    (2026-10-12): by address, or an N-number the registry gives one, the
    globe's recent trace answers instead, a static file that takes no turn."""
    stand_in(monkeypatch, "_wall", lambda: 1791800120.0)
    monkeypatch.setattr(registry, "lookup", lambda **kw: {"n_number": "N174HA", "mode_s_hex": "A128B9"})
    # Behind a refusal's back-off, where the API would not be asked at all.
    adsb_lol._LOL.hold(60, clock.now)
    get, asked = _routed({"trace_recent_a128b9": _status(200, RECENT)})
    with patch("requests.get", side_effect=get):
        (plane,) = traffic.find("N174HA")
        assert traffic.find("a128b9") == [plane]
    assert plane["hex"] == "a128b9" and plane["callsign"] == "N174HA" and plane["squawk"] == "1200"
    assert (plane["lat"], plane["lon"], plane["altitude_ft"], plane["speed_kt"]) == (42.30128, -88.14525, 1325, 93.7)
    assert plane["vertical_fpm"] == -384 and plane["seen_s"] == 4.0
    # The trace read once: the address's search found the N-number's answer kept.
    assert asked == ["https://adsb.lol/data/traces/b9/trace_recent_a128b9.json"]


@pytest.mark.parametrize(
    "answer",
    [
        _status(404),
        # On the ground at its last point.
        _status(200, {**RECENT, "trace": [[116.0, 42.3, -88.1, "ground", 3.0, 90.0, 0, 0, None, "adsb_icao", None]]}),
        # Last heard a minute ago: somewhere else by now.
        _status(200, {**RECENT, "timestamp": 1791800000.0 - 60}),
    ],
)
def test_an_airplane_whose_recent_trace_has_it_down_or_gone_is_not_in_the_air(clock, monkeypatch, answer):
    stand_in(monkeypatch, "_wall", lambda: 1791800120.0)
    get, asked = _routed({"trace_recent_a128b9": answer})
    with patch("requests.get", side_effect=get):
        assert traffic.find("A128B9") == []
    assert len(asked) == 1


def test_a_search_takes_its_turn_between_requests_and_one_further_off_is_not_waited_for(clock):
    get, asked = _routed({"/point/": _answer([]), "/callsign/": _answer([]), "/reg/": _answer([])})
    asked_at = []
    with patch("requests.get", side_effect=lambda url, **kw: (asked_at.append(clock.now), get(url))[1]):
        traffic.near(42.3, -88.1, 25)
        clock.now += adsb_lol.MIN_GAP_S - adsb_lol.SEARCH_WAIT_S / 2
        # A callsign with nothing, five seconds after the region; the same as a registration
        # five more on, further off than a search waits (it waited 10 s): unchecked, at once.
        with pytest.raises(traffic.TrafficUnavailable):
            traffic.find("FOO123")
    assert asked_at == [1000.0, 1005.0]


def test_an_airplane_heard_about_a_region_is_found_there_at_once(clock):
    with patch("requests.get", return_value=_answer([CESSNA])):
        traffic.near(42.3, -88.1, 25)
    clock.now += 20
    with patch("requests.get") as get:
        (by_reg,) = traffic.find("N174HA")
        (by_hex,) = traffic.find("a128b9")
        (by_callsign,) = traffic.find("n174ha")
    assert get.call_count == 0
    assert by_reg["hex"] == by_hex["hex"] == by_callsign["hex"] == "a128b9"
    # How old its position is, counted from now: the region's answer is 20 s old.
    assert by_reg["seen_s"] == 20.3


def test_a_search_goes_ahead_of_the_regions_turns(clock):
    get, asked = _routed({"/point/": _answer([]), "/callsign/": _answer([]), "/reg/": _answer([])})
    asked_at = []

    def timed(url, **kwargs):
        asked_at.append((clock.now, url.split("/v2/")[1].split("/")[0]))
        return get(url)

    with patch("requests.get", side_effect=timed):
        traffic.near(42.3, -88.1, 25)
        clock.now += adsb_lol.MIN_GAP_S - adsb_lol.SEARCH_WAIT_S / 2
        with pytest.raises(traffic.TrafficUnavailable):
            traffic.find("FOO123")
        # A region with nothing of its own takes the turn after the search's.
        traffic.near(45.0, -93.0, 25)
    assert asked_at == [(1000.0, "point"), (1005.0, "callsign"), (1010.0, "point")]


def test_a_search_adsb_lol_cannot_take_now_is_answered_from_the_faas_radar(clock, monkeypatch):
    from wingtip.traffic import lookup

    adsb_lol._LOL.hold(60, clock.now)
    monkeypatch.setattr(lookup, "_heard_elsewhere_now", lambda hex_id: {**CESSNA, "hex": hex_id} if hex_id == "a128b9" else None)
    with patch("requests.get", side_effect=lambda url, **kw: _status(503)):
        found, credit = traffic.find_credited("a128b9")
        assert [a["hex"] for a in found] == ["a128b9"] and credit == lookup.RADAR_SOURCE
        with pytest.raises(traffic.TrafficUnavailable):
            traffic.find("abcdef")


def test_a_region_whose_turn_a_search_took_gives_way(clock, monkeypatch):
    with patch("requests.get", return_value=_answer([CESSNA])):
        traffic.near(42.3, -88.1, 25)
    asked_at = []
    sleeps = []

    def sleep(seconds):
        # While the region waits for its turn, a search takes one a second after it.
        if not sleeps:
            adsb_lol._STATE["search_at"] = clock.now + seconds + 1
        sleeps.append(seconds)
        clock.sleep(seconds)

    stand_in(monkeypatch, "_sleep", sleep)
    with patch("requests.get", side_effect=lambda *a, **kw: (asked_at.append(clock.now), _answer([]))[1]):
        clock.now += 1
        # Another region, with no answer to give: it waits for a turn after the search's.
        traffic.near(45.0, -93.0, 25)
    assert asked_at == [1011.0]


def test_a_search_answer_is_given_again_for_a_few_seconds(clock):
    answer = _answer([{**CESSNA, "flight": "UAL2088 ", "r": "N14511", "hex": "a0b7d8"}])
    with patch("requests.get", return_value=answer) as get:
        assert [a["hex"] for a in traffic.find("UAL2088")] == ["a0b7d8"]
        clock.now += 10
        assert [a["hex"] for a in traffic.find("UAL2088")] == ["a0b7d8"]
        assert get.call_count == 1
        clock.now += traffic.FOUND_TTL_S
        traffic.find("UAL2088")
        assert get.call_count == 2


def test_a_search_whose_turn_is_more_than_a_gap_off_is_answered_at_once(clock):
    # Behind a back-off seven seconds long, where it slept those seven seconds in the request: the
    # route then answers with the FAA's record, unchecked (/api/traffic/find).
    adsb_lol._LOL.hold(7, clock.now)
    with patch("requests.get") as get, pytest.raises(traffic.TrafficUnavailable):
        traffic.find("FOO123")
    assert get.call_count == 0 and clock.now == 1000.0
