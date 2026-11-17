"""OurAirports' tables on disk and in memory: where they are, the one
download of each, and the one read of each per process (the other
airport modules read through these)."""

import threading
from pathlib import Path

import pandas as pd

from . import outside
from .atomic import atomic_path
from .config import REQUEST_HEADERS
from .routecsv import locked
from .single_flight import once

OURAIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
RUNWAYS_URL = "https://davidmegginson.github.io/ourairports-data/runways.csv"
FREQUENCIES_URL = "https://davidmegginson.github.io/ourairports-data/airport-frequencies.csv"
_RAW_DIR = Path(__file__).resolve().parents[3] / "data" / "raw"
DEFAULT_CACHE_PATH = _RAW_DIR / "airports.csv"
RUNWAYS_CACHE_PATH = _RAW_DIR / "runways.csv"
FREQUENCIES_CACHE_PATH = _RAW_DIR / "airport-frequencies.csv"


def _ensure_cached(url: str, cache_path: Path) -> Path:
    """The table on disk, downloaded once if it is not there yet.

    One download at a time per file, and the file whole or absent: a
    briefing asks for the runways from two of its stages at once, and
    on a cold cache each stage downloaded the table and one read the
    other's half-written file -- "No columns to parse from file", a
    500 for the first briefing after a fresh start.
    """
    # On disk already, it is whole (a download is renamed into place), so
    # there is no lock to take: each read of a table took it -- a lock
    # file opened and flocked on the data's mount, a millisecond a time --
    # and a nav log reads the airports table for each leg's temperatures
    # aloft at each altitude it weighs, a fifth of its time once its
    # checkpoints were known (profiled 2026-10-10).
    if cache_path.exists():
        return cache_path
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    with locked(cache_path):
        if not cache_path.exists():
            resp = outside.get(url, headers=REQUEST_HEADERS, timeout=30)
            resp.raise_for_status()
            with atomic_path(cache_path) as partial:
                partial.write_bytes(resp.content)
    return cache_path


@once(maxsize=8)
def _read_table_of(path: str, _mtime: float) -> pd.DataFrame:
    """One read per file per process. `_mtime` is not used in the body:
    it is in the signature so a file replaced on disk is a different
    cache entry, which is what the hand-rolled dict this replaced used
    its key for."""
    return pd.read_csv(path, low_memory=False)


_READ_TABLE_LOCK = threading.Lock()


def _read_table(path: str, _mtime: float) -> pd.DataFrame:
    """_read_table_of, one read at a time: each caller that came while a
    table was being read read it too (as _US_AIRPORTS_LOCK says)."""
    with _READ_TABLE_LOCK:
        return _read_table_of(path, _mtime)


def _load_table(url: str, cache_path: Path) -> pd.DataFrame:
    path = _ensure_cached(url, cache_path)
    return _read_table(str(path), path.stat().st_mtime)


def load_airports(cache_path: Path = DEFAULT_CACHE_PATH) -> pd.DataFrame:
    """Load the full OurAirports table (downloads + caches on first call).

    Held in memory after the first read. wingtip.weather looks up the nearest
    winds-aloft station through this, once per nav-log leg, and re-parsing
    an 80,000-row CSV each time was a measurable part of what made
    planning a route slow. Callers must treat the frame as read-only.
    """
    return _load_table(OURAIRPORTS_URL, cache_path)


@once(maxsize=4)
def _airport_rows(path: str, _mtime: float) -> dict:
    """Each ident and local code in the table, upper-cased, to its first
    row's position: the row a scan of both columns found first, in the
    table's order. Made once per table read (keyed as _read_table is);
    the scan it replaces was 8 ms a lookup, and every request about a
    route looks up its airports."""
    df = _read_table(path, _mtime)
    rows: dict = {}
    # A missing local code is no code: as "NAN" it would answer a lookup of "NAN".
    idents = df["ident"].astype(str).fillna("").str.strip().str.upper()  # cast, then fill: pandas 4 won't put "" in a float column
    locals_ = df["local_code"].astype(str).fillna("").str.strip().str.upper()
    for i, (ident, local) in enumerate(zip(idents, locals_)):
        if ident:
            rows.setdefault(ident, i)
        if local:
            rows.setdefault(local, i)
    return rows


def _faa_key(cache_path: Path) -> tuple[str, float]:
    """The FAA's airport file beside OurAirports' (faa_nasr/APT_BASE.csv,
    as FAA_CACHE_DIR is beside DEFAULT_CACHE_PATH) and when it was written,
    to key the tables on; ("", 0.0) where there is none yet. Never
    fetched from here: a table of fields is not held up on the NASR
    download, and a test's own airports file has no FAA file beside it."""
    apt = Path(cache_path).parent / "faa_nasr" / "APT_BASE.csv"
    try:
        return str(apt), apt.stat().st_mtime
    except OSError:
        return "", 0.0
