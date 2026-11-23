"""The documents library's routes (app.routers.library): the shelf, a
PDF by its edition with its ranges, a CFR part's text, and a 404 for an
edition not kept."""

import json

import pytest
from fastapi.testclient import TestClient
from wingtip import library

from app.main import app

client = TestClient(app)


@pytest.fixture
def kept(tmp_path, monkeypatch):
    """The PHAK and Part 91 kept, as wingtip.library's refresh leaves them."""
    monkeypatch.setattr(library, "LIBRARY_DIR", tmp_path)
    (tmp_path / "phak").mkdir()
    (tmp_path / "phak" / "FAA-H-8083-25C.pdf").write_bytes(b"%PDF-1.7 " + b"x" * 100)
    (tmp_path / "cfr-14-91").mkdir()
    section = {"id": "91.155", "head": "§ 91.155", "paragraphs": ["(a) ..."]}
    text = {"head": "PART 91", "groups": [{"head": "Subpart B", "sections": [section]}]}
    (tmp_path / "cfr-14-91" / "2026-11-10.json").write_text(json.dumps(text))
    phak = {"edition": "FAA-H-8083-25C", "label": "FAA-H-8083-25C", "date": "2026-11-03", "kind": "pdf", "file": "phak/FAA-H-8083-25C.pdf"}
    part = {"edition": "2026-11-10", "label": "eCFR", "date": "2026-11-10", "kind": "text", "file": "cfr-14-91/2026-11-10.json"}
    index = {"phak": {**phak, "bytes": 109, "source": "x"}, "cfr-14-91": {**part, "bytes": 1, "source": "y"}}
    (tmp_path / "index.json").write_text(json.dumps(index))


def test_the_shelf_lists_every_document_with_its_edition_or_none(kept):
    answer = client.get("/api/library")
    assert answer.status_code == 200
    docs = {d["id"]: d for d in answer.json()["documents"]}
    assert docs["phak"]["edition"] == "FAA-H-8083-25C" and docs["phak"]["kind"] == "pdf"
    assert docs["cfr-14-91"]["kind"] == "text"
    assert docs["aim"]["edition"] is None


def test_a_pdf_by_its_edition_in_ranges_and_kept_for_good(kept):
    whole = client.get("/api/library/phak/FAA-H-8083-25C.pdf")
    assert whole.status_code == 200 and whole.headers["content-type"] == "application/pdf"
    assert "immutable" in whole.headers["cache-control"]
    part = client.get("/api/library/phak/FAA-H-8083-25C.pdf", headers={"Range": "bytes=0-3"})
    assert part.status_code == 206 and part.content == b"%PDF"
    assert client.get("/api/library/phak/FAA-H-8083-25B.pdf").status_code == 404
    # A text document is not a PDF, nor a PDF a text.
    assert client.get("/api/library/cfr-14-91/2026-11-10.pdf").status_code == 404
    assert client.get("/api/library/phak/FAA-H-8083-25C/text").status_code == 404


def test_a_cfr_parts_text(kept):
    answer = client.get("/api/library/cfr-14-91/2026-11-10/text")
    assert answer.status_code == 200
    assert answer.json()["groups"][0]["sections"][0]["id"] == "91.155"
