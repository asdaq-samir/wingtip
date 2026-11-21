"""The documents library's files: each of the shelf's documents
(wingtip.library_catalog) in its current edition, fetched from the FAA
and the eCFR here and kept on the data volume, so a pilot's reader asks
the planner and never waits on the FAA (data in at the edges).

`refresh` looks at each document's source once a day (app.warm_up): the
eCFR's titles list for a part's issue date, the FAA's page for the link
to the book's current file. A new edition is downloaded whole, put in
place, written into the index and the old edition's file deleted; one that
cannot be had is left as it was, and the edition kept goes on being
served until a new one is in. Nothing is fetched under a pilot's request.

The index (`index.json`) is {document: {"edition", "label", "date",
"kind", "file", "bytes", "source"}}: `edition` names the file's version
in its address, so a browser and a CDN keep it for good; `date` is the
day the edition was issued (the eCFR's issue date) or the FAA's file was
last changed (its Last-Modified).
"""

from __future__ import annotations

import json
import logging
import re
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urljoin

import requests

from . import ecfr, outside
from .atomic import atomic_path
from .config import DATA_DIR
from .config import FAA_HEADERS as HEADERS
from .library_catalog import BY_ID, SHELF, Document

log = logging.getLogger(__name__)

LIBRARY_DIR = DATA_DIR / "raw" / "library"
_INDEX = "index.json"
#: A file's edition as it may be named on disk and in an address.
_SAFE = re.compile(r"[^A-Za-z0-9._-]+")


def _index() -> dict:
    try:
        return json.loads((LIBRARY_DIR / _INDEX).read_text())
    except (OSError, ValueError):
        return {}


def _save(index: dict) -> None:
    with atomic_path(LIBRARY_DIR / _INDEX) as partial:
        partial.write_text(json.dumps(index, indent=1, sort_keys=True))


def edition_slug(edition: str) -> str:
    """An edition as its file and its address name it."""
    return _SAFE.sub("_", edition).strip("_") or "edition"


def _kept(entry: dict | None) -> bool:
    return bool(entry) and (LIBRARY_DIR / entry["file"]).exists()


def _issued(response: requests.Response) -> str:
    """The day a file was last changed, by its Last-Modified; today
    where the server does not say."""
    try:
        return parsedate_to_datetime(response.headers["Last-Modified"]).date().isoformat()
    except (KeyError, TypeError, ValueError):
        return datetime.now(UTC).date().isoformat()


def _cfr(doc: Document, dates: dict[str, str], current: dict | None) -> dict | None:
    """A part's text in its title's latest issue, where it is newer than
    the one kept."""
    date = dates.get(doc.title_number)
    if not date or (_kept(current) and current["edition"] == date):
        return current
    url = ecfr.part_url(date, doc.title_number, doc.part)
    resp = outside.get(url, timeout=120)
    resp.raise_for_status()
    text = ecfr.part_text(resp.content)
    if not text["groups"]:
        raise ValueError(f"{doc.id}: no sections in the eCFR's answer")
    file = f"{doc.id}/{date}.json"
    body = json.dumps(text, separators=(",", ":"))
    with atomic_path(LIBRARY_DIR / file) as partial:
        partial.write_text(body)
    return {"edition": date, "label": "eCFR", "date": date, "kind": "text", "file": file, "bytes": len(body), "source": url}


def current_link(doc: Document, page: str, base: str) -> tuple[str, str] | None:
    """(the current file's address, its edition) from the FAA's page's
    HTML: of the links matching the document's pattern, the one with the
    shortest name (the whole book's "faa-h-8083-25c.pdf" before a part's
    "faa-h-8083-25c_ch1.pdf"). The edition is the designation with the
    letter the link names ("FAA-H-8083-25C"), else the file's own name."""
    pattern = re.compile(doc.link, re.IGNORECASE)
    found = []
    for href in re.findall(r"""href\s*=\s*["']([^"']+)["']""", page, re.IGNORECASE):
        match = pattern.search(href)
        if match:
            letter = (match.group(1) or "").upper() if match.groups() else ""
            name = Path(href.split("?")[0]).stem
            found.append((len(name), urljoin(base, href), f"{doc.designation}{letter}" if letter else name))
    if not found:
        return None
    _, url, edition = min(found, key=lambda f: f[0])
    return url, edition


