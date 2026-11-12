"""The weather the weather service (services/weather) fetches and the
planner reads: one file per product in a folder on the data volume both
mount (WEATHER_STORE, data/raw/weather by default), so no pilot's request
ever waits on aviationweather.gov, NOMADS, tfr.faa.gov or IEM (#535).

The service is the only writer. Each product is a gzipped JSON record,
written whole to a file of its own and moved into place (wingtip.atomic), so
a reader sees the old copy or the new one and never half of either:

    {"name", "fetched_at" (UNIX s), "until" (UNIX s, or null for no
     limit: to when the copy may still be served, by the product's own
     validity), "meta" ({...}), "data" (the product, parsed)}

Beside it `<name>.attempt.json` says when the service last tried for a
newer copy and whether that failed, for the Status page and the
service's health; a grid too large for JSON (GLMP's) is a .npy array
beside its record, and a picture made whole (the flow layer's PNGs,
write_blob) a file of its own, opened by the planner without reading it all in
(np.load's mmap_mode). And `asked`, a file the planner touches at most
once a minute as it reads, tells the service someone is planning: it
fetches at its full pace then, and slowly otherwise (services/weather's
settings), as the planner's own refresh did while it fetched in-process
-- it downloaded every product every four minutes round the clock,
nobody planning, about 300 MB a day.

What each product's `data` holds is the service's to say
(services/weather/app); this module only keeps and reads the records.
"""

from __future__ import annotations

import gzip
import json
import os
import threading
import time
from pathlib import Path
from typing import NamedTuple

from . import tracing
from .atomic import atomic_path
from .config import get_settings

#: The winds aloft's periods, each a product of its own ("winds-06" ...):
#: the GFS forecast hours the planner reads for a departure up to six,
#: fifteen and twenty-seven hours ahead (services/weather/app/gfs.py).
WIND_PERIODS = ("06", "12", "24")

#: How often the planner says it is planning, at most.
ASKED_EVERY_S = 60.0


class Record(NamedTuple):
    """One product as the service last wrote it."""

    fetched_at: float
    until: float | None
    data: object
    meta: dict


def store_dir() -> Path:
    return Path(get_settings().weather_store)


def _path(name: str, suffix: str = ".json.gz") -> Path:
    return store_dir() / f"{name}{suffix}"


def _write_atomic(path: Path, body: bytes) -> None:
    with atomic_path(path) as tmp:
        tmp.write_bytes(body)


def write(name: str, data, fetched_at: float, until: float | None, meta: dict | None = None) -> None:
    """The service's copy of `name`, replacing the one before."""
    record = {"name": name, "fetched_at": fetched_at, "until": until, "meta": meta or {}, "data": data}
    _write_atomic(_path(name), gzip.compress(json.dumps(record, separators=(",", ":")).encode(), compresslevel=5))


def write_attempt(name: str, attempted: float, error: str | None) -> None:
    """When the service last tried for `name`, and the failure, if it failed."""
    _write_atomic(_path(name, ".attempt.json"), json.dumps({"attempted": attempted, "error": error}).encode())


def write_array(name: str, array) -> Path:
    """A grid as a .npy file beside the records, for read_array."""
    import io

    import numpy as np

    buffer = io.BytesIO()
    np.save(buffer, array, allow_pickle=False)
    path = _path(name, ".npy")
    _write_atomic(path, buffer.getvalue())
    return path


def read_array(name: str):
    """A grid written by write_array, mapped rather than read: a page of it
    is read from disk as a lookup touches it."""
    import numpy as np

    return np.load(_path(name, ".npy"), mmap_mode="r", allow_pickle=False)


def remove_arrays(prefix: str, keep: set[str]) -> None:
    """Every grid whose name starts with `prefix` but those in `keep`. A
    planner that has one mapped keeps reading it: the file goes when it
    lets go."""
    folder = store_dir()
    if not folder.is_dir():
        return
    for path in folder.glob(f"{prefix}*.npy"):
        if path.stem not in keep:
            path.unlink(missing_ok=True)


def write_blob(name: str, body: bytes, suffix: str) -> Path:
    """A file the service made whole (the flow layer's PNGs), beside the
    records, for the planner to send as it is."""
    path = _path(name, suffix)
    _write_atomic(path, body)
    return path


def blob_path(name: str, suffix: str) -> Path | None:
    """Where a file written by write_blob is; None where there is none."""
    path = _path(name, suffix)
    return path if path.is_file() else None


def blob_exists(name: str, suffix: str) -> bool:
    return blob_path(name, suffix) is not None


def remove_blobs(prefix: str, keep: set[str], suffix: str) -> None:
    """Every file of `suffix` whose name starts with `prefix` but those in `keep`."""
    folder = store_dir()
    if not folder.is_dir():
        return
    for path in folder.glob(f"{prefix}*{suffix}"):
        if path.name[: -len(suffix)] not in keep:
            path.unlink(missing_ok=True)


# Each record decoded once per file written: path -> ((mtime_ns, size), Record).
_READ: dict[str, tuple[tuple[int, int], Record]] = {}
_READ_LOCK = threading.Lock()


def read(name: str) -> Record | None:
    """The copy of `name` the service last wrote; None where it has written
    none. Decoded once per copy: a second read of the same file is a stat.
    A span in a traced request (wingtip.tracing), so a plan's trace shows
    which products it read."""
    with tracing.span("weather_store.read", **{"wingtip.weather.product": name}):
        return _read(name)


def _read(name: str) -> Record | None:
    path = _path(name)
    try:
        stat = path.stat()
    except FileNotFoundError:
        return None
    key = (stat.st_mtime_ns, stat.st_size)
    with _READ_LOCK:
        held = _READ.get(str(path))
    if held is not None and held[0] == key:
        return held[1]
    try:
        raw = json.loads(gzip.decompress(path.read_bytes()))
    except FileNotFoundError:
        return None
    record = Record(fetched_at=float(raw["fetched_at"]), until=raw.get("until"), data=raw.get("data"), meta=raw.get("meta") or {})
    with _READ_LOCK:
        _READ[str(path)] = (key, record)
    return record


def attempt(name: str) -> dict | None:
    """{"attempted", "error"} of the service's last try for `name`; None
    before its first."""
    try:
        return json.loads(_path(name, ".attempt.json").read_bytes())
    except (FileNotFoundError, ValueError):
        return None


def servable(record: Record | None, now: float | None = None) -> bool:
    """Whether a copy may still be served: there is one, and it is not past
    its product's own validity."""
    if record is None:
        return False
    return record.until is None or (time.time() if now is None else now) < record.until


_ASKED = {"at": 0.0}


def mark_asked() -> None:
    """The planner is planning: the service fetches at its full pace for a
    while (last_asked). At most once every ASKED_EVERY_S; a store the
    planner cannot write to is left alone, the service then keeping its
    slow pace."""
    now = time.time()
    if now - _ASKED["at"] < ASKED_EVERY_S:
        return
    _ASKED["at"] = now
    try:
        path = store_dir() / "asked"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.touch()
        os.utime(path, (now, now))
    except OSError:
        pass


def last_asked() -> float:
    """When the planner last said it was planning (UNIX s); 0 if never."""
    try:
        return (store_dir() / "asked").stat().st_mtime
    except FileNotFoundError:
        return 0.0
