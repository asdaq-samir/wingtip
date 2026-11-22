"""The FAA's Airmen Certification Releasable Database, fetched once a month
into the flight instructors' store the planner asks (wingtip.airmen), so
an endorsement counts as signed only where its instructor is a flight
instructor the FAA knows (the engine's instructor_verification).

The FAA puts each month's file up early in the month as
registry.faa.gov/database/CSmmyyyy.zip (CS112026.zip on 2 Nov 2026, the
next due 1 Dec 2026, its download page said on 2026-11-21). Each day this
asks for this month's, then last month's, and builds the store from the
first it finds that it has not built from before; the state file beside
the store keeps the name. The registry's host turns a plain client away,
so it is asked with a browser's headers, as wingtip.registry asks it for
the aircraft.

Run by ingest's history jobs (ingest.history), or by hand:
``python -m ingest.airmen`` (``--force`` to build it again).
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import sys
import tempfile
from pathlib import Path

from wingtip import airmen, outside
from wingtip.registry import HEADERS

log = logging.getLogger(__name__)

URL = "https://registry.faa.gov/database/CS{month:%m%Y}.zip"
#: How long the download may take, s: some 80 MB on a slow line.
DOWNLOAD_TIMEOUT_S = 600.0


def _state_path() -> Path:
    return airmen.store_path().with_suffix(".json")


def months(today: dt.date) -> list[dt.date]:
    """This month's file, then last month's: the newest the FAA may have up."""
    first = today.replace(day=1)
    return [first, (first - dt.timedelta(days=1)).replace(day=1)]


def refresh(force: bool = False, today: dt.date | None = None) -> str | None:
    """The store built from the newest monthly file not built from yet;
    the file's name, or None where there was nothing new."""
    try:
        built = json.loads(_state_path().read_text()).get("built")
    except (OSError, ValueError):
        built = None
    for month in months(today or dt.date.today()):
        url = URL.format(month=month)
        name = url.rsplit("/", 1)[1]
        if name == built and not force and airmen.store_path().exists():
            return None
        resp = outside.get(url, headers=HEADERS, timeout=DOWNLOAD_TIMEOUT_S, stream=True)
        if resp.status_code == 404:
            continue
        resp.raise_for_status()
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / name
            with archive.open("wb") as out:
                for chunk in resp.iter_content(1 << 20):
                    out.write(chunk)
            kept = airmen.build(archive)
        _state_path().write_text(json.dumps({"built": name}))
        log.info("airmen: %d flight instructors from %s", kept, name)
        return name
    log.warning("airmen: neither this month's nor last month's file is up")
    return None


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    refresh(force="--force" in sys.argv)
