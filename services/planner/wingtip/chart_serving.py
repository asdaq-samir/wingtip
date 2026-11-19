"""Which cycle the map is drawn from, and what each cycle's pyramid holds.

A cycle's pyramid record (pyramid.json beside its tiles: per kind, the
sheets a finished pass rendered, its scales and renderer, and the pass
under way) says when a kind is complete. The map is drawn from the newest
cycle in force whose pyramid is (serving_cycle, serving_cycle_of), or,
where the tiles are published (CHART_TILES_URL), from the cycle the
published pointer names. The cycle's tile revision, which every tile URL
carries, is kept here too.
"""

from __future__ import annotations

import json
import time

import requests
from cachetools import TTLCache

from .config import REQUEST_HEADERS
from . import chart_cycle, chart_grid, chart_render, config
from .chart_coverage import COVERAGE
from .chart_kinds import KINDS


_PYRAMID_STATUS = "pyramid.json"


def write_pyramid_status(cycle: str, record: dict) -> None:
    """One kind's record, written whole: the file beside it and renamed
    over it, so a reader never meets half of one."""
    path = config.CHART_TILE_CACHE_DIR / cycle / _PYRAMID_STATUS
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        data = {}
    data[record["kind"]] = record
    chart_render.write_atomically(path, json.dumps(data, indent=1).encode())
    forget_serving()  # a pass just ended, or began: re-decide what to serve


def _record(kind_key: str, raw: dict) -> dict:
    """A kind's record in the current shape. One written before sheets
    were kept reads as complete once if it said it had finished -- which
    is what it said -- and as a pass under way otherwise."""
    if "sheets" in raw:
        return raw
    finished = raw.get("finished_at")
    return {
        "kind": kind_key,
        "zooms": raw.get("zooms", []),
        "sheets": sorted(COVERAGE.get(kind_key, {})) if finished else [],
        "finished_at": finished,
        "tiles": raw.get("tiles_written", 0),
        "current_pass": None
        if finished or not raw.get("started_at")
        else {
            "started_at": raw["started_at"],
            "done": raw.get("rasters_done", 0),
            "total": raw.get("rasters_total", 0),
            "current": raw.get("current"),
        },
    }


def pyramid_status(cycle: str) -> dict:
    """Per kind, a cycle's pyramid record (the module's docstring) -- what the Dev
    console shows next to the chart list."""
    try:
        raw = json.loads((config.CHART_TILE_CACHE_DIR / cycle / _PYRAMID_STATUS).read_text())
    except (OSError, ValueError):
        return {}
    return {key: _record(key, record) for key, record in raw.items()}


def pyramid_missing(cycle: str, kind_key: str) -> list[str]:
    """The sheets of a kind the FAA publishes that no finished pass of
    this cycle has rendered."""
    rendered = set(pyramid_status(cycle).get(kind_key, {}).get("sheets", []))
    return sorted(set(COVERAGE.get(kind_key, {})) - rendered)


def pyramid_complete(cycle: str, kinds: tuple = tuple(KINDS)) -> bool:
    """Whether every one of `kinds` has a finished pass and every sheet
    the FAA publishes of it rendered."""
    progress = pyramid_status(cycle)
    return all(
        progress.get(k, {}).get("finished_at") and not (set(COVERAGE.get(k, {})) - set(progress[k].get("sheets", []))) for k in kinds
    )


def pyramid_due(cycle: str, kinds: tuple = tuple(KINDS)) -> tuple:
    """The kinds of `kinds` a refresh has to render for `cycle`: those
    not complete, and those last drawn under another RENDERER_VERSION
    (chart_render)."""
    progress = pyramid_status(cycle)
    return tuple(k for k in kinds if not pyramid_complete(cycle, (k,)) or progress[k].get("renderer", 1) != chart_render.RENDERER_VERSION)


_serving_cache: dict = {"value": None, "at": 0.0, "pointer": None}
_SERVING_TTL_S = 60


def serving_cycle() -> str:
    """The cycle the map draws: the newest on disk whose sectional
    pyramid is complete, so a new cycle is served only once every one
    of its tiles is there -- until then the map keeps the previous
    edition, whole, rather than rendering the new one a tile at a
    time. With no complete pyramid at all (a fresh checkout) it is the
    FAA's current cycle, rendered on demand. Where the tiles live in
    the cloud (CHART_TILES_URL) it is whatever the published pointer
    there says. Held for a minute: this is asked once per tile."""
    if _serving_cache["value"] and time.time() - _serving_cache["at"] < _SERVING_TTL_S:
        return _serving_cache["value"]
    pointer = _published_pointer() if config.CHART_TILES_URL else None
    value = pointer and pointer["cycle"]
    value = value or next(
        (c for c in chart_cycle.cycles_on_disk(config.CHART_TILE_CACHE_DIR) if chart_cycle.in_force(c) and pyramid_complete(c, ("sec",))),
        None,
    )
    value = value or chart_cycle.current_cycle()
    _serving_cache.update(value=value, at=time.time(), pointer=pointer)
    return value


