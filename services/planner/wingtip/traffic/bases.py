"""Where an airplane is based: the field its own flights keep to."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from cachetools import TTLCache

from ..engine import ask as engine
from .common import _LOCK
from .lookup import _HEX
from .flights import history

#: An airplane's base is kept this long, s: it changes seldom.
BASED_TTL_S = 12 * 3600
#: Airplanes asked about at a time: each a history's few days of reads.
BASED_WORKERS = 2
_BASED: TTLCache = TTLCache(maxsize=4096, ttl=BASED_TTL_S)
_BASED_PENDING: set[str] = set()
_BASED_POOL = ThreadPoolExecutor(max_workers=BASED_WORKERS)


def _base_of(flights: list[dict]) -> dict:
    """Where these flights say the airplane is based, as the engine's
    `usual_base` rules it (engine/crates/flight/src/based.rs: at least 3 of
    their takeoffs and landings at one field, at least 0.4 of them, and no
    tie; the owner's figures, 2026-10-13): {"field" (the base, as the
    flights name it, or None), "count" (its takeoffs and landings, or the
    most at any field where there is no base), "ends" (all of them)}."""
    by_ident = {}
    asked = []
    for f in flights:
        origin, destination = f.get("origin"), f.get("destination")
        for end in (origin, destination):
            if end:
                by_ident.setdefault(end["ident"], end)
        asked.append(
            {
                "origin": origin["ident"] if origin else None,
                "destination": destination["ident"] if destination else None,
                "landed": bool(f.get("landed")),
            }
        )
    answer = engine("usual_base", flights=asked)
    field = by_ident.get(answer["ident"]) if answer["ident"] else None
    return {"field": field, "count": answer["most_ends"], "ends": answer["ends"]}


def _find_base(hex_id: str) -> None:
    try:
        judged = _base_of(history(hex_id)["flights"])
    except Exception:  # noqa: BLE001 -- asked again next time, not kept
        with _LOCK:
            _BASED_PENDING.discard(hex_id)
        return
    with _LOCK:
        _BASED[hex_id] = judged
        _BASED_PENDING.discard(hex_id)


def based(hexes: list[str]) -> dict:
    """Where each of these airplanes is based (`_base_of` over its last
    flights, `history`), the field alone: {"based": {hex: field or None}, "pending": [hex]}
    -- those not known yet are looked up in the background, two airplanes
    at a time, and given on a later ask."""
    known: dict[str, dict | None] = {}
    pending: list[str] = []
    asking: list[str] = []
    with _LOCK:
        for hex_id in dict.fromkeys(h.lower() for h in hexes if _HEX.fullmatch(h.lower()) and not h.startswith("~")):
            if hex_id in _BASED:
                known[hex_id] = _BASED[hex_id]["field"]
                continue
            pending.append(hex_id)
            if hex_id not in _BASED_PENDING:
                _BASED_PENDING.add(hex_id)
                asking.append(hex_id)
    # Handed to the pool once the lock is let go: a lookup takes it to store.
    for hex_id in asking:
        _BASED_POOL.submit(_find_base, hex_id)
    return {"based": known, "pending": pending}


def based_judged(hex_id: str) -> dict | None:
    """One airplane's base with the counts it was judged on (`_base_of`'s
    answer), for its card's "usually based at, 6 of 9 takeoffs and
    landings"; None while it is still being looked up, which this starts
    (`based`)."""
    hex_id = hex_id.lower()
    based([hex_id])
    with _LOCK:
        return _BASED.get(hex_id)
