"""wingtip.apra: the FAA's Aeronautical Product Release API read from
its answers as recorded on 2026-11-12 (fixtures/apra), never the live
API; and the cycle arithmetic where it does not answer."""

import json
from datetime import date
from pathlib import Path

import pytest
import requests

from cachetools import TTLCache

from wingtip import apra, charts

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

    monkeypatch.setattr(apra.requests, "get", get)
    return asked


def test_the_nasr_edition_is_apras_and_its_tables_are_beside_it(monkeypatch):
    _answers(monkeypatch, {("nfdc/nasr/info", "current"): "nasr_info_current.json"})

    cycle = apra.nasr_cycle()

    assert cycle == date(2026, 10, 29)
    # The links the FAA's NASR page gave for the same edition (2026-10-29,
    # data/raw/faa_nasr/editions.json).
    assert apra.nasr_csv_url("APT", cycle) == "https://nfdc.faa.gov/webContent/28DaySub/extra/29_Oct_2026_APT_CSV.zip"
    assert apra.nasr_csv_url("NAV", date(2026, 5, 7)) == "https://nfdc.faa.gov/webContent/28DaySub/extra/07_May_2026_NAV_CSV.zip"
    assert apra.class_airspace_url(cycle) == "https://nfdc.faa.gov/webContent/28DaySub/2026-10-29/class_airspace_shape_files.zip"


def test_no_answer_is_the_airac_arithmetic(monkeypatch):
    _answers(monkeypatch, {})
    monkeypatch.setattr(apra.data_cycles, "in_force_day", lambda: date(2026, 11, 12))
    monkeypatch.setattr(apra.data_cycles, "start_on", lambda kind, on: {"airac": date(2026, 10, 29)}[kind])

    assert apra.nasr_cycle() == date(2026, 10, 29)


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


def test_the_sectional_cycle_is_apras_once_it_has_begun(monkeypatch):
    _answers(monkeypatch, {("vfr/sectional/info", "current"): "sectional_info_current.json"})

    assert apra.sectional_cycle(date(2026, 11, 12)) == date(2026, 10, 29)
    # An edition APRA calls current before its own date is not drawn yet.
    assert apra.sectional_cycle(date(2026, 10, 28)) is None


def test_the_sectional_cycle_with_apra_down_is_none(monkeypatch):
    _answers(monkeypatch, {})
    assert apra.sectional_cycle(date(2026, 11, 12)) is None


def test_the_current_cycle_is_apras_and_the_arithmetic_without_it(monkeypatch):
    """APRA's sectional edition where it has begun (wingtip.apra), held
    six hours; the anchor's where APRA cannot say."""
    asked = []
    monkeypatch.setattr(charts, "_cycle_cache", TTLCache(maxsize=1, ttl=60))
    monkeypatch.setattr(charts.apra, "sectional_cycle", lambda today: asked.append(today) or date(2026, 10, 29))
    assert charts.current_cycle(date(2026, 11, 12)) == "10-29-2026"
    assert charts.current_cycle(date(2026, 11, 12)) == "10-29-2026" and len(asked) == 1

    monkeypatch.setattr(charts, "_cycle_cache", TTLCache(maxsize=1, ttl=60))
    monkeypatch.setattr(charts.apra, "sectional_cycle", lambda today: None)
    assert charts.current_cycle(date(2026, 9, 20)) == "09-03-2026"
