"""wingtip.approach_facts: what the CIFP says of an approach besides its legs,
read from KBUR's records of the 1 Oct 2026 cycle (services/planner/tests_wingtip/cifp):
its runway's threshold and TCH, the glide slope's altitude coded at its
final approach fix, and the levels of service it authorises."""

from pathlib import Path

import pytest

from wingtip import approach_facts, pattern, procedures

CIFP = Path(__file__).parent / "cifp" / "FAACIFP18"


@pytest.fixture(autouse=True)
def _cifp(monkeypatch):
    monkeypatch.setattr(procedures, "cifp_path", lambda on=None: CIFP)
    monkeypatch.setattr(pattern, "touchdown_zone_ft", lambda ident, end: 727.4 if (ident, end) == ("KBUR", "RW08") else None)


def test_an_ils_has_its_runway_and_the_glide_slope_at_its_faf():
    facts = approach_facts.approach_facts("KBUR", "I08-Z")
    # The runway record: threshold 727 ft, TCH 60 ft (ARINC 424-18 5.67, 5.68).
    assert facts["runway"] == {
        "ident": "RW08",
        "lat": pytest.approx(34.197911, abs=1e-6),
        "lon": pytest.approx(-118.369142, abs=1e-6),
        "threshold_ft": 727,
        "tch_ft": 60,
        "tdze_ft": 727.4,
    }
    # BUDDE, the FAF: "H", at or above 3,000, the glide slope at 2,753.
    assert {"fix": "BUDDE", "code": "H", "ft": 2753} in facts["coded"]
    assert facts["levels"] == []


def test_an_rnav_approach_says_which_levels_of_service_it_authorises():
    # KBUR's RNAV (GPS) Z RWY 08: LP and LNAV authorised, no LPV or
    # LNAV/VNAV -- no glidepath for its tags.
    assert approach_facts.approach_facts("KBUR", "R08-Z")["levels"] == ["LP", "LNAV"]
    # An RNP approach's continuation carries its RNP values, not levels.
    assert approach_facts.approach_facts("KBUR", "H08-Y")["levels"] == []


def test_no_such_approach_has_no_facts():
    assert approach_facts.approach_facts("KBUR", "Q99") is None
