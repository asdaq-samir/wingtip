"""A chart's pages for the app: a chart of its own is all of its pages, a
booklet (a Chart Supplement's) the pages for one field, each drawn once as
a picture. The PDFs themselves are wingtip.publications'; the drawing of a
page is wingtip.publication_drawing's."""

from __future__ import annotations

import logging
import re
from datetime import date
from pathlib import Path

import pypdfium2

from .atomic import atomic_path
from .single_flight import once, one_at_a_time
from . import publications
from .publication_drawing import DIAGRAM_SCALE, _PDFIUM, _drawn
from .publications import _PDF_NAME, _faa_idents, _source_of, _supplement_pages, dcs_edition, dtpp_cycle, serves

log = logging.getLogger(__name__)


def _is_booklet(source: str, name: str) -> bool:
    """Whether a d-TPP PDF is one of the FAA's region booklets (takeoff
    and alternate minimums, hot spots), which hold many fields' entries.
    A field's own charts -- approaches, departures, the diagram -- are
    named from its five-figure sequence number ("00245IL18.PDF"); a
    booklet's name starts with its region ("EC3TO.PDF")."""
    return source == "dtpp" and not re.match(r"\d{5}", name)


@once(maxsize=64)
def _read(source: str, edition: str, pdf: str) -> tuple | None:
    """Each page of one PDF as (width, height, text) -- its size in pixels,
    drawn DIAGRAM_SCALE times its points, and a booklet's page text (None
    for any other PDF's) -- read once per (edition, PDF), since reading
    the text of a booklet's sixty-nine pages is long and holds the drawing
    lock. Once per PDF, not per field: kept per field asked, a caller
    naming a new made-up field each time read the whole booklet again
    under the lock every time, holding up every diagram and chart page
    anyone else asked for meanwhile (the security review of 2026-11-21).
    None where the FAA has no such file."""
    data = publications._pdf_of(source, edition, pdf)
    if data is None:
        return None
    booklet = _is_booklet(source, pdf)
    with _PDFIUM:
        document = pypdfium2.PdfDocument(data)
        try:
            pages = []
            for i in range(len(document)):
                page = document[i]
                text = page.get_textpage().get_text_bounded() if booklet else None
                pages.append((round(page.get_width() * DIAGRAM_SCALE), round(page.get_height() * DIAGRAM_SCALE), text))
            return tuple(pages)
        finally:
            document.close()


def _pages_of(source: str, edition: str, pdf: str, ident: str | None) -> tuple | None:
    """The pages of one PDF to show, as their sizes -- a booklet's pages
    naming the field (none where it has no entry: the FAA lists takeoff
    minimums, alternates and hot spots only for fields that need them),
    any other PDF's every page. None where the FAA has no such file."""
    read = _read(source, edition, pdf)
    if read is None:
        return None
    booklet = _is_booklet(source, pdf)
    needle = f"({_faa_idents(ident)[-1]})" if booklet and ident else None
    return tuple(
        {"source": source, "edition": edition, "pdf": pdf, "page": i + 1, "width": width, "height": height}
        for i, (width, height, text) in enumerate(read)
        if not booklet or (needle is not None and needle in text)
    )


def chart_pages(url: str, ident: str | None = None, on: date | None = None) -> list | None:
    """The pages of an FAA chart to show in the app, for its in-app view
    (`chart_page_png`): {"source", "edition", "pdf", "page" (from 1),
    "width", "height" (in pixels, drawn DIAGRAM_SCALE times its points)}.
    Every page of a chart of its own (an approach, a departure); of one of
    the FAA's booklets -- a region's takeoff minimums, sixty-nine pages,
    or its hot spots -- only the pages that name the field ("(MSN)", as
    the FAA heads each field's entry), and none where none does; and of
    a Chart Supplement entry, each of its pages. None for an address that
    is not one of the FAA's charts in force; FaaUnreachable where the FAA
    cannot be reached."""
    found = _source_of(url, on)
    if not found:
        return None
    source, edition, name = found
    names = [name]
    if source == "dcs" and ident:
        entry = _supplement_pages(ident, edition)
        if name in entry:
            names = entry[entry.index(name) :]
    pages = []
    for pdf in names:
        some = _pages_of(source, edition, pdf, ident)
        if some is None:
            return None
        pages.extend(dict(p) for p in some)
    return pages


@once(maxsize=256)
def _page_count(source: str, edition: str, name: str) -> int:
    """How many pages a PDF `_pdf_of` has kept has, read once per edition."""
    with _PDFIUM:
        document = pypdfium2.PdfDocument(publications._pdf_of(source, edition, name))
        try:
            return len(document)
        finally:
            document.close()


def chart_pdf(source: str, edition: str, name: str, on: date | None = None) -> bytes | None:
    """One of the FAA's charts in force as the FAA's own PDF, for an app
    that reads the page's text itself (the web's own-ship airport diagram:
    its latitude and longitude labels and hot spots, as the phones read
    them with PDFKit and PdfRenderer); the browser cannot fetch it from
    aeronav.faa.gov, which sends no CORS headers. None for a chart not in
    force or not the FAA's; FaaUnreachable while the FAA cannot be reached."""
    current = {"dtpp": dtpp_cycle(on), "dcs": dcs_edition(on)}
    if current.get(source) != edition or not _PDF_NAME.fullmatch(name):
        return None
    return publications._pdf_of(source, edition, name)


def chart_page_png(source: str, edition: str, name: str, page: int, on: date | None = None) -> Path | None:
    """One page of one of the FAA's charts in force as a picture on disk,
    drawn the first time it is asked for and kept for its edition, as the
    airport diagram is (`airport_diagram_png`); None for a chart not in
    force or not the FAA's, or a page it does not have; FaaUnreachable
    while the FAA cannot be reached."""
    if not serves(source, edition, on) or not _PDF_NAME.fullmatch(name) or page < 1:
        return None
    path = publications.CACHE_DIR / "pages" / source / edition / f"{Path(name).stem}-{page}.png"
    if path.exists():
        return path
    data = publications._pdf_of(source, edition, name)
    if data is None or page > _page_count(source, edition, name):  # no lock or draw for a page past the last
        return None
    with one_at_a_time(path):
        if path.exists():
            return path
        try:
            png = _drawn(data, page - 1)
        except (pypdfium2.PdfiumError, IndexError) as err:
            log.warning("No page %s of %s %s in %s: %s", page, source, name, edition, err)
            return None
        with atomic_path(path) as partial:
            partial.write_bytes(png)
    return path
