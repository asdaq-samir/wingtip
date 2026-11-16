"""wingtip.traffic's search for one airplane: when adsb.lol's paced API is
asked, and when an answer already in hand settles it. The live sources are
stubbed as test_traffic stubs them; its clock and ADS-B Exchange fixtures
are shared."""

from unittest.mock import patch

import pytest
from wingtip import registry, traffic

from .test_traffic import CESSNA, _answer, _routed, _status, adsbx, clock  # noqa: F401 (the fixtures, by name)

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
