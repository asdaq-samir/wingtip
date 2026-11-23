"""An FAA outage on the d-TPP's or the Chart Supplement's index: said as
one, and an earlier edition kept on disk shown, named by its edition, in
place of a card that read as a field with no plates (the data-cycles
audit's 13)."""

from datetime import date

import pytest
import requests
from cachetools import TTLCache

from wingtip import publication_drawing, publication_pages, publications

#: 3 Oct 2026: d-TPP cycle 2610 and the 03Sep2026 Chart Supplement in force.
ON = date(2026, 10, 3)

DLH = '{"DLH": [["IAP", "ILS OR LOC RWY 09", "00125IL9.PDF"], ["APD", "AIRPORT DIAGRAM", "00125AD.PDF"]]}'


@pytest.fixture
def faa_down(monkeypatch, tmp_path):
    """The FAA answering nothing, the asks counted; an empty cache."""
    monkeypatch.setattr(publications, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(publications, "_HELD", {})
    monkeypatch.setattr(publications, "_FAILED", TTLCache(maxsize=64, ttl=publications.RETRY_S))
    asked = []

    def down(url, **kw):
        asked.append(url)
        raise requests.ConnectionError("FAA down")

    monkeypatch.setattr(publications.outside, "get", down)
    return asked


def test_an_outage_with_nothing_kept_is_said_and_not_asked_again_at_once(faa_down):
    assert publications.terminal_charts("KDLH", ON) == []
    assert publications.chart_supplement_url("KDLH", ON) is None
    assert publications.editions(ON) == {
        "plates": {"state": "unavailable", "edition": None},
        "supplement": {"state": "unavailable", "edition": None},
    }
    # One ask of each index: the cards after it do not wait on the FAA again.
    assert sorted(faa_down) == [
        "https://aeronav.faa.gov/afd/03Sep2026/afd_03Sep2026.xml",
        "https://aeronav.faa.gov/d-tpp/2610/xml_data/d-tpp_Metafile.xml",
    ]


def test_an_index_that_failed_is_asked_again_once_the_wait_is_over(faa_down, monkeypatch):
    monkeypatch.setattr(publications, "_FAILED", TTLCache(maxsize=64, ttl=0))
    publications.terminal_charts("KDLH", ON)
    publications.terminal_charts("KDLH", ON)
    assert len(faa_down) == 2


def test_the_newest_earlier_edition_kept_is_shown_with_its_cycle(faa_down, tmp_path):
    (tmp_path / "dtpp-charts-2608.json").write_text('{"DLH": [["APD", "AIRPORT DIAGRAM", "OLD.PDF"]]}')
    (tmp_path / "dtpp-charts-2609.json").write_text(DLH)
    # A next cycle kept ahead is never shown in place of the one in force.
    (tmp_path / "dtpp-charts-2611.json").write_text('{"DLH": [["APD", "AIRPORT DIAGRAM", "NEXT.PDF"]]}')
    (tmp_path / "dcs-pages-09Jul2026.json").write_text('{"DLH": ["nc_161_09JUL2026.pdf"]}')

    assert publications.editions(ON) == {
        "plates": {"state": "kept", "edition": "2609"},
        "supplement": {"state": "kept", "edition": "09Jul2026"},
    }
    assert publications.terminal_charts("KDLH", ON) == [
        {"kind": "IAP", "name": "ILS OR LOC RWY 09", "url": "https://aeronav.faa.gov/d-tpp/2609/00125IL9.PDF"},
        {"kind": "APD", "name": "AIRPORT DIAGRAM", "url": "https://aeronav.faa.gov/d-tpp/2609/00125AD.PDF"},
    ]
    assert publications.airport_diagram_cycle("KDLH", ON) == "2609"
    assert publications.chart_supplement_url("KDLH", ON) == "https://aeronav.faa.gov/afd/09Jul2026/nc_161_09JUL2026.pdf"
    # A rule reads only the cycle in force: an alternate's approaches may since be gone.
    assert publications.terminal_charts("KDLH", ON, kept=False) == []


def test_the_kept_edition_is_read_only_while_it_stands_in(faa_down, tmp_path):
    (tmp_path / "dtpp-charts-2609.json").write_text(DLH)
    assert publications.serves("dtpp", "2609", ON)
    assert publications.serves("dtpp", "2610", ON)
    assert not publications.serves("dtpp", "2608", ON)
    assert not publications.serves("dtpp", "2611", ON)
    assert publications._source_of("https://aeronav.faa.gov/d-tpp/2609/00125IL9.PDF", ON) == ("dtpp", "2609", "00125IL9.PDF")
    assert publication_pages.chart_page_png("dtpp", "2608", "X.PDF", 1, ON) is None

    # Once the FAA gives the cycle in force, the kept one is no longer read.
    (tmp_path / "dtpp-charts-2610.json").write_text(DLH)
    assert not publications.serves("dtpp", "2609", ON)
    assert publications.editions(ON)["plates"] == {"state": "current", "edition": "2610"}


def test_the_kept_diagram_is_drawn_under_its_own_cycle(faa_down, tmp_path, monkeypatch):
    (tmp_path / "dtpp-charts-2609.json").write_text(DLH)
    # Not asked by the cycle in force while a kept one stands in: its links name 2609.
    assert publication_drawing.airport_diagram_png("KDLH", "2610", ON) is None
    pdfs = []
    monkeypatch.setattr(publication_drawing, "_drawn", lambda pdf: b"png")

    class Answer:
        content = b"%PDF"

        def raise_for_status(self):
            pass

    monkeypatch.setattr(publication_drawing.outside, "get", lambda url, **kw: pdfs.append(url) or Answer())
    path = publication_drawing.airport_diagram_png("KDLH", "2609", ON)
    assert path == tmp_path / "diagrams" / "2609" / "00125AD.png"
    assert pdfs == ["https://aeronav.faa.gov/d-tpp/2609/00125AD.PDF"]
