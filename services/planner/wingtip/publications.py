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

Where the FAA cannot give an edition's index (an outage), the card is not
left saying the field has no plates: the newest earlier edition kept on
disk is shown, named by its edition, or the card is told neither could be
had (`editions`, the card's `publications`).
"""

from __future__ import annotations

import json
import logging
import re
import threading
import xml.etree.ElementTree as ET
from datetime import date, datetime

import requests
from cachetools import LRUCache, TTLCache

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

#: How long an index the FAA did not give is not asked for again: during
#: an outage every card waited on the index's 120 s fetch. Held under _LOCK.
RETRY_S = 600
_FAILED: TTLCache = TTLCache(maxsize=64, ttl=RETRY_S)


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
        # Only a PDF's own name, as _PDF_NAME has it: the name is put into
        # the links the card hands out, so one with a path in it (the
        # metafile's, however it came) leads nowhere else (the security
        # reviews of 2026-11-21, L16).
        charts = [
            [record.findtext("chart_code") or "", record.findtext("chart_name") or "", record.findtext("pdf_name")]
            for record in airport.iter("record")
            if _PDF_NAME.fullmatch(record.findtext("pdf_name") or "")
        ]
        for ident in (airport.get("apt_ident"), airport.get("icao_ident")):
            if ident and charts:
                found[ident.upper()] = charts
    return found


def _states_of(xml_bytes: bytes) -> dict:
    """{state code: {"name": the state's name, "idents": its fields' FAA
    idents}} from a d-TPP metafile, whose fields are filed under their
    state (its state_code elements, "CA" "California"): the plates a
    pilot downloads a state at a time (wingtip.plate_sets)."""
    found = {}
    for state in ET.fromstring(xml_bytes).iter("state_code"):
        code = (state.get("ID") or "").strip().upper()
        idents = [a.get("apt_ident", "").strip().upper() for a in state.iter("airport_name") if a.get("apt_ident")]
        if code and idents:
            entry = found.setdefault(code, {"name": (state.get("state_fullname") or code).strip(), "idents": []})
            entry["idents"] += [i for i in idents if i not in entry["idents"]]
    return found


def _supplements_of(xml_bytes: bytes) -> dict:
    """{FAA ident: its Chart Supplement pages' PDFs, in order} from a d-CS
    airport list: an entry may run on to a second page."""
    found = {}
    for airport in ET.fromstring(xml_bytes).iter("airport"):
        ident = airport.findtext("aptid")
        pdfs = [pdf.text.strip() for pdf in airport.iterfind("pages/pdf") if _PDF_NAME.fullmatch((pdf.text or "").strip())]
        if ident and pdfs:
            found.setdefault(ident.upper(), pdfs)
    return found


def _index(name: str, edition: str, url: str, parse) -> dict | None:
    """An index for one edition, from memory, from disk, or downloaded
    and parsed once; None when the FAA cannot be reached, told apart from
    an edition that lists nothing for a field. A failure is not asked
    again for RETRY_S."""
    key = (name, edition)
    with _LOCK:
        if key in _HELD:
            return _HELD[key]
        path = CACHE_DIR / f"{name}-{edition}.json"
        if path.exists():
            index = json.loads(path.read_text())
        else:
            # By its file, so a failure is the one folder's.
            if path in _FAILED:
                return None
            try:
                resp = outside.get(url, headers=HEADERS, timeout=120)
                resp.raise_for_status()
                index = parse(resp.content)
            except (requests.RequestException, ET.ParseError) as err:
                log.warning("No %s index for %s: %s", name, edition, err)
                _FAILED[path] = True
                return None
            with atomic_path(path) as partial:
                partial.write_text(json.dumps(index))
        _FAILED.pop(path, None)
        _HELD[key] = index
        return index


def _dcs_day(edition: str) -> datetime:
    return datetime.strptime(edition, "%d%b%Y")


#: Each publication's index file's name and how its editions are ordered:
#: the d-TPP's "2611" by its number (year then cycle), the Chart
#: Supplement's "29Oct2026" by its day.
_KINDS = {"dtpp": ("dtpp-charts", DTPP_BASE, int), "dcs": ("dcs-pages", DCS_BASE, _dcs_day)}


def _in_force(source: str, on: date | datetime | None) -> str:
    return dtpp_cycle(on) if source == "dtpp" else dcs_edition(on)


def _kept_edition(source: str, edition: str) -> str | None:
    """The newest edition before `edition` whose index is kept on disk, None
    where none is. Never a later one: a next edition is not in force."""
    name, _, order = _KINDS[source]
    earlier = []
    for path in CACHE_DIR.glob(f"{name}-*.json"):
        other = path.stem[len(name) + 1 :]
        try:
            if order(other) < order(edition):
                earlier.append(other)
        except ValueError:
            continue
    return max(earlier, key=order, default=None)


def _index_of(source: str, edition: str) -> dict | None:
    """The edition's index of `source`'s charts (`_index`)."""
    name, base, _ = _KINDS[source]
    url = f"{base}/{edition}/xml_data/d-tpp_Metafile.xml" if source == "dtpp" else f"{base}/{edition}/afd_{edition}.xml"
    return _index(name, edition, url, _charts_of if source == "dtpp" else _supplements_of)


def _edition(source: str, on: date | datetime | None) -> tuple:
    """(the edition a card's links are of, its index, "current", "kept" or
    "unavailable"): the edition in force where the FAA gives it, else the
    newest earlier one kept on disk, else none and an empty index."""
    name = _KINDS[source][0]
    edition = _in_force(source, on)
    index = _index_of(source, edition)
    if index is not None:
        return edition, index, "current"
    kept = _kept_edition(source, edition)
    if kept is None:
        return None, {}, "unavailable"
    with _LOCK:
        if (name, kept) not in _HELD:
            _HELD[(name, kept)] = json.loads((CACHE_DIR / f"{name}-{kept}.json").read_text())
        return kept, _HELD[(name, kept)], "kept"


def editions(on: date | datetime | None = None) -> dict:
    """What the card's plates (the d-TPP) and Chart Supplement links are
    of, each {"state": "current", "kept" or "unavailable", "edition"}: an
    FAA outage said as one, not read as a field with no plates."""
    found = {}
    for source, key in (("dtpp", "plates"), ("dcs", "supplement")):
        edition, _, state = _edition(source, on)
        found[key] = {"state": state, "edition": edition}
    return found


def serves(source: str, edition: str, on: date | datetime | None = None) -> bool:
    """Whether a chart of `source`'s `edition` may be read: the edition in
    force, or, while its index is not had, the kept one the card shows in
    its place. Asks nothing of the FAA."""
    if source not in _KINDS:
        return False
    in_force = _in_force(source, on)
    if edition == in_force:
        return True
    name = _KINDS[source][0]
    return not (CACHE_DIR / f"{name}-{in_force}.json").exists() and edition == _kept_edition(source, in_force)


def states(on: date | datetime | None = None) -> tuple:
    """(the d-TPP cycle, its fields by state as `_states_of` gives them):
    of the cycle in force, or of the kept cycle the cards show while that
    one's index cannot be had (`editions`); (None, {}) where neither can.
    Read from the same metafile as the charts, once a cycle."""
    cycle, _, _ = _edition("dtpp", on)
    if cycle is None:
        return None, {}
    index = _index("dtpp-states", cycle, f"{DTPP_BASE}/{cycle}/xml_data/d-tpp_Metafile.xml", _states_of)
    return (cycle, index) if index is not None else (None, {})


def _faa_idents(ident: str) -> list:
    ident = ident.strip().upper()
    return [ident, ident[1:]] if len(ident) == 4 and ident[0] in "KP" else [ident]


def _found(index: dict, ident: str) -> list:
    return next((index[i] for i in _faa_idents(ident) if i in index), [])


def terminal_charts(ident: str, on: date | None = None, kept: bool = True) -> list:
    """The field's charts in this cycle's d-TPP -- its airport diagram,
    hot spots, approaches, departures, arrivals and minimums -- each
    {"kind": the FAA's chart code, "name": its title as the FAA prints it,
    "url": its PDF}; none for a field with none (most small ones) or
    where no index can be had. Of the kept cycle while the one in force
    cannot be had (`editions` says so), unless `kept` is False: a rule
    (an alternate's approaches) reads only the cycle in force."""
    cycle, index, state = _edition("dtpp", on)
    if state == "kept" and not kept:
        return []
    return [{"kind": code, "name": name, "url": f"{DTPP_BASE}/{cycle}/{pdf}"} for code, name, pdf in _found(index, ident)]


def airport_diagram_url(ident: str, on: date | None = None) -> str | None:
    """The airport diagram's PDF for this cycle (or the kept one, as
    `terminal_charts`), None where the field has none (most small ones) or
    no index can be had."""
    cycle, index, _ = _edition("dtpp", on)
    pdf = next((pdf for code, _, pdf in _found(index, ident) if code == "APD"), None)
    return f"{DTPP_BASE}/{cycle}/{pdf}" if pdf else None


def chart_supplement_url(ident: str, on: date | None = None) -> str | None:
    """The field's Chart Supplement page for this edition (or the kept
    one), None where it has none or no index can be had."""
    edition, index, _ = _edition("dcs", on)
    pages = _found(index, ident)
    return f"{DCS_BASE}/{edition}/{pages[0]}" if pages else None


def _supplement_pages(ident: str, edition: str) -> list:
    """The field's pages in `edition` of the Chart Supplement: one the card
    shows (`serves`), in force or kept."""
    index = _index("dcs-pages", edition, f"{DCS_BASE}/{edition}/afd_{edition}.xml", _supplements_of)
    return _found(index or {}, ident)


def airport_diagram_cycle(ident: str, on: date | None = None) -> str | None:
    """The d-TPP cycle whose airport diagram this field has, for the card
    to ask for its picture by (`airport_diagram_png`): the one in force,
    or the kept one; None where it has none."""
    url = airport_diagram_url(ident, on)
    return url[len(DTPP_BASE) + 1 :].split("/", 1)[0] if url else None


#: A PDF's own name in an FAA publication: letters, figures and a few
#: marks, no path -- what a chart's address may name and nothing else.
#: Matched whole (fullmatch): a `$` would also pass a name ending in a newline.
_PDF_NAME = re.compile(r"[A-Za-z0-9_.-]{1,80}\.pdf", re.IGNORECASE)

#: The PDFs each edition's index names, by (source, edition), as (the index
#: they were read from, the names): read once, not walked at every ask.
_NAMES: LRUCache = LRUCache(maxsize=8)


def listed(source: str, edition: str, name: str) -> bool:
    """Whether the edition's own index names the PDF: the planner fetches,
    keeps and draws the FAA's charts and nothing else of the right shape
    (a made-up name each time was a download, a file and a draw under the
    one drawing lock each: the security review of 2026-11-23, M3). Only
    asked of an edition the card shows (`serves`), whose index is had."""
    if source not in _KINDS or not _PDF_NAME.fullmatch(name):
        return False
    index = _index_of(source, edition)
    if index is None:
        return False
    with _LOCK:
        held = _NAMES.get((source, edition))
        if held is None or held[0] is not index:
            held = _NAMES[(source, edition)] = (index, frozenset(c if isinstance(c, str) else c[2] for cs in index.values() for c in cs))
    return name in held[1]


def _source_of(url: str, on: date | None = None) -> tuple | None:
    """("dtpp" or "dcs", the edition, the PDF's name) for an FAA chart's
    address in the edition the card shows (`serves`) -- the d-TPP's or the
    Chart Supplement's, on aeronav.faa.gov -- and None for any other
    address: the planner reads the FAA's charts and nothing it is pointed
    at."""
    for source, (_, base, _) in _KINDS.items():
        if not url.startswith(f"{base}/"):
            continue
        edition, _, name = url[len(base) + 1 :].partition("/")
        if serves(source, edition, on) and _PDF_NAME.fullmatch(name):
            return source, edition, name
    return None


class FaaUnreachable(Exception):
    """The FAA's site did not answer (or answered with an error): not
    the same as the chart not existing, and not kept as that."""


#: PDFs the FAA said it has no such file for, by (source, edition, name):
#: an index's name the FAA has not put up is asked of it once, not each
#: time; the least lately missed go first. Held under _LOCK.
_ABSENT: LRUCache = LRUCache(maxsize=1000)


def _pdf_of(source: str, edition: str, name: str) -> bytes | None:
    """One of the FAA's PDFs, downloaded once and kept for its edition;
    None where the FAA has no such file; FaaUnreachable where it could
    not be asked, so an outage is not taken for a missing chart. None, and
    no ask, for a name its edition's index does not list (`listed`)."""
    if not listed(source, edition, name):
        return None
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
                    _ABSENT[(source, edition, name)] = True
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
