"""The FAA's LADD list (Limiting Aircraft Data Displayed): the aircraft
whose owners asked that their flight data not be shown to the public.

Whoever shows data from SWIM to the public must leave them out: the SWIM
Cloud Distribution Service's Service Access Agreement binds its consumers
to the LADD filter ("users who publicly display data obtained from SWIM are
required to apply the LADD filter", the SWIM Users Forum, March 2024), each
new list in force within five business days of its publication, and an
aircraft's data from while it was listed stays hidden after it leaves the
list (SWIM's own LADD guidance). The FAA's terminal radar tracks that
ingest reads from SWIM's STDDS (wingtip.traffic.radar) are such data.

The list ("IndustryLADD") is had from the FAA's Aeronautical Data Exchange
(adx.faa.gov) with an account, so the owner saves each one into
data/raw/faa_ladd/ (LADD_DIR); every line's first field is an aircraft's
identification, an N-number or a call sign. A listed aircraft is matched
by its call sign, its registration, and its Mode S address's N-number in
the FAA's registry.

Until a list no older than MAX_AGE_S is kept, the radar is shown to no one
(fails closed): LADD_REQUIRED=0 lets it through only where nothing is
public, the owner's own stack. adsb.lol's and the other community feeds
are not SWIM's and are not bound by it; they honour their own blocks.
"""

from __future__ import annotations

import re
import threading
import time
from pathlib import Path

from .. import registry
from ..config import DATA_DIR, get_settings

LADD_DIR = DATA_DIR / "raw" / "faa_ladd"
#: A list counts as current for this long, s: the FAA publishes one a
#: month (its SWIM guidance; the forum's slides say weekly), and a new one
#: must be in force within five business days, so a list older than a
#: month and a week has been replaced.
MAX_AGE_S = 37 * 24 * 3600
#: An aircraft's identification as a list's first field: letters and
#: digits, an N-number or a call sign; a header's words are not.
_IDENT = re.compile(r"[A-Z0-9]{2,8}")

_LOCK = threading.Lock()
_held: dict[str, object] = {"key": None, "idents": frozenset()}


def _newest(directory: Path) -> Path | None:
    files = [p for p in directory.glob("*") if p.is_file() and not p.name.startswith(".")] if directory.is_dir() else []
    return max(files, key=lambda p: p.stat().st_mtime, default=None)


def read(path: Path) -> frozenset[str]:
    """A list's identifications: each line's first field, upper case, its
    dashes gone, where it is one."""
    idents = set()
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        field = re.split(r"[,\t; ]+", line.strip().strip('"'), maxsplit=1)[0].strip('"').upper().replace("-", "")
        if _IDENT.fullmatch(field) and any(c.isdigit() for c in field):
            idents.add(field)
    return frozenset(idents)


def current(directory: Path = LADD_DIR, now: float | None = None) -> frozenset[str] | None:
    """The newest list's identifications, None where none is kept or the
    newest is older than MAX_AGE_S."""
    path = _newest(directory)
    if path is None:
        return None
    mtime = path.stat().st_mtime
    if (time.time() if now is None else now) - mtime > MAX_AGE_S:
        return None
    with _LOCK:
        if _held["key"] != (path, mtime):
            _held["idents"] = read(path)
            _held["key"] = (path, mtime)
        return _held["idents"]  # type: ignore[return-value]


def hidden(plane: dict, directory: Path = LADD_DIR, now: float | None = None) -> bool:
    """Whether a radar track from SWIM must not be shown: its aircraft is on
    the current list, or no current list is kept and LADD_REQUIRED holds."""
    idents = current(directory, now)
    if idents is None:
        return get_settings().ladd_required
    names = {str(plane.get(key) or "").upper().replace("-", "") for key in ("callsign", "registration")}
    if names & idents:
        return True
    found = registry.lookup(hex_id=plane.get("hex")) if plane.get("hex") else None
    return bool(found and str(found.get("n_number") or "").upper() in idents)
