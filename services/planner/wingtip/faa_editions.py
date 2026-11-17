"""The planner's FAA files fetched again when the FAA has a newer edition:
a NASR cycle every 28 days, the obstacle file every 56. wingtip.faa_data
downloads a file that is missing; this keeps the ones there current."""

import csv
import json
import logging
import os
import tempfile
from pathlib import Path

from . import apra, faa_data

log = logging.getLogger(__name__)


# The zips the files above come in, for a new edition of each (refresh):
# its files and the table its link is found by (nasr_zip_url). A zip's files
# are refreshed together -- APT_BASE was a cycle
# behind APT_RMK and APT_RWY_END from the same zip, each fetched when it
# went missing (2026-10-07).
_EDITIONS = {
    "NAV_CSV": (("NAV_BASE.csv", "NAV_RMK.csv"), "NAV"),
    "APT_CSV": (("APT_BASE.csv", "APT_RMK.csv", "APT_RWY_END.csv", "APT_RWY.csv", "APT_CON.csv"), "APT"),
    "FIX_CSV": (("FIX_BASE.csv",), "FIX"),
    "FRQ_CSV": (("FRQ.csv",), "FRQ"),
    "AWY_CSV": (("AWY_SEG_ALT.csv",), "AWY"),
    # The Class B, C and D shapes (wingtip.airspace), from the same cycle.
    # The .shp last, which wingtip.airspace keys its parse on: its
    # companions are in place before it.
    "Class_Airspace": (
        ("Shape_Files/Class_Airspace.shx", "Shape_Files/Class_Airspace.dbf", "Shape_Files/Class_Airspace.shp"),
        "Class_Airspace",
    ),
    # The obstacles, on their own 56-day edition and page.
    "DOF": (("DOF.DAT",), "DOF"),
}
# Which edition each file on disk is, by the link it came from (the
# FAA's links name their cycle: ".../01_Oct_2026_NAV_CSV.zip").
_EDITIONS_FILE = "editions.json"


def _editions_on_disk(cache_dir: Path) -> dict:
    try:
        return json.loads((cache_dir / _EDITIONS_FILE).read_text())
    except (OSError, ValueError):
        return {}


def _effective_date(path: Path) -> str | None:
    """A NASR CSV's own cycle, its first row's EFF_DATE ("2026/10/01")."""
    try:
        with open(path, newline="", encoding="utf-8", errors="replace") as f:
            return next(csv.DictReader(f)).get("EFF_DATE")
    except (OSError, StopIteration):
        return None


def refresh_editions(cache_dir) -> list[str]:
    """Each of the planner's FAA zips fetched again where the FAA has a
    newer edition than the one on disk -- a NASR cycle every 28 days, the
    obstacle file every 56 -- its files put in place whole, one by one,
    and the names refreshed. They were fetched only when missing, and
    went on being read cycles old: the navaids two cycles, the airports
    one (2026-10-07). Every reader of them keys its cache by the file's
    mtime (wingtip.fixes, wingtip.airspace, wingtip.remarks, wingtip.pattern and this
    module's), so a refreshed file is read again where it is next asked
    for. A zip whose download fails is left as it was, for the next
    check. A file on disk with no record of its edition is taken as the
    current one where its own EFF_DATE says so, rather than fetched again."""
    cache_dir = Path(cache_dir)
    on_disk = _editions_on_disk(cache_dir)
    nasr = apra.nasr_cycle()
    cycle = nasr.strftime("%Y/%m/%d")
    refreshed = []
    for key, (names, table) in _EDITIONS.items():
        try:
            url = faa_data.nasr_zip_url(table, nasr)
            paths = [cache_dir / name for name in names]
            if on_disk.get(key) == url and all(p.exists() for p in paths):
                continue
            if table not in ("DOF", "Class_Airspace") and all(_effective_date(p) == cycle for p in paths):
                on_disk[key] = url
                continue
            with tempfile.TemporaryDirectory(dir=cache_dir, prefix=".edition-") as staging:
                faa_data.download_and_extract(url, Path(staging), only={Path(name).name for name in names})
                for name in names:
                    fresh = next(Path(staging).rglob(Path(name).name), None)
                    if fresh is None:
                        raise RuntimeError(f"{name} is not in {url}")
                    (cache_dir / name).parent.mkdir(parents=True, exist_ok=True)
                    os.replace(fresh, cache_dir / name)
            on_disk[key] = url
            refreshed.extend(names)
            log.info("FAA %s refreshed from %s", key, url)
        except Exception:  # noqa: BLE001 -- one edition failing leaves the rest to refresh, and itself to the next check
            log.warning("FAA %s not refreshed", key, exc_info=True)
    (cache_dir / _EDITIONS_FILE).write_text(json.dumps(on_disk, indent=1, sort_keys=True))
    return refreshed
