"""A region's chart cut out of the cycle's archives, for a phone to keep
and fly with no signal: one PMTiles archive per kind and density
(sec.pmtiles, sec@2x.pmtiles), holding every tile of that kind whose
square touches the region's boxes at every zoom the kind is drawn at.

The cut reads the planner's own archives (wingtip.tile_archive, one per
kind and density of a cycle) a tile at a time and writes the region's
with the same writer, in Python: the `pmtiles` package's primitives the
charts job already packs with, so no go-pmtiles binary is needed in the
planner's image. A tile's bytes are copied as they are, the 512-pixel
tiles at 2x, so a phone's map draws exactly what the planner serves.

Cut on the first ask and kept on disk beside the cycle it came from
(<tiles>/<cycle>/offline/<region>/<archive>.pmtiles), so it goes with
that cycle when the cycle is pruned (wingtip.charts.prune_cycles); the
sizes are worked out from the archives' directories alone and kept too.
The archives must be on this disk: read over HTTP from a published copy
(CHART_TILES_URL) a tile at a time, a state's cut would take hours, so a
cloud deployment cuts them in the charts job instead.
"""

from __future__ import annotations

import json
import logging
import re
import threading
from datetime import date
from pathlib import Path

from pmtiles.tile import zxy_to_tileid

from . import charts, data_cycles, tile_archive
from .atomic import atomic_path
from .geo import tile_xy
from .offline_regions import Region

log = logging.getLogger(__name__)

_ARCHIVE = re.compile(r"(sec|tac|ifr_low|ifr_high|ifr_area)(?:@(2)x)?")
_CYCLE = re.compile(r"\d{2}-\d{2}-\d{4}")
#: What PMTiles' directories cost a tile, about: a varint-coded entry,
#: gzipped. The estimate adds it to the tiles' own bytes.
_DIRECTORY_BYTES_PER_TILE = 3
_ESTIMATES = "estimates.json"

_locks: dict[str, threading.Lock] = {}
_locks_lock = threading.Lock()


def parse_archive(name: str) -> tuple[charts.ChartKind, int] | None:
    """An archive's name ("sec", "sec@2x") as its kind and density."""
    match = _ARCHIVE.fullmatch(name)
    return (charts.KINDS[match[1]], int(match[2] or 1)) if match else None


def _source(cycle: str, kind: charts.ChartKind, scale: int):
    if not _CYCLE.fullmatch(cycle):
        return None
    return tile_archive.on_disk(charts._archive_path(kind.key, cycle, scale))  # noqa: SLF001 -- the archive's one home


def archives_of(cycle: str) -> list[str]:
    """The archives a cycle has on this disk, by name, kind by kind."""
    return [
        tile_archive.archive_name(kind.key, scale).removesuffix(".pmtiles")
        for kind in charts.KINDS.values()
        for scale in charts.TILE_SCALES
        if _source(cycle, kind, scale) is not None
    ]


def cycles() -> tuple[str | None, str | None]:
    """The cycle the map draws now, and the next one where it is on disk
    ahead of its date (wingtip.chart_next draws it days early): a phone
    can keep the next edition before the changeover and turn over on its
    date. Either is None where no sectional archive of it is on disk."""

    def sectional(c):
        return any(_source(c, charts.SECTIONAL, scale) for scale in charts.TILE_SCALES)

    now = charts.serving_cycle()
    current = now if sectional(now) else None
    ahead = [
        c
        for c in charts._cycles_on_disk(charts.CHART_TILE_CACHE_DIR)  # noqa: SLF001
        if not charts.in_force(c) and sectional(c)
    ]
    return current, (ahead[-1] if ahead else None)


def expires(cycle: str) -> date | None:
    """The day the cycle's charts are replaced (the engine's data_cycle on
    the 56-day chart schedule), when a phone's kept copy of it goes."""
    effective = data_cycles.chart_effective(cycle)
    if effective is None:
        return None
    ends = data_cycles.cycle("chart", effective)["expires"]
    return date.fromisoformat(ends) if ends else None


def tiles(region: Region, kind: charts.ChartKind):
    """(z, x, y) of every tile of `kind`'s zooms whose square touches one
    of the region's boxes, in tile-id order."""
    found = set()
    for z in range(kind.min_zoom, kind.max_zoom + 1):
        n = 2**z
        for west, south, east, north in region.boxes:
            x0, y0 = tile_xy(min(85.05, north), west, z)
            x1, y1 = tile_xy(max(-85.05, south), east, z)
            for x in range(max(0, int(x0)), min(n - 1, int(x1)) + 1):
                for y in range(max(0, int(y0)), min(n - 1, int(y1)) + 1):
                    found.add((z, x, y))
    return sorted(found, key=lambda t: zxy_to_tileid(*t))


def _held(source, region: Region, kind: charts.ChartKind) -> list[tuple[int, int, int, int, int]]:
    """The region's tiles the source archive holds: (z, x, y, offset, length)."""
    out = []
    data = source.header["tile_data_offset"]
    for z, x, y in tiles(region, kind):
        entry = source._entry(zxy_to_tileid(z, x, y))  # noqa: SLF001 -- the directory's own lookup
        if entry is not None:
            out.append((z, x, y, data + entry.offset, entry.length))
    return out


