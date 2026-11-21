"""wingtip.apra: the FAA's Aeronautical Product Release API read from
its answers as recorded on 2026-11-12 (fixtures/apra), never the live
API; and the cycle in force is the engine's arithmetic, to the minute, APRA
only a cross-check."""

import json
from datetime import date, datetime, timezone
from pathlib import Path

import pytest
import requests

from cachetools import TTLCache

from wingtip import apra, chart_cycle

RECORDED = Path(__file__).parent / "fixtures" / "apra"


def _answers(monkeypatch, by_product: dict) -> list:
    """APRA answering each product and edition from a recorded file
    (None: the connection fails); the requests asked, in order."""
    asked = []

    class Answer:
        def __init__(self, body):
            self.body = body

        def raise_for_status(self):
            pass

        def json(self):
            return self.body

    def get(url, params=None, headers=None, timeout=None):
        product = url.removeprefix(apra.APRA_URL + "/")
        asked.append((product, params))
        name = by_product.get((product, params["edition"]))
        if name is None:
            raise requests.ConnectionError("APRA did not answer")
        return Answer(json.loads((RECORDED / name).read_text()))

    monkeypatch.setattr(apra.outside, "get", get)
    return asked


def _clock(monkeypatch, when: str):
    monkeypatch.setattr(apra.data_cycles, "now", lambda: datetime.fromisoformat(when).replace(tzinfo=timezone.utc))


def test_the_nasr_edition_is_the_cycle_in_force_and_its_tables_are_beside_it(monkeypatch):
    _answers(monkeypatch, {("nfdc/nasr/info", "current"): "nasr_info_current.json"})
    _clock(monkeypatch, "2026-11-12T12:00")

    cycle = apra.nasr_cycle()

    assert cycle == date(2026, 10, 29)
    # The links the FAA's NASR page gave for the same edition (2026-10-29,
    # data/raw/faa_nasr/editions.json).
    assert apra.nasr_csv_url("APT", cycle) == "https://nfdc.faa.gov/webContent/28DaySub/extra/29_Oct_2026_APT_CSV.zip"
    assert apra.nasr_csv_url("NAV", date(2026, 5, 7)) == "https://nfdc.faa.gov/webContent/28DaySub/extra/07_May_2026_NAV_CSV.zip"
    assert apra.class_airspace_url(cycle) == "https://nfdc.faa.gov/webContent/28DaySub/2026-10-29/class_airspace_shape_files.zip"


def test_no_answer_is_the_airac_arithmetic(monkeypatch):
    _answers(monkeypatch, {})
    _clock(monkeypatch, "2026-11-12T12:00")
    assert apra.nasr_cycle() == date(2026, 10, 29)


@pytest.mark.parametrize(
    ("when", "cycle"),
    [("2026-11-26T09:00", date(2026, 10, 29)), ("2026-11-26T09:01", date(2026, 11, 26)), ("2026-11-26T09:02", date(2026, 11, 26))],
)
def test_apra_naming_an_edition_early_or_late_is_not_followed(monkeypatch, caplog, when, cycle):
    """APRA's recorded "current" is 29 Oct 2026: before 0901Z on 26 Nov it
    agrees; from 0901Z the cycle in force is 26 Nov's whatever APRA says,
    and the difference is logged for the owner."""
    _answers(monkeypatch, {("nfdc/nasr/info", "current"): "nasr_info_current.json"})
    _clock(monkeypatch, when)
    assert apra.nasr_cycle() == cycle
    assert ("APRA names NASR edition" in caplog.text) == (cycle != date(2026, 10, 29))


def test_an_edition_apra_has_not_got_is_its_own_status_not_a_link(monkeypatch):
    """APRA answers HTTP 200 with a 404 in the body (the Chart Supplement,
    asked for every volume on 2026-11-12)."""
    _answers(monkeypatch, {("supplement/chart", "current"): "supplement_chart_current.json"})

    with pytest.raises(apra.ApraError, match="has not been released"):
        apra.editions("supplement/chart", volume="NorthCentral")


def test_the_cifp_is_the_current_or_the_next_cycles_link(monkeypatch):
    asked = _answers(monkeypatch, {("cifp/chart", "current"): "cifp_chart_current.json", ("cifp/chart", "next"): "cifp_chart_next.json"})

    assert apra.cifp_url(date(2026, 10, 29)) == "https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_261029.zip"
    assert apra.cifp_url(date(2026, 11, 26)) == "https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_261126.zip"
    # A cycle APRA has neither as current nor next: the caller's own link.
    assert apra.cifp_url(date(2026, 10, 1)) is None
    assert [p["edition"] for _, p in asked] == ["current", "current", "next", "current", "next"]


def test_the_cifp_with_apra_down_is_left_to_the_caller(monkeypatch):
    _answers(monkeypatch, {})
    assert apra.cifp_url(date(2026, 10, 29)) is None


def test_the_sectional_cycle_is_apras_current(monkeypatch):
    _answers(monkeypatch, {("vfr/sectional/info", "current"): "sectional_info_current.json"})
    assert apra.sectional_cycle() == date(2026, 10, 29)


def test_the_sectional_cycle_with_apra_down_is_none(monkeypatch):
    _answers(monkeypatch, {})
    assert apra.sectional_cycle() is None


@pytest.mark.parametrize(
    ("when", "cycle"), [("2026-12-24T09:00", "10-29-2026"), ("2026-12-24T09:01", "12-24-2026"), ("2026-12-24T09:02", "12-24-2026")]
)
def test_the_current_cycle_is_the_schedules_to_the_minute(monkeypatch, caplog, when, cycle):
    """The schedule's cycle at the minute, APRA only a cross-check: APRA
    answering 29 Oct 2026 the morning the 24 Dec edition takes over is
    logged, and held six hours does not keep the old cycle past 0901Z."""
    asked = []
    monkeypatch.setattr(chart_cycle, "_cycle_cache", TTLCache(maxsize=1, ttl=60))
    monkeypatch.setattr(chart_cycle.apra, "sectional_cycle", lambda: asked.append(1) or date(2026, 10, 29))
    _clock(monkeypatch, when)
    assert chart_cycle.current_cycle() == cycle
    assert chart_cycle.current_cycle() == cycle and len(asked) == 1
    assert ("APRA names the sectionals" in caplog.text) == (cycle != "10-29-2026")

    monkeypatch.setattr(chart_cycle, "_cycle_cache", TTLCache(maxsize=1, ttl=60))
    monkeypatch.setattr(chart_cycle.apra, "sectional_cycle", lambda: None)
    assert chart_cycle.current_cycle() == cycle
