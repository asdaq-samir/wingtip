"""Which edition of each FAA data set the planner is using, and whether
it is still in force. Every one is published on a cycle and replaced at
the next -- NASR and the CIFP every 28 days (AIRAC), the charts and the
obstacle file every 56 -- and an old one reads as if nothing were wrong:
a frequency changed, an airspace redrawn, a procedure amended. Where a
refresh is off (production draws no charts, CHARTS_AUTO_REFRESH=0) or
fails, only this says so. The rule -- the cycles and their dates -- is the engine's
(`data_cycle`, engine/crates/weather/src/cycles.rs, from the FAA's "28 and
56 Day Product Schedule" and its DOF page); this module only finds what
edition each file on disk is.

Warn, never limit (the owner, 2026-10-23): an edition past its cycle is
still used, and said to be out of date -- to the pilot on the Status page,
the map's settings and the Brief, to the owner in the log and the Dev
console's status.
"""

import json
import logging
import re
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


from . import utc
from wingtip.engine import ask as engine

log = logging.getLogger(__name__)


def now() -> datetime:
    """The UTC time the editions are held against: the FAA's editions change
    on UTC dates, an AIRAC or charting one at 0901Z on its date. One place,
    for a test to set the clock."""
    return datetime.now(tz=timezone.utc)


def _on(on: date | datetime | None) -> str:
    """What the engine is asked `on`: a datetime (now, by default) as a UTC
    time, exact to the 0901Z an edition takes over at; a date alone as the
    day, the whole of it the new edition's (the engine's simplification
    toward the safe side, for a caller that has only a day)."""
    on = now() if on is None else on
    if isinstance(on, datetime):
        # A time with no zone is taken as UTC, as the FAA's dates are.
        on = on.replace(tzinfo=timezone.utc) if on.tzinfo is None else on.astimezone(timezone.utc)
        return on.strftime("%Y-%m-%dT%H:%M:%SZ")
    return on.isoformat()


def cycle(kind: str, effective: date | None = None, on: date | datetime | None = None) -> dict:
    """The engine's `data_cycle`: the edition named `effective` of a data
    set on `kind`'s schedule ("airac", "chart" or "dof") held against `on`
    (now, to the minute: before 0901Z on a changeover day the old edition is
    still the one in force, from 0901Z the new one)."""
    asked = {"kind": kind, "effective": effective.isoformat() if effective else None, "on": _on(on)}
    return engine("data_cycle", **asked)


def start_on(kind: str, on: date | datetime | None = None) -> date:
    """The day the edition in force at `on` (now) took effect."""
    return date.fromisoformat(cycle(kind, None, on)["current"])


def began_at(kind: str, on: date | datetime | None = None) -> float:
    """When the edition in force at `on` (now) took over, Unix seconds: one
    cycle before the engine's `next_at`."""
    answer = cycle(kind, None, on)
    takes_over = utc.parse(answer["next_at"])
    return (takes_over - timedelta(days=answer["cycle_days"])).timestamp()


def fresh_s(kind: str, hold_s: float) -> float:
    """How old a read of a data set that names no edition may be and still
    be used: `hold_s`, and never from before the edition in force took over
    (0901Z on its date). The special-use areas (wingtip.sua) were held a day
    by age alone: a set read at 0800Z on a changeover day was served until
    0800Z the next, past 14 CFR part 73's amendments at 0901Z."""
    return min(hold_s, time.time() - began_at(kind))


def has_begun(kind: str, effective: date | None, on: date | datetime | None = None) -> bool:
    """Whether the edition named `effective` has taken effect by `on` (now):
    a staged next edition has not until 0901Z on its date. One named by no
    date counts as begun."""
    return effective is None or cycle(kind, effective, on)["state"] != "not_yet"


def _day(text: str | None, pattern: str, fmt: str) -> date | None:
    match = re.search(pattern, text or "")
    if not match:
        return None
    try:
        return datetime.strptime(match.group(0), fmt).date()
    except ValueError:
        return None


def chart_effective(cycle_name: str | None) -> date | None:
    """A chart cycle's folder name ("10-29-2026") as its day."""
    return _day(cycle_name, r"\d{2}-\d{2}-\d{4}", "%m-%d-%Y")


