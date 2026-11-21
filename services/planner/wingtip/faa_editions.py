"""The planner's FAA files fetched again when the FAA has a newer edition:
a NASR cycle every 28 days, the obstacle file every 56. wingtip.faa_data
downloads a file that is missing; this keeps the ones there current.

The next NASR cycle is fetched ahead, in its week before 0901Z on its date
(the FAA puts the subscription up 28 days ahead, as its "preview"), into a
folder of its own beside the files in use; at the check after 0901Z
(app.warm_up runs one at 0902Z every day) each zip's files are moved into
place from there, all within a moment, with nothing to download. Fetched
only after 0901Z, one zip at a time, the planner read up to six hours of the
old cycle, then a mix of the two while the zips came in, and the old one
for good where the FAA did not answer that morning."""

import csv
import json
import logging
import os
import shutil
import tempfile
from datetime import date
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
    # Each field's Class B, C and D surface area hours (AIRSPACE), which
    # wingtip.field_details reads: fetched once when missing and never
    # again, it kept a part-time tower's old hours past every cycle.
    "CLS_ARSP_CSV": (("CLS_ARSP.csv",), "CLS_ARSP"),
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


#: How many days before the next NASR cycle's 0901Z it is fetched ahead.
LEAD_DAYS = 7
#: The tables on the NASR cycle, fetched ahead: the DOF is on its own.
_ON_NASR = tuple(key for key, (_, table) in _EDITIONS.items() if table != "DOF")


def _staging(cache_dir: Path, cycle) -> Path:
    """Where a NASR cycle fetched ahead waits for its 0901Z."""
    return cache_dir / f".next-{cycle.isoformat()}"


def _take(url: str, names: tuple, into: Path) -> None:
    """A zip's files downloaded and put in `into` whole, one by one."""
    with tempfile.TemporaryDirectory(dir=into, prefix=".edition-") as staging:
        faa_data.download_and_extract(url, Path(staging), only={Path(name).name for name in names})
        for name in names:
            fresh = next(Path(staging).rglob(Path(name).name), None)
            if fresh is None:
                raise RuntimeError(f"{name} is not in {url}")
            (into / name).parent.mkdir(parents=True, exist_ok=True)
            os.replace(fresh, into / name)


def _staged(cache_dir: Path, cycle) -> dict:
    try:
        return json.loads((_staging(cache_dir, cycle) / _EDITIONS_FILE).read_text())
    except (OSError, ValueError):
        return {}


def stage_next(cache_dir, now=None) -> list[str]:
    """The next NASR cycle's zips fetched ahead into their own folder once
    its lead (LEAD_DAYS before 0901Z on its date) has begun, each one not
    there yet; older folders removed. The keys fetched."""
    from . import data_cycles

    cache_dir = Path(cache_dir)
    answer = data_cycles.cycle("airac", None, now)
    upcoming = date.fromisoformat(answer["next"])
    for old in cache_dir.glob(".next-*"):
        if old != _staging(cache_dir, upcoming):
            shutil.rmtree(old, ignore_errors=True)
    if (upcoming - (now or data_cycles.now()).date()).days > LEAD_DAYS:
        return []
    folder = _staging(cache_dir, upcoming)
    folder.mkdir(exist_ok=True)
    staged, fetched = _staged(cache_dir, upcoming), []
    for key in _ON_NASR:
        names, table = _EDITIONS[key]
        url = faa_data.nasr_zip_url(table, upcoming)
        if staged.get(key) == url and all((folder / n).exists() for n in names):
            continue
        try:
            _take(url, names, folder)
        except Exception:  # noqa: BLE001 -- not up yet, or the FAA not answering: the next check tries again
            log.info("FAA %s of %s not fetched ahead yet", key, upcoming, exc_info=True)
            continue
        staged[key] = url
        fetched.append(key)
    (folder / _EDITIONS_FILE).write_text(json.dumps(staged, indent=1, sort_keys=True))
    return fetched


def stage_next_cifp(now=None, lead_days: int = LEAD_DAYS) -> Path | None:
    """The next AIRAC cycle's CIFP fetched into its own folder in its lead
    (`lead_days` before 0901Z on its date), so the procedures turn over at
    0901Z with nothing to fetch: the 53 MB was downloaded under the first
    pilot's request after the change, and where the FAA did not answer
    that morning the old cycle was used. Cycles before the one in force's
    predecessor are removed. None outside the lead, or where it cannot be
    had yet (tried again at the next check)."""
    from . import data_cycles, procedures
    from .procedures import CIFP_FILE

    answer = data_cycles.cycle("airac", None, now)
    start, upcoming = date.fromisoformat(answer["current"]), date.fromisoformat(answer["next"])
    for old in procedures.CIFP_DIR.glob(f"*/{CIFP_FILE}"):
        day = data_cycles.cifp_effective(old.parent.name)
        if day and day < start - (upcoming - start):
            shutil.rmtree(old.parent, ignore_errors=True)
    day = (now or data_cycles.now()).date()
    if (upcoming - day).days > lead_days:
        return None
    folder = procedures.CIFP_DIR / f"{upcoming:%y%m%d}"
    if not (folder / CIFP_FILE).exists():
        try:
            with procedures._LOCK:  # noqa: SLF001 -- the one lock on the CIFP's folders
                procedures._fetch(apra.cifp_url(upcoming) or procedures.CIFP_URL.format(start=upcoming), folder)  # noqa: SLF001
        except RuntimeError:
            log.info("The CIFP for %s is not up yet", upcoming, exc_info=True)
            return None
    return folder / CIFP_FILE


def refresh_editions(cache_dir) -> list[str]:
    """Each of the planner's FAA zips fetched again where the FAA has a
    newer edition than the one on disk -- a NASR cycle every 28 days, the
    obstacle file every 56 -- its files put in place whole, one by one,
    and the names refreshed: from the cycle fetched ahead where it is there
    (`stage_next`), else downloaded. They were fetched only when missing, and
    went on being read cycles old: the navaids two cycles, the airports
    one (2026-10-07). Every reader of them keys its cache by the file's
    mtime (wingtip.fixes, wingtip.airspace, wingtip.remarks, wingtip.pattern and this
    module's), so a refreshed file is read again where it is next asked
    for. A zip whose download fails is left as it was, for the next
    check, and the Status page says the edition is out of date
    (wingtip.data_cycles). A file on disk with no record of its edition is
    taken as the current one where its own EFF_DATE says so, rather than
    fetched again."""
    cache_dir = Path(cache_dir)
    on_disk = _editions_on_disk(cache_dir)
    nasr = apra.nasr_cycle()
    cycle = nasr.strftime("%Y/%m/%d")
    ahead, staged = _staging(cache_dir, nasr), _staged(cache_dir, nasr)
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
            if staged.get(key) == url and all((ahead / name).exists() for name in names):
                for name in names:
                    (cache_dir / name).parent.mkdir(parents=True, exist_ok=True)
                    os.replace(ahead / name, cache_dir / name)
            else:
                _take(url, names, cache_dir)
            on_disk[key] = url
            refreshed.extend(names)
            log.info("FAA %s refreshed from %s", key, url)
        except Exception:  # noqa: BLE001 -- one edition failing leaves the rest to refresh, and itself to the next check
            log.warning("FAA %s not refreshed", key, exc_info=True)
    (cache_dir / _EDITIONS_FILE).write_text(json.dumps(on_disk, indent=1, sort_keys=True))
    return refreshed
