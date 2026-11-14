"""The NTSB's aviation database, fetched when the NTSB remakes it and read
into the store the planner asks (wingtip.history.ntsb), for the Studio's
replay of a real flight.

data.ntsb.gov/avdata gives every case since 2008 as one Access database,
avall.zip (97 MB, avall.mdb inside, 564 MB, on 2026-11-12), remade on the
first of each month, and beside it a delta each week, ``upDDMON.zip``
(up01NOV, up08NOV, up15NOV, up22NOV, each made at about 03:00; an
upDDMON.mdb of some 7 MB inside with the same tables, holding the cases
added or changed since). The names have no year: a year's files are
written over the next year's, and the directory's own table says each
file's date and size (``fileName``, ``fileDate``, ``fileSize``; all
checked 2026-11-12, when up15NOV and up22NOV were still 2025's).

The directory is read each day. avall.zip is fetched again only when its
date or size has changed or the store is not built, and read table by
table with mdbtools' mdb-export (github.com/mdbtools/mdbtools, in the
image), whose CSV is streamed into the store, so neither the file nor a
table is ever held in memory. Then each delta dated after it not yet
applied is fetched and written over the store case by case
(wingtip.history.ntsb.apply), oldest first, so a case is there within a
week of the NTSB adding it. The state file beside the store keeps which
avall it was built from and each delta applied since, by name and date,
so each is fetched once; a new avall starts that list again.

mdbtools over the access-parser package (both checked 2026-11-12):
mdbtools is the maintained reader of Jet 4 files (1.0.1 of 2024-12,
packaged by Debian, commits into November 2026), streams each table as
CSV, and reads memo columns (the narratives) whole; access-parser (0.0.6
of 2025-01, a release every year or two) parses a whole table into
memory, which ingest's 384 MB would not hold for the narratives' 135 MB.

Run by ingest's history jobs (ingest.history), or by hand:
``python -m ingest.ntsb`` (``--force`` to build it again from avall.zip).
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
import logging
import re
import subprocess
import sys
import tempfile
import time
import zipfile
from collections.abc import Iterator
from html.parser import HTMLParser
from pathlib import Path

from wingtip import outside
from wingtip.config import REQUEST_HEADERS
from wingtip.history import ntsb

log = logging.getLogger(__name__)

# TODO(2027-04-05): the bulk download moves to NTSB's Enterprise API
# (GetCasesByDateRangeV2, developer.ntsb.gov), as data.ntsb.gov/avdata says.
DIRECTORY_URL = "https://data.ntsb.gov/avdata"
FILE_URL = "https://data.ntsb.gov/avdata/FileDirectory/DownloadFile?fileID={name}"
AVALL = "avall.zip"
#: A weekly delta's name: "up", the day of the month and the month's three letters.
DELTA = re.compile(r"^up\d{2}[A-Z]{3}\.zip$")
#: How long a download may take, s: avall.zip's 97 MB on a slow line.
DOWNLOAD_TIMEOUT_S = 600.0
DIRECTORY_TIMEOUT_S = 30.0


def _state_path() -> Path:
    """What the store holds (the avall it was built from, the deltas
    applied since), beside the store."""
    return ntsb.store_path().with_suffix(".json")


def _state() -> dict:
    try:
        return json.loads(_state_path().read_text())
    except (OSError, ValueError):
        return {}


def _save(state: dict) -> None:
    _state_path().write_text(json.dumps(state))


class _Table(HTMLParser):
    """The directory table's cells, each row's by the ids the page gives
    them (fileName, fileDate, fileSize), read with the standard library's
    HTML parser rather than a regular expression over the markup."""

    def __init__(self) -> None:
        super().__init__()
        self.rows: list[dict[str, str]] = []
        self._cell: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "tr":
            self.rows.append({})
        elif tag == "td" and self.rows:
            self._cell = dict(attrs).get("id")

    def handle_endtag(self, tag: str) -> None:
        if tag == "td":
            self._cell = None

    def handle_data(self, data: str) -> None:
        if self._cell:
            self.rows[-1][self._cell] = self.rows[-1].get(self._cell, "") + data


def read_directory(page: str) -> dict[str, dict]:
    """The directory's files, {name: {"date" (ISO, as the page gives it,
    the NTSB's own clock), "size"}}."""
    table = _Table()
    table.feed(page)
    table.close()
    out = {}
    for row in table.rows:
        try:
            name = row["fileName"].strip()
            when = dt.datetime.strptime(row["fileDate"].strip(), "%m/%d/%Y %I:%M:%S %p")
            size = int(row["fileSize"])
        except (KeyError, ValueError):
            continue
        out[name] = {"date": when.isoformat(), "size": size}
    return out


