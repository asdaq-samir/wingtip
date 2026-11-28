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
#: The newest list as read: its identifications, and the Mode S addresses
#: the registry gives its N-numbers, worked out once a list and registry
#: file (`key`). Each radar track asked the registry for its own address,
#: a read of the file each, 79 ms a poll for 88 tracks (2026-11-27).
_held: dict[str, object] = {"key": None, "idents": frozenset(), "addresses": frozenset()}
#: The list's folder and the registry file are looked at again after this
#: long, s, so a poll's tracks share one look: the folder's listing and
#: the files' stat for each track were most of a poll's 6 ms once the
#: registry was no longer read for each (88 tracks, 2026-11-27).
LOOK_S = 5.0
_looked: dict[Path, tuple[float, tuple | None]] = {}


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


def _list_file(directory: Path) -> tuple | None:
    """The newest list (its path and mtime) and the registry file's
    version, looked at once in LOOK_S; None where no list is kept."""
    clock = time.monotonic()
    with _LOCK:
        seen = _looked.get(directory)
    if seen is not None and clock - seen[0] < LOOK_S:
        return seen[1]
    path = _newest(directory)
    found = (path, path.stat().st_mtime, registry.version()) if path is not None else None
    with _LOCK:
        _looked[directory] = (clock, found)
    return found


def _current(directory: Path, now: float | None) -> dict | None:
    """The newest list as `_held` keeps it, None where none is kept or the
    newest is older than MAX_AGE_S."""
    key = _list_file(directory)
    if key is None or (time.time() if now is None else now) - key[1] > MAX_AGE_S:
        return None
    path = key[0]
    with _LOCK:
        if _held["key"] == key:
            return dict(_held)
    idents = read(path)
    held = {"key": key, "idents": idents, "addresses": registry.addresses(idents)}
    with _LOCK:
        _held.update(held)
    return held


def current(directory: Path = LADD_DIR, now: float | None = None) -> frozenset[str] | None:
    """The newest list's identifications, None where none is kept or the
    newest is older than MAX_AGE_S."""
    held = _current(directory, now)
    return None if held is None else held["idents"]


def hidden(plane: dict, directory: Path = LADD_DIR, now: float | None = None) -> bool:
    """Whether a radar track from SWIM must not be shown: its aircraft is on
    the current list -- by its call sign, its registration, or its Mode S
    address, one the registry gives a listed N-number -- or no current
    list is kept and LADD_REQUIRED holds."""
    held = _current(directory, now)
    if held is None:
        return get_settings().ladd_required
    names = {str(plane.get(key) or "").upper().replace("-", "") for key in ("callsign", "registration")}
    return bool(names & held["idents"]) or str(plane.get("hex") or "").lower() in held["addresses"]
