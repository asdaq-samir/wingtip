"""The documents library's shelf and its files (wingtip.library,
wingtip.ecfr, wingtip.library_catalog): editions found, fetched once,
kept until a new one is in, and nothing asked of the outside here."""

from __future__ import annotations

import json
import re

import pytest
import requests

from wingtip import ecfr, library, library_catalog

TITLES = json.dumps(
    {
        "titles": [
            {"number": 14, "name": "Aeronautics and Space", "latest_issue_date": "2026-11-10", "reserved": False},
            {"number": 49, "name": "Transportation", "latest_issue_date": "2026-11-12", "reserved": False},
            {"number": 35, "name": "Reserved", "latest_issue_date": None, "reserved": True},
        ],
        "meta": {"date": "2026-11-19"},
    }
).encode()

# A part as the eCFR's versioner writes one: an SFAR (DIV9) before
# Subpart A, sections (DIV8) with their HEAD and paragraphs, inline
# italics and a cross-reference in the words.
PART_91 = b"""<?xml version="1.0"?>
<DIV5 N="91" TYPE="PART"><HEAD>PART 91 - GENERAL OPERATING AND FLIGHT RULES</HEAD>
<DIV9 N="SFAR 50-2" TYPE="APPENDIX"><HEAD>Special Federal Aviation Regulation No. 50-2</HEAD><P>Grand Canyon.</P></DIV9>
<DIV6 N="A" TYPE="SUBPART"><HEAD>Subpart A - General</HEAD>
<DIV8 N="91.1" TYPE="SECTION"><HEAD>&#167; 91.1 Applicability.</HEAD><P>(a) Except as provided in <I>paragraphs (b)</I> of this section,
 this part prescribes rules.</P><CITA TYPE="N">[Doc. No. 18334]</CITA></DIV8>
</DIV6>
<DIV6 N="B" TYPE="SUBPART"><HEAD>Subpart B - Flight Rules</HEAD>
<DIV8 N="91.155" TYPE="SECTION"><HEAD>&#167; 91.155 Basic VFR weather minimums.</HEAD>
<P>(a) Except as provided in paragraph (b).</P><P>(c) Ceiling.</P></DIV8>
</DIV6></DIV5>"""

BOOKS = "/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/phak"
PHAK_PAGE = f"""<html><body>
<a href="{BOOKS}/04_phak_ch2.pdf">Chapter 2</a>
<a href='{BOOKS}/faa-h-8083-25c_errata.pdf'>Errata</a>
<a href="{BOOKS}/faa-h-8083-25c.pdf">Full book</a>
</body></html>"""


class Answer:
    """A source's answer, as requests gives it."""

    def __init__(self, body: bytes, url: str = "", headers: dict | None = None):
        self.content, self.url, self.headers, self.status_code = body, url, headers or {}, 200

    @property
    def text(self) -> str:
        return self.content.decode()

    def raise_for_status(self) -> None:
        pass

    def iter_content(self, size: int):
        yield from (self.content[i : i + size] for i in range(0, len(self.content), size))

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


@pytest.fixture
def shelf_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(library, "LIBRARY_DIR", tmp_path)
    return tmp_path


def test_every_document_is_named_as_the_engines_citations_name_it():
    # cfr-<title>-<part>, aim and ac-<number>, as engine/crates/wording's
    # cite.rs names a cited document: a link from a rule opens what is here.
    for doc in library_catalog.SHELF:
        if doc.source == "ecfr":
            assert doc.id == f"cfr-{doc.title_number}-{doc.part}"
        elif doc.group == "Advisory Circulars":
            assert re.fullmatch(r"ac-\d{2,3}-\d{1,3}(\.\d+)?", doc.id), doc.id
    assert len(library_catalog.BY_ID) == len(library_catalog.SHELF)
    assert {"aim", "cfr-14-91", "cfr-14-61", "cfr-49-830", "phak", "afh", "ifh", "iph", "awh", "rmh"} <= set(library_catalog.BY_ID)


def test_a_title_s_issue_date_and_a_part_s_sections_in_order():
    assert ecfr.issue_dates(TITLES) == {"14": "2026-11-10", "49": "2026-11-12"}
    text = ecfr.part_text(PART_91)
    assert text["head"] == "PART 91 - GENERAL OPERATING AND FLIGHT RULES"
    heads = [g["head"] for g in text["groups"]]
    assert heads == ["Special Federal Aviation Regulation No. 50-2", "Subpart A - General", "Subpart B - Flight Rules"]
    first = text["groups"][1]["sections"][0]
    assert first == {
        "id": "91.1",
        "head": "§ 91.1 Applicability.",
        "paragraphs": ["(a) Except as provided in paragraphs (b) of this section, this part prescribes rules."],
    }
    assert text["groups"][2]["sections"][0]["paragraphs"] == ["(a) Except as provided in paragraph (b).", "(c) Ceiling."]
    with pytest.raises(ValueError):
        ecfr.part_text(b"<FMTR/>")