def nasr_effective(text: str | None) -> date | None:
    """A NASR CSV's EFF_DATE ("2026/10/29") as its day."""
    return _day(text, r"\d{4}/\d{2}/\d{2}", "%Y/%m/%d")


def cifp_effective(name: str | None) -> date | None:
    """A CIFP cycle's name ("261029", its folder) as its day."""
    return _day(name, r"\d{6}", "%y%m%d")


def dof_effective(url: str | None) -> date | None:
    """The DOF's zip ("DOF_260927.zip", the last day of the changes it
    holds) as that day; the engine adds the two days to its release."""
    match = re.search(r"DOF_(\d{6})\.zip", url or "")
    return _day(match.group(1), r"\d{6}", "%y%m%d") if match else None


def entry(key: str, name: str, kind: str, effective: date | None, on: date | datetime | None = None) -> dict:
    """One data set's line: what it is, the edition held and the engine's
    answer for it."""
    answer = cycle(kind, effective, on)
    return {
        "key": key,
        "name": name,
        "kind": kind,
        "edition": effective.isoformat() if effective else None,
        "effective": answer["effective"],
        "expires": answer["expires"],
        "current": answer["current"],
        "state": answer["state"],
        "behind": answer["behind"],
    }


def _nasr_edition(cache_dir: Path) -> date | None:
    """The oldest of the NASR files' own editions on disk: every CSV the
    planner reads (each one's EFF_DATE) and the Class B, C and D shapes (by
    the link they came from, editions.json). They come from separate zips
    (wingtip.faa_editions's _EDITIONS), and one left behind -- the Class D
    hours in CLS_ARSP.csv, the airway MEAs -- is enough to be wrong."""
    from .faa_editions import _EDITIONS, _effective_date

    days = [
        nasr_effective(_effective_date(cache_dir / name))
        for names, table in _EDITIONS.values()
        if table not in ("DOF", "Class_Airspace")
        for name in names
        if (cache_dir / name).exists()
    ]
    try:
        shapes = json.loads((cache_dir / "editions.json").read_text()).get("Class_Airspace")
    except (OSError, ValueError, AttributeError):
        shapes = None
    days.append(_day(shapes, r"\d{4}-\d{2}-\d{2}", "%Y-%m-%d"))
    days = [d for d in days if d]
    return min(days) if days else None


def _dof_edition(cache_dir: Path) -> date | None:
    """The DOF on disk, by the link it came from (editions.json)."""
    try:
        return dof_effective(json.loads((cache_dir / "editions.json").read_text()).get("DOF"))
    except (OSError, ValueError, AttributeError):
        return None


def _cifp_edition() -> date | None:
    """The CIFP on disk that /api/procedures reads now: the newest of a
    cycle already begun. The newest on disk alone was a staged next cycle's
    in its week ahead, and said "not yet" of the file in use."""
    from . import procedures

    held = procedures.held_before(procedures.cifp_start())
    return cifp_effective(held.parent.name) if held else None


def _charts_edition() -> str | None:
    """The cycle the map draws, from disk or the held answer only
    (chart_serving.serving_cycle can fetch, and this is polled): the oldest
    of the kinds' newest complete pyramids in force, as each kind goes over
    to a new cycle when its own pass finishes (chart_serving.serving_cycle_of),
    so an IFR chart still on the old cycle beside new sectionals is said.
    None when there is none, as the cloud pointer is not read here: a row
    that would only say the FAA's current cycle is in force says nothing."""
    from . import chart_cycle, chart_kinds, chart_serving, config

    try:
        held = chart_serving.held_serving_cycle()
        if config.CHART_TILES_URL and held:
            return held
        on_disk = chart_cycle.cycles_on_disk(config.CHART_TILE_CACHE_DIR)
        served = [
            next((c for c in on_disk if chart_cycle.in_force(c) and chart_serving.pyramid_complete(c, (kind,))), None)
            for kind in chart_kinds.KINDS
        ]
        served = [c for c in served if c]
        return min(served, key=chart_effective) if served else None
    except Exception:  # noqa: BLE001 -- the status of the others is still worth having
        log.warning("chart cycle unknown", exc_info=True)
        return None


