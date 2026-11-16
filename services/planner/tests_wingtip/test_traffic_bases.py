"""Where an airplane is usually based (wingtip.traffic.bases), as the
engine's `usual_base` rules it, on the shared cases the engine is held to
(apps/web/src/lib/fixtures/usualBase.json, engine/facade/tests/usual_base.rs)."""

import json
from pathlib import Path

import pytest

from wingtip.traffic import bases

FIXTURE = Path(__file__).resolve().parents[3] / "apps/web/src/lib/fixtures/usualBase.json"


def _field(ident):
    return ident and {"ident": ident, "name": ident, "city": None, "region": None}


@pytest.mark.parametrize("case", json.loads(FIXTURE.read_text())["cases"], ids=lambda c: c["about"])
def test_an_airplane_is_based_where_most_of_its_flights_begin_and_end(case):
    flights = [{**f, "origin": _field(f["origin"]), "destination": _field(f["destination"])} for f in case["input"]["flights"]]
    judged = bases._base_of(flights)
    want = case["answer"]
    # The field as the flights name it, with the counts it was judged on.
    assert judged["field"] == _field(want["ident"])
    assert (judged["count"], judged["ends"]) == (want["most_ends"], want["ends"])