def test_the_whole_book_is_picked_over_its_chapters_and_errata():
    phak = library_catalog.BY_ID["phak"]
    url, edition = library.current_link(phak, PHAK_PAGE, phak.page)
    assert url == f"https://www.faa.gov{BOOKS}/faa-h-8083-25c.pdf"
    assert edition == "FAA-H-8083-25C"
    assert library.current_link(phak, "<a href='/other.pdf'>", phak.page) is None


def test_a_circulars_edition_is_its_letter():
    ac = library_catalog.BY_ID["ac-90-66"]
    page = '<a href="/documentLibrary/media/Advisory_Circular/AC_90-66C.pdf">AC 90-66C</a>'
    assert library.current_link(ac, page, ac.page)[1] == "AC 90-66C"
    # AC 90-66's pattern is not AC 90-660's.
    assert library.current_link(ac, '<a href="/AC_90-660A.pdf">', ac.page) is None


def _sources(calls: list, pdf: bytes = b"%PDF-1.7 book"):
    """The outside as the eCFR and the FAA answer, every ask recorded."""

    def get(url, **_):
        calls.append(url)
        if url == ecfr.TITLES:
            return Answer(TITLES)
        if "ecfr.gov" in url:
            return Answer(PART_91)
        if url.endswith(".pdf"):
            return Answer(pdf, url, {"Last-Modified": "Tue, 03 Nov 2026 14:00:00 GMT"})
        if "phak" in url:
            return Answer(PHAK_PAGE.encode(), url)
        raise requests.ConnectionError(f"not in the test: {url}")

    return get


def test_refresh_fetches_a_new_edition_once_and_keeps_it(shelf_dir, monkeypatch):
    calls: list = []
    monkeypatch.setattr(library.outside, "get", _sources(calls))
    refreshed = library.refresh()
    # The CFR parts and the PHAK, which the test's sources answer; every
    # other book fails to be had, and is skipped, not fatal.
    assert "cfr-14-91" in refreshed and "phak" in refreshed and "aim" not in refreshed
    shelf = {d["id"]: d for d in library.shelf()}
    assert shelf["phak"] == {
        "id": "phak",
        "title": "Pilot's Handbook of Aeronautical Knowledge",
        "group": "Handbooks",
        "kind": "pdf",
        "edition": "FAA-H-8083-25C",
        "label": "FAA-H-8083-25C",
        "date": "2026-11-03",
        "bytes": len(b"%PDF-1.7 book"),
    }
    assert shelf["cfr-49-830"]["edition"] == "2026-11-12"
    assert shelf["aim"]["edition"] is None
    assert library.file_of("phak", "FAA-H-8083-25C").read_bytes() == b"%PDF-1.7 book"
    assert library.file_of("phak", "FAA-H-8083-25B") is None
    assert library.file_of("nonesuch", "x") is None
    assert json.loads(library.file_of("cfr-14-91", "2026-11-10").read_text())["groups"][2]["sections"][0]["id"] == "91.155"
    # Again with nothing new: the pages and titles are looked at, no file fetched.
    calls.clear()
    assert library.refresh() == []
    assert not [c for c in calls if c.endswith(".pdf") or "/full/" in c]


def test_a_page_that_is_not_a_pdf_leaves_the_edition_kept(shelf_dir, monkeypatch):
    monkeypatch.setattr(library.outside, "get", _sources([]))
    library.refresh()
    kept = library.file_of("phak", "FAA-H-8083-25C")
    # The FAA moves the book; its new address answers an error page.
    monkeypatch.setattr(library.outside, "get", _sources([], pdf=b"<html>Not found</html>"))
    monkeypatch.setattr(library, "current_link", lambda doc, page, base: ("https://www.faa.gov/new/faa-h-8083-25d.pdf", "FAA-H-8083-25D"))
    library.refresh()
    assert library.file_of("phak", "FAA-H-8083-25C") == kept and kept.exists()
    assert not (shelf_dir / "phak" / "FAA-H-8083-25D.pdf").exists()
