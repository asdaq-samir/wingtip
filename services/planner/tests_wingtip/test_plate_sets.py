"""The plates a device keeps (wingtip.plate_sets): a flight's for Keep for
the Air, by the engine's diversion_range_nm and plates_kept (held to the
shared fixture apps/web/src/lib/fixtures/platesKept.json), and a state's
for Downloads, read from the d-TPP metafile's state_code elements."""

import json
from pathlib import Path

import pytest

from wingtip import plate_sets, publications
from wingtip.engine import ask as engine

FIXTURE = json.loads((Path(__file__).resolve().parents[3] / "apps/web/src/lib/fixtures/platesKept.json").read_text())

METAFILE = b"""<digital_tpp cycle="2611">
<state_code ID="CA" state_fullname="California">
 <city_name ID="MONTEREY"><airport_name ID="MONTEREY RGNL" apt_ident="MRY" icao_ident="KMRY"/></city_name>
 <city_name ID="SALINAS"><airport_name ID="SALINAS MUNI" apt_ident="SNS" icao_ident="KSNS"/></city_name>
</state_code>
<state_code ID="NV" state_fullname="Nevada">
 <city_name ID="RENO"><airport_name ID="RENO/TAHOE INTL" apt_ident="RNO" icao_ident="KRNO"/></city_name>
</state_code>
</digital_tpp>"""

#: Each field's charts as the d-TPP lists them, from the fixture.
CHARTS = {}
for _field in FIXTURE["flight"]["fields"]:
    CHARTS.setdefault(_field["ident"], _field["charts"])

#: KSFO to KMRY, straight.
PATH = [(37.619, -122.375), (36.587, -121.843)]


@pytest.mark.parametrize("case", FIXTURE["ranges"], ids=lambda c: c["why"])
def test_the_diversion_range_is_the_fixtures(case):
    answer = engine("diversion_range_nm", **case["input"])
    for key, want in case["expected"].items():
        if isinstance(want, (int, float)):
            assert answer[key] == pytest.approx(want), key
        else:
            assert answer[key] == want, key


def test_a_metafile_files_its_fields_under_their_state():
    assert publications._states_of(METAFILE) == {
        "CA": {"name": "California", "idents": ["MRY", "SNS"]},
        "NV": {"name": "Nevada", "idents": ["RNO"]},
    }


@pytest.fixture
def faa(monkeypatch):
    """KSFO to KMRY with KWVI beside the route, KSNS closed (not among the
    open fields, so in no set as a diversion), d-TPP cycle 2611."""

    def charts(ident, on=None, kept=True):
        return CHARTS.get(ident) or CHARTS.get("K" + ident, [])

    monkeypatch.setattr(publications, "terminal_charts", charts)
    monkeypatch.setattr(publications, "editions", lambda on=None: {"plates": {"state": "current", "edition": "2611"}})
    filed = {"CA": {"name": "California", "idents": ["MRY", "WVI", "SNS", "SFO"]}}
    monkeypatch.setattr(publications, "states", lambda on=None: ("2611", filed))
    opened = {"MRY": ("KMRY", 36.587, -121.843), "WVI": ("KWVI", 36.936, -121.789), "SFO": ("KSFO", 37.619, -122.375)}
    monkeypatch.setattr(plate_sets, "_open_fields", lambda: opened)
    monkeypatch.setattr(plate_sets, "_next_at", lambda: "2026-12-24T09:01:00Z")


def test_a_flight_keeps_its_own_fields_and_those_within_range(faa, monkeypatch):
    monkeypatch.setattr(plate_sets, "_picked_alternate", lambda *a: None)
    found = plate_sets.for_flight(["KSFO", "KMRY"], PATH, None, 0.0, 120.0, None, None)
    assert found["range_nm"] == pytest.approx(90.0)
    assert [(f["ident"], f["role"]) for f in found["fields"]] == [("KSFO", "departure"), ("KMRY", "destination"), ("KWVI", "diversion")]
    # A diversion keeps its approach, not its arrival.
    assert [c["kind"] for c in found["fields"][2]["charts"]] == ["IAP"]
    assert found["charts"] == 2 + 3 + 1
    assert found["bytes"] == found["charts"] * plate_sets.CHART_BYTES
    assert (found["cycle"], found["next_at"]) == ("2611", "2026-12-24T09:01:00Z")


def test_with_no_airplane_only_the_route_and_the_filed_alternate_are_kept(faa):
    found = plate_sets.for_flight(["KSFO", "KMRY"], PATH, "KSNS", 0.0, None, None, None)
    assert found["basis"] == "no_airplane" and found["range_nm"] is None
    assert [f["role"] for f in found["fields"]] == ["departure", "destination", "alternate"]
    assert found["alternate"] == "KSNS" and not found["alternate_picked"]


def test_the_engines_pick_stands_in_for_an_alternate_not_filed(faa, monkeypatch):
    monkeypatch.setattr(plate_sets.alternates, "nearby", lambda at, dest, eta_of, limit=5: [{"ident": "KSNS"}])
    found = plate_sets.for_flight(["KSFO", "KMRY"], PATH, None, 0.0, 120.0, None, None)
    assert found["alternate"] == "KSNS" and found["alternate_picked"]
    assert ("KSNS", "alternate") in [(f["ident"], f["role"]) for f in found["fields"]]


def test_a_state_set_lists_only_its_open_fields_with_plates(faa):
    listed = plate_sets.by_state()
    assert listed["cycle"] == "2611"
    # SNS is closed; MRY (3 charts), WVI (2) and SFO (2) are offered.
    assert listed["states"] == [{"id": "CA", "name": "California", "fields": 3, "charts": 7, "bytes": 7 * plate_sets.CHART_BYTES}]
    found = plate_sets.state_charts("2611", "ca")
    assert [f["ident"] for f in found["fields"]] == ["KMRY", "KWVI", "KSFO"]
    # Another cycle than the one served is not offered.
    assert plate_sets.state_charts("2610", "CA") is None
