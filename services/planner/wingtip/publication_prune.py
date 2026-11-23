"""Past editions of the FAA's publications let go from disk: each cycle's
PDFs, their drawn pages, the airport diagrams and the plates were kept for
good before, a cycle's worth every 28 days (the security review of
2026-11-23, M3). Run with the indexes' preload (app.warm_up)."""

from __future__ import annotations

import logging
import shutil
from datetime import date, datetime

from . import publications
from .publications import _KINDS, _in_force, serves

log = logging.getLogger(__name__)

#: What is kept per edition under publications.CACHE_DIR, as
#: {folder}/{source}/{edition} (the PDFs and their pages) or
#: {folder}/{edition} (the d-TPP's diagrams and plates).
_PER_EDITION = (("pdf", "dtpp"), ("pdf", "dcs"), ("pages", "dtpp"), ("pages", "dcs"), ("diagrams", None), ("plates", None))


def prune(on: date | datetime | None = None) -> list:
    """Each past edition's folders deleted: the edition in force and the
    one the card shows in its place (`publications.serves`) are kept, and a
    later one fetched ahead. The folders deleted, for the log."""
    gone = []
    for folder, source in _PER_EDITION:
        kind = source or "dtpp"
        order = _KINDS[kind][2]
        in_force = order(_in_force(kind, on))
        root = publications.CACHE_DIR / folder / source if source else publications.CACHE_DIR / folder
        for path in sorted(root.glob("*")) if root.is_dir() else ():
            try:
                past = order(path.name) < in_force
            except ValueError:
                continue
            if past and not serves(kind, path.name, on):
                shutil.rmtree(path, ignore_errors=True)
                gone.append(path)
    if gone:
        log.info("Let go of %d past editions' charts", len(gone))
    return gone
