"""wingtip.traffic.ladd: the FAA's LADD list left out of the radar SWIM
gives, as the SWIM Cloud Distribution Service's terms ask of anyone who
shows its data to the public, and no radar shown while no current list is
kept."""

import os
import time
from pathlib import Path

from wingtip import registry
from wingtip.config import Settings, get_settings
from wingtip.traffic import ladd

ROOT = Path(__file__).resolve().parents[3]
PLANE = {"hex": "a6ed61", "callsign": "N529CF", "registration": "N529CF", "lat": 41.98, "lon": -87.9}


def keep_list(tmp_path, text: str, age_s: float = 0.0):
    path = tmp_path / "IndustryLADD.csv"
    path.write_text(text)
    then = time.time() - age_s
    os.utime(path, (then, then))
    return path


def test_a_list_is_each_lines_first_field_and_not_its_header(tmp_path):
    path = keep_list(tmp_path, 'ACID,TYPE\nN529CF,C172\n"EJA123",GLF5\nn-12ab\tPA28\n\nREMARKS only words\n')
    assert ladd.read(path) == frozenset({"N529CF", "EJA123", "N12AB"})


def test_a_listed_aircraft_is_hidden_by_its_call_sign_registration_or_address(tmp_path, monkeypatch):
    keep_list(tmp_path, "N529CF\nEJA123\nN3429J\n")
    assert ladd.hidden(PLANE, tmp_path)
    assert ladd.hidden({**PLANE, "registration": None, "callsign": "EJA123"}, tmp_path)
    # A track with no flight plan named, found by its Mode S address's N-number.
    monkeypatch.setattr(registry, "lookup", lambda hex_id=None, n_number=None: {"n_number": "N3429J"} if hex_id == "a3c858" else None)
    assert ladd.hidden({"hex": "a3c858", "callsign": None, "registration": None}, tmp_path)
    assert not ladd.hidden({"hex": "abcdef", "callsign": "UAL1", "registration": None}, tmp_path)


def test_with_no_current_list_the_radar_is_shown_to_no_one_unless_the_stack_is_not_public(tmp_path, monkeypatch):
    other = {"hex": "abcdef", "callsign": "UAL1", "registration": None}
    monkeypatch.setenv("LADD_REQUIRED", "1")
    get_settings.cache_clear()
    try:
        # None kept.
        assert ladd.current(tmp_path) is None and ladd.hidden(other, tmp_path)
        # One older than a month and a week has been replaced: not current.
        keep_list(tmp_path, "N529CF\n", age_s=ladd.MAX_AGE_S + 60)
        assert ladd.current(tmp_path) is None and ladd.hidden(other, tmp_path)
        monkeypatch.setenv("LADD_REQUIRED", "0")
        get_settings.cache_clear()
        assert not ladd.hidden(other, tmp_path)
    finally:
        monkeypatch.delenv("LADD_REQUIRED")
        get_settings.cache_clear()


def test_production_keeps_the_list_required():
    # The default is the public's; only the owner's own stack turns it off.
    assert Settings.model_fields["ladd_required"].default is True
    assert "LADD_REQUIRED" not in (ROOT / "infra/docker-compose.prod.yml").read_text()
