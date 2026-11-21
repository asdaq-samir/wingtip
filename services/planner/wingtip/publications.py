"""The FAA's own pages for an airport: its airport diagram (from the
digital Terminal Procedures, d-TPP) and its page of the Chart Supplement
(d-CS), as links to the PDFs on aeronav.faa.gov.

Each publication has an index of its own: the d-TPP's metafile (16 MB of
XML, every procedure at every airport) and the d-CS's airport list. They
are read once per edition and kept small on disk -- the diagram's PDF and
the supplement's page for each airport, by its FAA identifier -- so a card
asks nothing of the FAA.

The d-TPP is on the 28-day AIRAC cycle, named by the year and the cycle's
number in it ("2610", from 1 Oct 2026); the Chart Supplement on the
56-day cycle the sectionals are, named by its date ("03Sep2026").

The airport diagram is drawn as a picture too (publication_drawing's
`airport_diagram_png`), for the card to show it in the app rather than send
the pilot to a PDF: the cycle's PDF read once and rendered once, kept on
disk for the cycle. A chart's pages are publication_pages'.
"""

from __future__ import annotations

import json
import logging
import re
import threading
import xml.etree.ElementTree as ET
from datetime import date, datetime

import requests

from . import data_cycles, outside
from .atomic import atomic_path
from .config import DATA_DIR
from .config import FAA_HEADERS as HEADERS
from .single_flight import one_at_a_time


log = logging.getLogger(__name__)

DTPP_BASE = "https://aeronav.faa.gov/d-tpp"
DCS_BASE = "https://aeronav.faa.gov/afd"
CACHE_DIR = DATA_DIR / "raw" / "publications"


_LOCK = threading.Lock()
_HELD: dict = {}


def dtpp_cycle(on: date | datetime | None = None) -> str:
    """The d-TPP cycle in force at `on` (now, to the minute: the new cycle
    counts from 0901Z on its date): "2610", the AIRAC cycle's number the
    engine gives (`data_cycle`)."""
    return data_cycles.cycle("airac", None, on)["current_ident"]


def dcs_edition(on: date | datetime | None = None) -> str:
    """The Chart Supplement edition in force at `on` (now, from 0901Z on
    its date): "03Sep2026", on the 56-day charting cycle."""
    return data_cycles.start_on("chart", on).strftime("%d%b%Y")


def _charts_of(xml_bytes: bytes) -> dict:
    """{FAA ident and ICAO ident: the field's charts, each [chart code,
    chart name, PDF], in the metafile's order} from a d-TPP metafile --
    the airport diagram (APD) among them, and its hot spots (HOT), land
    and hold short (LAH), approaches (IAP), departures (DP, ODP),
    arrivals (STR) and takeoff and alternate minimums (MIN)."""
    found = {}
    for airport in ET.fromstring(xml_bytes).iter("airport_name"):
        charts = [
            [record.findtext("chart_code") or "", record.findtext("chart_name") or "", record.findtext("pdf_name")]
            for record in airport.iter("record")
            if record.findtext("pdf_name")
        ]
        for ident in (airport.get("apt_ident"), airport.get("icao_ident")):
            if ident and charts:
                found[ident.upper()] = charts
    return found


def _supplements_of(xml_bytes: bytes) -> dict:
    """{FAA ident: its Chart Supplement pages' PDFs, in order} from a d-CS
    airport list: an entry may run on to a second page."""
    found = {}
    for airport in ET.fromstring(xml_bytes).iter("airport"):
        ident = airport.findtext("aptid")
        pdfs = [pdf.text.strip() for pdf in airport.iterfind("pages/pdf") if pdf.text and pdf.text.strip()]
        if ident and pdfs:
            found.setdefault(ident.upper(), pdfs)
    return found


def _index(name: str, edition: str, url: str, parse) -> dict:
    """An index for one edition, from memory, from disk, or downloaded
    and parsed once; empty when the FAA cannot be reached (no links on a
    card, nothing failed)."""
    key = (name, edition)
    with _LOCK:
        if key in _HELD:
            return _HELD[key]
        path = CACHE_DIR / f"{name}-{edition}.json"
        if path.exists():
            index = json.loads(path.read_text())
        else:
            try:
                resp = outside.get(url, headers=HEADERS, timeout=120)
                resp.raise_for_status()
                index = parse(resp.content)
            except (requests.RequestException, ET.ParseError) as err:
                log.warning("No %s index for %s: %s", name, edition, err)
                return {}
            with atomic_path(path) as partial:
                partial.write_text(json.dumps(index))
        _HELD[key] = index
        return index


def _faa_idents(ident: str) -> list:
    ident = ident.strip().upper()
    return [ident, ident[1:]] if len(ident) == 4 and ident[0] in "KP" else [ident]