def directory() -> dict[str, dict]:
    resp = outside.get(DIRECTORY_URL, headers=REQUEST_HEADERS, timeout=DIRECTORY_TIMEOUT_S)
    resp.raise_for_status()
    files = read_directory(resp.text)
    if AVALL not in files:
        raise RuntimeError("data.ntsb.gov/avdata lists no avall.zip")
    return files


def due(avall: dict, state: dict) -> bool:
    """Whether the store is to be made again from avall.zip: none built,
    or the NTSB's file not the one it was built from (its date or size)."""
    return not ntsb.store_path().exists() or state.get("avall") != avall


def deltas_due(files: dict[str, dict], state: dict) -> list[str]:
    """The deltas dated after the avall the store was built from and not
    applied yet, oldest first."""
    after = (state.get("avall") or {}).get("date") or ""
    applied = {f"{d['name']}@{d['date']}" for d in state.get("applied", [])}
    fresh = [(f["date"], name) for name, f in files.items() if DELTA.match(name) and f["date"] > after]
    return [name for date, name in sorted(fresh) if f"{name}@{date}" not in applied]


def _download(name: str, folder: Path) -> Path:
    zipped = folder / name
    with outside.get(FILE_URL.format(name=name), headers=REQUEST_HEADERS, timeout=DOWNLOAD_TIMEOUT_S, stream=True) as resp:
        resp.raise_for_status()
        with zipped.open("wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    with zipfile.ZipFile(zipped) as z:
        member = next(n for n in z.namelist() if n.lower().endswith(".mdb"))
        z.extract(member, folder)
    zipped.unlink()
    return folder / member


def table_rows(mdb: Path, table: str) -> Iterator[dict]:
    """A table's rows as dicts, streamed from mdb-export: dates as
    YYYY-MM-DD, booleans 0 and 1, text as stored."""
    csv.field_size_limit(sys.maxsize)
    proc = subprocess.Popen(["mdb-export", "-D", "%Y-%m-%d", "-T", "%Y-%m-%d", str(mdb), table], stdout=subprocess.PIPE)
    assert proc.stdout is not None
    # newline="" so a narrative's own line breaks inside its quotes stay as written.
    text = io.TextIOWrapper(proc.stdout, encoding="utf-8", errors="replace", newline="")
    try:
        yield from csv.DictReader(text)
    finally:
        text.close()
        if proc.wait() != 0:
            raise RuntimeError(f"mdb-export could not read {table}")


def _read(name: str, write) -> int:
    """`name` fetched, its database read by `write` (ntsb.build or
    ntsb.apply), and both removed: on the data volume beside the store."""
    folder = ntsb.store_path().parent
    folder.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=folder, prefix="ntsb-") as work:
        mdb = _download(name, Path(work))
        return write(lambda table: table_rows(mdb, table))


def refresh(force: bool = False) -> dict:
    """The store brought up to the NTSB's newest: made again from avall.zip
    where it is due (or `force`), then each delta due applied, the state
    saved after each step. What was done: {"built" (aircraft, or None),
    "deltas" (names applied)}."""
    files = directory()
    state = _state()
    built = None
    if force or due(files[AVALL], state):
        built = _read(AVALL, ntsb.build)
        state = {"avall": files[AVALL], "built_at": time.time(), "aircraft": built, "applied": []}
        _save(state)
        log.info("NTSB store made: %d aircraft", built)
    applied = []
    for name in deltas_due(files, state):
        count = _read(name, ntsb.apply)
        state.setdefault("applied", []).append({"name": name, "date": files[name]["date"], "aircraft": count})
        _save(state)
        applied.append(name)
        log.info("NTSB delta %s applied: %d aircraft", name, count)
    return {"built": built, "deltas": applied}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(refresh(force="--force" in sys.argv))