def _label(doc: Document, edition: str) -> str:
    """The edition as a pilot reads it: the designation, or for the AIM
    its change ("Change 2"), by the file's name."""
    if doc.id == "aim":
        change = re.search(r"chg[_ -]?(\d)", edition, re.IGNORECASE)
        return f"Change {change.group(1)}" if change else "Basic"
    return edition if edition.startswith(doc.designation) else doc.designation


def _faa(doc: Document, current: dict | None) -> dict | None:
    """The FAA's current file for a document, where its page links one
    other than the one kept."""
    page = outside.get(doc.page, headers=HEADERS, timeout=60)
    page.raise_for_status()
    found = current_link(doc, page.text, page.url or doc.page)
    if found is None:
        raise ValueError(f"{doc.id}: no link on {doc.page} matches {doc.link}")
    url, edition = found
    if _kept(current) and current["source"] == url:
        return current
    file = f"{doc.id}/{edition_slug(edition)}.pdf"
    # A handbook is tens of megabytes: written as it comes, not held.
    with outside.get(url, headers=HEADERS, timeout=600, stream=True) as resp:
        resp.raise_for_status()
        with atomic_path(LIBRARY_DIR / file) as partial, partial.open("wb") as out:
            for i, chunk in enumerate(resp.iter_content(1 << 20)):
                # An error page answered with a 200 is not an edition.
                if i == 0 and not chunk.startswith(b"%PDF"):
                    raise ValueError(f"{doc.id}: {url} is not a PDF")
                out.write(chunk)
        issued = _issued(resp)
    return {
        "edition": edition_slug(edition),
        "label": _label(doc, edition),
        "date": issued,
        "kind": "pdf",
        "file": file,
        "bytes": (LIBRARY_DIR / file).stat().st_size,
        "source": url,
    }


def refresh() -> list[str]:
    """Each document fetched again where its source has a newer edition
    than the one kept; the ids refreshed. A document whose source cannot
    be had keeps the edition it has, for the next turn."""
    index = _index()
    refreshed = []
    dates: dict[str, str] | None = None
    for doc in SHELF:
        current = index.get(doc.id)
        try:
            if doc.source == "ecfr":
                if dates is None:
                    titles = outside.get(ecfr.TITLES, timeout=60)
                    titles.raise_for_status()
                    dates = ecfr.issue_dates(titles.content)
                entry = _cfr(doc, dates, current)
            else:
                entry = _faa(doc, current)
        except (requests.RequestException, OSError, ValueError, ET.ParseError) as err:
            log.warning("Library: %s not refreshed: %s", doc.id, err)
            continue
        if entry is None or entry == current:
            continue
        index[doc.id] = entry
        _save(index)
        refreshed.append(doc.id)
        if current and current.get("file") != entry["file"]:
            (LIBRARY_DIR / current["file"]).unlink(missing_ok=True)
    return refreshed


def shelf() -> list[dict]:
    """Every document on the shelf in its order, with the edition kept, or
    none yet (`edition` None) where it has never been had."""
    index = _index()
    out = []
    for doc in SHELF:
        entry = index.get(doc.id) if _kept(index.get(doc.id)) else None
        out.append(
            {
                "id": doc.id,
                "title": doc.title,
                "group": doc.group,
                "kind": "text" if doc.source == "ecfr" else "pdf",
                "edition": entry["edition"] if entry else None,
                "label": entry["label"] if entry else None,
                "date": entry["date"] if entry else None,
                "bytes": entry["bytes"] if entry else None,
            }
        )
    return out


def file_of(doc_id: str, edition: str) -> Path | None:
    """A document's kept file in that edition; None for a document not on
    the shelf, or an edition other than the one kept."""
    if doc_id not in BY_ID:
        return None
    entry = _index().get(doc_id)
    if not _kept(entry) or entry["edition"] != edition:
        return None
    return LIBRARY_DIR / entry["file"]