def status(on: date | datetime | None = None) -> list[dict]:
    """Each FAA data set the planner uses, with its edition and whether it
    is in force (now, to the minute). Reads only what is on disk -- never the network --
    and a set with nothing on disk yet is left out: it is fetched when
    first asked for, the current one. The charts row needs a complete
    pyramid on disk. The d-TPP and the Chart Supplement
    are not here: they are fetched for the cycle in force on the day they
    are asked for (wingtip.publications), never kept past it."""
    from . import phone_pack, sua
    from .terrain import DEFAULT_FAA_CACHE_DIR

    out = []
    for base in (DEFAULT_FAA_CACHE_DIR, DEFAULT_FAA_CACHE_DIR.parent):
        if (base / "APT_BASE.csv").exists():
            out.append(entry("nasr", "Airports, frequencies and navaids", "airac", _nasr_edition(base), on))
            break
    served = _charts_edition()
    if served:
        out.append(entry("charts", "Charts", "chart", chart_effective(served), on))
    cifp = _cifp_edition()
    if cifp:
        out.append(entry("cifp", "Procedures", "airac", cifp, on))
    for base in (DEFAULT_FAA_CACHE_DIR, DEFAULT_FAA_CACHE_DIR.parent):
        if (base / "DOF.DAT").exists():
            out.append(entry("dof", "Obstacles", "dof", _dof_edition(base), on))
            break
    # The special-use areas are read from the FAA's feature service, which
    # names no edition: they are of the AIRAC cycle they were read in, and
    # out of date once the next takes over (wingtip.sua reads them again).
    held_sua = sua._CACHE.get("all")  # noqa: SLF001 -- the one record of when they were read
    if held_sua:
        read_in = start_on("airac", datetime.fromtimestamp(held_sua[0], tz=timezone.utc))
        out.append(entry("sua", "Special-use airspace", "airac", read_in, on))
    phone = phone_pack.phone_index()
    if phone and phone.get("cycle"):
        try:
            held = date.fromisoformat(phone["cycle"])
        except ValueError:
            held = None
        out.append(entry("packs", "Offline packs", "airac", held, on))
    return out


_HELD: dict = {"until": 0.0, "entries": None}
#: How long `held` keeps its answer: the map's settings and the Status
#: page ask each minute, and an edition changes once in weeks.
HELD_S = 600


def held() -> list[dict]:
    """`status()` for now, kept HELD_S, and never past the next 0901Z an
    edition changes at: a status worked out at 0855Z on a changeover day
    would otherwise call the old edition in force for ten minutes after."""
    if _HELD["entries"] is None or time.time() >= _HELD["until"]:
        entries = status()
        changes = [utc.epoch(cycle(k)["next_at"]) for k in {e["kind"] for e in entries}]
        _HELD.update(entries=entries, until=min([time.time() + HELD_S, *changes]))
    return _HELD["entries"]


def out_of_date(entries: list[dict]) -> list[dict]:
    """The data sets past their cycle."""
    return [e for e in entries if e["state"] == "expired"]


_warned: dict = {"at": 0.0, "said": ""}
#: How often the same warning goes to the log again: once a day is enough
#: to be seen without filling the log.
WARN_EVERY_S = 24 * 3600


def warn_if_out_of_date(entries: list[dict] | None = None) -> list[dict]:
    """Log a warning for the owner when a data set is past its cycle --
    with the refresh off nothing else fetches a new one -- once a day, or
    at once when what is out of date changes. The data sets out of date."""
    stale = out_of_date(entries if entries is not None else status())
    said = "; ".join(f"{e['name']} ({e['edition']}, ended {e['expires']}, {e['behind']} behind)" for e in stale)
    if said and (said != _warned["said"] or time.time() - _warned["at"] >= WARN_EVERY_S):
        log.warning("FAA data past its cycle, still in use: %s", said)
        _warned.update(at=time.time(), said=said)
    elif not said:
        _warned.update(at=0.0, said="")
    return stale