_kind_serving: TTLCache = TTLCache(maxsize=8, ttl=_SERVING_TTL_S)


def serving_cycle_of(kind: str) -> str:
    """The cycle a kind of chart is drawn from: the newest on disk whose
    pyramid of that kind is complete, so each kind goes over to a new
    cycle as its own pass finishes, at the owner's pick (2026-10-29: the
    sectionals were done at 15:11 and the IFR charts hours later). Under
    serving_cycle alone, the whole map turned at the sectional's finish
    and a kind still rendering was drawn tile by tile on request from its
    new sheets, beside the refresh's own workers. The sectional's is
    serving_cycle's; with no complete pyramid of the kind on disk, or the
    tiles in the cloud (one published pointer for every kind), it is
    serving_cycle's too. Held for a minute, as that is."""
    if kind == "sec" or config.CHART_TILES_URL:
        return serving_cycle()
    held = _kind_serving.get(kind)
    if held:
        return held
    value = (
        next(
            (
                c
                for c in chart_cycle.cycles_on_disk(config.CHART_TILE_CACHE_DIR)
                if chart_cycle.in_force(c) and pyramid_complete(c, (kind,))
            ),
            None,
        )
        or serving_cycle()
    )
    _kind_serving[kind] = value
    return value


def serving_pointer() -> dict:
    """The published pointer serving_cycle holds beside the cycle it
    names: {} where the tiles are not published or it cannot be read."""
    serving_cycle()
    return _serving_cache.get("pointer") or {}


def held_serving_cycle() -> str | None:
    """The cycle serving_cycle last answered, without asking again (it
    can fetch the pointer): None before it has."""
    return _serving_cache["value"]


def forget_serving() -> None:
    """What is served decided again at the next ask: a pass just began or
    ended, or a cycle was pruned."""
    _serving_cache["at"] = 0.0
    _kind_serving.clear()


def _published_pointer() -> dict | None:
    """The published pyramid's own pointer -- the cycle it names, and the
    scales each kind was drawn at -- or None when it cannot be read (and
    the planner falls back to its disk)."""
    try:
        resp = requests.get(f"{config.CHART_TILES_URL}/serving.json", headers=REQUEST_HEADERS, timeout=5)
        pointer = resp.json() if resp.ok else None
    except (requests.RequestException, ValueError):
        return None
    return pointer if isinstance(pointer, dict) and pointer.get("cycle") else None


def tile_scales(kind: str) -> list[int]:
    """The densities of a kind's tiles the map may ask for (TILE_SCALES):
    those its served pyramid was drawn at, which the map takes the
    high-density tiles from only when 2 is among them. A pyramid drawn
    before there were any, on disk or published (a pointer that does not
    say), has its 256-pixel tiles alone -- and asked for the others, the
    CDN has nothing to answer with and this planner would draw every one
    on request. With no pyramid of the kind at all every tile is drawn
    on request anyway, at any scale."""
    if config.CHART_TILES_URL:
        return sorted((serving_pointer().get("scales") or {}).get(kind, [1]))
    record = pyramid_status(serving_cycle_of(kind)).get(kind)
    if record is None:
        return list(chart_grid.TILE_SCALES)
    return sorted(s for s in record.get("scales", [1]) if s in chart_grid.TILE_SCALES)


# The cycle's tile revision: how many times tiles already served for it
# have been rendered again. The map puts it in every tile URL next to
# the cycle, because a browser holds tiles for weeks (the service
# worker's CacheFirst) under a URL that a re-render does not change --
# which is how one phone went on showing a white sliver down a sheet
# seam for days after the planner had stopped drawing it.
_TILES_REVISION = "revision"


def tiles_revision(cycle: str) -> int:
    """The cycle's revision: the disk's, or where the tiles are published
    (CHART_TILES_URL) the pointer's, which publish writes from the disk's."""
    pointer = serving_pointer() if config.CHART_TILES_URL else {}
    if pointer.get("cycle") == cycle:
        return int(pointer.get("revision") or 0)
    return disk_revision(cycle)


def disk_revision(cycle: str) -> int:
    """The cycle's revision as the disk keeps it, 0 before any."""
    try:
        return int((config.CHART_TILE_CACHE_DIR / cycle / _TILES_REVISION).read_text())
    except (OSError, ValueError):
        return 0


def bump_revision(cycle: str) -> None:
    """The cycle's tile revision one higher, written whole; the callers
    hold the refresh lock, which `publish` takes too."""
    root = config.CHART_TILE_CACHE_DIR / cycle
    root.mkdir(parents=True, exist_ok=True)
    chart_render.write_atomically(root / _TILES_REVISION, str(disk_revision(cycle) + 1).encode())