def _folder(cycle: str, region: Region) -> Path:
    return charts.CHART_TILE_CACHE_DIR / cycle / "offline" / region.id


def _lock(key: str) -> threading.Lock:
    with _locks_lock:
        return _locks.setdefault(key, threading.Lock())


def estimate(cycle: str, region: Region, archive: str) -> dict | None:
    """How many tiles and about how many bytes the region's cut of one
    archive holds, from the source's directory alone; kept per cycle.
    None where the cycle has no such archive on this disk."""
    parsed = parse_archive(archive)
    source = parsed and _source(cycle, *parsed)
    if source is None:
        return None
    key = f"{region.id}/{archive}"
    known = _estimates(cycle, key)
    if known is not None:
        return known
    held = _held(source, region, parsed[0])
    size = sum(t[4] for t in held) + (len(held) * _DIRECTORY_BYTES_PER_TILE + 1024 if held else 0)
    return _remember(cycle, key, {"tiles": len(held), "bytes": size, "exact": False})


_warming: set = set()


def known_sizes(cycle: str, region: Region) -> dict[str, int]:
    """The bytes of each of the region's archives already worked out, by
    archive name: what the list shows beside a region without waiting."""
    kept = _estimates(cycle)
    prefix = f"{region.id}/"
    return {key.removeprefix(prefix): value["bytes"] for key, value in kept.items() if key.startswith(prefix) and value["tiles"]}


def warm(cycle: str, regions: list[Region]) -> None:
    """Every region's every archive estimated in the background, once a
    cycle, so the list has its sizes by the next look (about a minute for
    the 108 regions and the cycle's archives, Alaska the longest)."""
    with _locks_lock:
        if cycle in _warming:
            return
        _warming.add(cycle)

    def run():
        for region in regions:
            for archive in archives_of(cycle):
                try:
                    estimate(cycle, region, archive)
                except Exception:  # noqa: BLE001 -- one region's failure leaves the rest to be listed
                    log.exception("%s %s %s: no estimate", cycle, region.id, archive)

    threading.Thread(target=run, name=f"offline-sizes-{cycle}", daemon=True).start()


def region_archives(cycle: str, region: Region) -> list[dict]:
    """Each archive of the cycle the region has tiles of: its name, kind,
    density and estimate."""
    out = []
    for archive in archives_of(cycle):
        sized = estimate(cycle, region, archive)
        if sized and sized["tiles"]:
            kind, scale = parse_archive(archive)
            out.append({"archive": archive, "kind": kind.key, "scale": scale, **sized})
    return out


def packs_for(region: Region, index: dict | None) -> list[dict]:
    """The phone's cycle packs (wingtip.cycle_pack's write_phone) whose
    region touches the region's boxes: the airspace and places that go
    with its chart for flying with no signal."""
    if not index:
        return []
    return [
        p
        for p in index["regions"]
        if any(p["west"] < e and w < p["east"] and p["south"] < n and s < p["north"] for w, s, e, n in region.boxes)
    ]


def _estimates_file(cycle: str) -> Path:
    return charts.CHART_TILE_CACHE_DIR / cycle / "offline" / _ESTIMATES


def _estimates(cycle: str, key: str | None = None):
    try:
        kept = json.loads(_estimates_file(cycle).read_text())
    except (OSError, ValueError):
        kept = {}
    return kept if key is None else kept.get(key)


def _remember(cycle: str, key: str, value: dict) -> dict:
    """One estimate kept in the cycle's file, the file written whole."""
    path = _estimates_file(cycle)
    with _lock(str(path)):
        kept = _estimates(cycle)
        kept[key] = value
        with atomic_path(path) as part:
            part.write_text(json.dumps(kept))
    return value


def cut(cycle: str, region: Region, archive: str) -> Path | None:
    """The region's archive of `archive` for the cycle, cut now where it
    has not been; None where the cycle has no such archive on this disk,
    or the region has no tile of it (an IFR area chart over a state with
    none)."""
    parsed = parse_archive(archive)
    source = parsed and _source(cycle, *parsed)
    if source is None:
        return None
    path = _folder(cycle, region) / f"{archive}.pmtiles"
    with _lock(str(path)):
        if path.is_file():
            return path
        kind, scale = parsed
        held = _held(source, region, kind)
        metadata = {
            **charts._archive_metadata(kind, cycle, scale),  # noqa: SLF001 -- the archives' own words
            "region": region.id,
            "region_name": region.name,
            "bounds": [list(b) for b in region.boxes],
        }
        count = tile_archive.write(
            path,
            ((z, x, y, length, (lambda o=offset, n=length: bytes(source.get_bytes(o, n)))) for z, x, y, offset, length in held),
            metadata,
        )
        if not count:
            return None
        size = path.stat().st_size
        _remember(cycle, f"{region.id}/{archive}", {"tiles": count, "bytes": size, "exact": True})
        log.info("%s %s %s: %d tiles cut, %d bytes", cycle, region.id, archive, count, size)
        return path
