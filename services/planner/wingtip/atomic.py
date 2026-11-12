"""A file written whole or not at all: the one way wingtip and the services
on its base image (ingest, weather, jobs) put a file in place.

The planner and the jobs write into the same data folder, often the same
file, so the half-written copy needs a name no other writer will pick:
a fixed `x.tmp` let one process's rename move the other's half-written
bytes into place (the stock audit of 2026-11-12). The stdlib does it in
four steps -- mkstemp beside the target, fsync, os.replace, unlink on
failure -- which is all a library would add (the audit turned down
`safer`, one maintainer, and `atomicwrites`, unmaintained)."""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


@contextmanager
def atomic_path(path: str | os.PathLike, *, suffix: str = ".part", mode: int = 0o644, durable: bool = True) -> Iterator[Path]:
    """A new empty file beside `path`, for the caller to write by any means
    (write_bytes, sqlite3, a zip, a Parquet writer), which becomes `path`
    when the block ends without an error and is deleted when it raises.

    The temporary name starts with a dot and ends in `suffix`, so a glob
    for the finished files (`*.parquet`, `*.json`) never takes one up; a
    writer that picks its format from the name gets one by `suffix`. Its
    contents are flushed to the disk before the rename, so a power cut
    leaves the old file or the new one, never an empty name; a cache that
    would only draw the file again passes durable=False and skips the
    flush, which is a disk's round trip a file. `mode` is
    the file's permission: mkstemp's own 0600 would hide it from the
    other services, which run as other users."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=suffix)
    os.close(fd)
    part = Path(name)
    try:
        yield part
        if durable:
            with open(part, "rb") as written:
                os.fsync(written.fileno())
        os.chmod(part, mode)
        os.replace(part, path)
    except BaseException:
        part.unlink(missing_ok=True)
        raise