def _charts_for(ident: str, cycle: str) -> list:
    # "dtpp-charts": every chart, where "dtpp" kept the diagram alone; a
    # new name, so an index kept on disk in the old shape is not read as
    # the new one.
    index = _index("dtpp-charts", cycle, f"{DTPP_BASE}/{cycle}/xml_data/d-tpp_Metafile.xml", _charts_of)
    return next((index[i] for i in _faa_idents(ident) if i in index), [])


def terminal_charts(ident: str, on: date | None = None) -> list:
    """The field's charts in this cycle's d-TPP -- its airport diagram,
    hot spots, approaches, departures, arrivals and minimums -- each
    {"kind": the FAA's chart code, "name": its title as the FAA prints it,
    "url": its PDF}; none for a field with none (most small ones) or
    where the index cannot be had."""
    cycle = dtpp_cycle(on)
    return [{"kind": code, "name": name, "url": f"{DTPP_BASE}/{cycle}/{pdf}"} for code, name, pdf in _charts_for(ident, cycle)]


def airport_diagram_url(ident: str, on: date | None = None) -> str | None:
    """The airport diagram's PDF for this cycle, None where the field has
    none (most small ones) or the index cannot be had."""
    cycle = dtpp_cycle(on)
    pdf = next((pdf for code, _, pdf in _charts_for(ident, cycle) if code == "APD"), None)
    return f"{DTPP_BASE}/{cycle}/{pdf}" if pdf else None


def chart_supplement_url(ident: str, on: date | None = None) -> str | None:
    """The field's Chart Supplement page for this edition, None where it
    has none or the index cannot be had."""
    pages = _supplement_pages(ident, dcs_edition(on))
    return f"{DCS_BASE}/{dcs_edition(on)}/{pages[0]}" if pages else None


def _supplement_pages(ident: str, edition: str) -> list:
    # "dcs-pages": every page of the entry, where "dcs" kept the first; a
    # new name, so an index kept on disk in the old shape is not read as
    # the new one.
    index = _index("dcs-pages", edition, f"{DCS_BASE}/{edition}/afd_{edition}.xml", _supplements_of)
    return next((index[i] for i in _faa_idents(ident) if i in index), [])


def airport_diagram_cycle(ident: str, on: date | None = None) -> str | None:
    """The d-TPP cycle whose airport diagram this field has, for the card
    to ask for its picture by (`airport_diagram_png`); None where it has
    none."""
    return dtpp_cycle(on) if airport_diagram_url(ident, on) else None


#: A PDF's own name in an FAA publication: letters, figures and a few
#: marks, no path -- what a chart's address may name and nothing else.
_PDF_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,80}\.pdf$", re.IGNORECASE)


def _source_of(url: str, on: date | None = None) -> tuple | None:
    """("dtpp" or "dcs", the edition, the PDF's name) for an FAA chart's
    address in the edition in force -- the d-TPP's or the Chart
    Supplement's, on aeronav.faa.gov -- and None for any other address:
    the planner reads the FAA's charts and nothing it is pointed at."""
    for source, base, edition in (("dtpp", DTPP_BASE, dtpp_cycle(on)), ("dcs", DCS_BASE, dcs_edition(on))):
        prefix = f"{base}/{edition}/"
        if url.startswith(prefix) and _PDF_NAME.match(url[len(prefix) :]):
            return source, edition, url[len(prefix) :]
    return None


class FaaUnreachable(Exception):
    """The FAA's site did not answer (or answered with an error): not
    the same as the chart not existing, and not kept as that."""


#: PDFs the FAA said it has no such file for, by (source, edition, name):
#: an address made up to fetch is asked of the FAA once, not each time.
_ABSENT: set = set()
_ABSENT_MAX = 1000


def _pdf_of(source: str, edition: str, name: str) -> bytes | None:
    """One of the FAA's PDFs, downloaded once and kept for its edition;
    None where the FAA has no such file; FaaUnreachable where it could
    not be asked, so an outage is not taken for a missing chart."""
    path = CACHE_DIR / "pdf" / source / edition / name
    if path.exists():
        return path.read_bytes()
    if (source, edition, name) in _ABSENT:
        return None
    with one_at_a_time(path):
        if path.exists():
            return path.read_bytes()
        base = DTPP_BASE if source == "dtpp" else DCS_BASE
        try:
            resp = outside.get(f"{base}/{edition}/{name}", headers=HEADERS, timeout=60)
            if resp.status_code in (403, 404):
                # S3, which serves the FAA's files, answers 403 for a key that is not there.
                with _LOCK:
                    if len(_ABSENT) >= _ABSENT_MAX:
                        _ABSENT.clear()
                    _ABSENT.add((source, edition, name))
                return None
            resp.raise_for_status()
        except requests.RequestException as err:
            log.warning("No %s %s in %s: %s", source, name, edition, err)
            raise FaaUnreachable(str(err)) from err
        with atomic_path(path) as partial:
            partial.write_bytes(resp.content)
        return resp.content


def preload() -> None:
    """Both indexes for today's editions, read now rather than on a
    pilot's first card."""
    airport_diagram_url("KORD")
    chart_supplement_url("KORD")
