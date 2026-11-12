"""A kind's chart tiles at one density as one PMTiles archive: written by
the charts job once its pyramid is complete (wingtip.charts.pack_pyramid),
read a tile at a time by the planner, from the disk or, on AWS, by HTTP
range requests to the published copy.

A cycle's tiles were about 1.4 million loose PNG files under
data/raw/chart_tiles.nosync, and as many objects in S3; one archive per
kind and density is a few dozen files. The format is the overlays' own
(protomaps' PMTiles, spec v3: a header, a directory of tile ids, the
tiles' bytes), through the `pmtiles` package's own primitives -- the
tile ids, the directories and the header. Its Writer is not used: it
spools every tile to a temporary file and copies it on, which for the
sectional's @2x tiles doubled tens of GB on a disk that also holds the
sheets; here the directory is worked out from the tiles' sizes first and
each tile's bytes are written straight into place.

A tile not in a finished archive is no tile: the pyramid draws every
tile any sheet's face touches, so its absence means what a `.none`
marker beside a loose tile means.
"""

from __future__ import annotations

import gzip
import json
import mmap
import threading
from collections import OrderedDict
from pathlib import Path
from collections.abc import Callable, Iterable

from pmtiles.tile import (
    Compression,
    Entry,
    TileType,
    deserialize_directory,
    deserialize_header,
    find_tile,
    serialize_header,
    tileid_to_zxy,
    zxy_to_tileid,
)
from pmtiles.writer import optimize_directories

from .atomic import atomic_path

HEADER_BYTES = 127
#: PMTiles' advice: the header and root directory in the first 16 KB, so
#: one range request reads both.
ROOT_BUDGET = 16384 - HEADER_BYTES


def archive_name(kind_key: str, scale: int = 1) -> str:
    """A kind's archive at one density: sec.pmtiles, sec@2x.pmtiles -- the
    tile names' own @2x."""
    return f"{kind_key}.pmtiles" if scale == 1 else f"{kind_key}@{scale}x.pmtiles"


def write(path: Path, tiles: Iterable[tuple[int, int, int, int, Callable[[], bytes]]], metadata: dict) -> int:
    """The archive of `tiles` -- (z, x, y, length, read), `read` giving
    that many bytes -- written whole to path: beside it first and renamed
    over it, so a reader never meets half of one. Returns how many tiles
    it holds; with none, nothing is written."""
    items = sorted(((zxy_to_tileid(z, x, y), length, read) for z, x, y, length, read in tiles), key=lambda t: t[0])
    if not items:
        return 0
    entries, offset = [], 0
    for tile_id, length, _ in items:
        entries.append(Entry(tile_id, offset, length, 1))
        offset += length
    root, leaves, _ = optimize_directories(entries, ROOT_BUDGET)
    meta = gzip.compress(json.dumps(metadata).encode(), mtime=0)
    first, last = tileid_to_zxy(items[0][0]), tileid_to_zxy(items[-1][0])
    header = {
        "root_offset": HEADER_BYTES,
        "root_length": len(root),
        "metadata_offset": HEADER_BYTES + len(root),
        "metadata_length": len(meta),
        "leaf_directory_offset": HEADER_BYTES + len(root) + len(meta),
        "leaf_directory_length": len(leaves),
        "tile_data_offset": HEADER_BYTES + len(root) + len(meta) + len(leaves),
        "tile_data_length": offset,
        "addressed_tiles_count": len(items),
        "tile_entries_count": len(items),
        "tile_contents_count": len(items),
        "clustered": True,
        "internal_compression": Compression.GZIP,
        "tile_compression": Compression.NONE,
        "tile_type": TileType.PNG,
        "min_zoom": first[0],
        "max_zoom": last[0],
        "center_zoom": first[0],
    }
    with atomic_path(path) as part, open(part, "wb") as out:
        out.write(serialize_header(header))
        out.write(root)
        out.write(meta)
        out.write(leaves)
        for tile_id, length, read in items:
            data = read()
            if len(data) != length:
                raise OSError(f"tile {tileid_to_zxy(tile_id)} changed size while being packed into {path.name}")
            out.write(data)
    return len(items)


class Archive:
    """One archive, read a tile at a time through `get_bytes(offset,
    length)`: its header and directories read once and kept, so a tile
    costs one read of its own bytes."""

    def __init__(self, get_bytes: Callable[[int, int], bytes]):
        self.get_bytes = get_bytes
        self.header = deserialize_header(get_bytes(0, HEADER_BYTES))
        self._dirs: OrderedDict = OrderedDict()
        self._lock = threading.Lock()

    def _directory(self, offset: int, length: int) -> list:
        key = (offset, length)
        with self._lock:
            if key in self._dirs:
                self._dirs.move_to_end(key)
                return self._dirs[key]
        entries = deserialize_directory(self.get_bytes(offset, length))
        with self._lock:
            self._dirs[key] = entries
            while len(self._dirs) > 64:
                self._dirs.popitem(last=False)
        return entries

    def _entry(self, tile_id: int) -> Entry | None:
        offset, length = self.header["root_offset"], self.header["root_length"]
        for _ in range(4):  # PMTiles' deepest directory
            entry = find_tile(self._directory(offset, length), tile_id)
            if entry is None:
                return None
            if entry.run_length:
                return entry
            offset, length = self.header["leaf_directory_offset"] + entry.offset, entry.length
        return None

    def has(self, z: int, x: int, y: int) -> bool:
        """Whether the archive holds the tile, from its directory alone."""
        try:
            return self._entry(zxy_to_tileid(z, x, y)) is not None
        except ValueError:
            return False

    def get(self, z: int, x: int, y: int) -> bytes | None:
        """The tile's bytes, or None where the archive has none."""
        try:
            entry = self._entry(zxy_to_tileid(z, x, y))
        except ValueError:
            return None
        if entry is None:
            return None
        return bytes(self.get_bytes(self.header["tile_data_offset"] + entry.offset, entry.length))

    def tiles(self):
        """Every tile, (z, x, y, length, read), in tile-id order: what
        `write` takes, to write the archive again with some replaced."""

        def walk(offset, length):
            for entry in self._directory(offset, length):
                if entry.run_length == 0:
                    yield from walk(self.header["leaf_directory_offset"] + entry.offset, entry.length)
                    continue
                start = self.header["tile_data_offset"] + entry.offset
                for i in range(entry.run_length):
                    z, x, y = tileid_to_zxy(entry.tile_id + i)
                    yield z, x, y, entry.length, (lambda s=start, n=entry.length: bytes(self.get_bytes(s, n)))

        yield from walk(self.header["root_offset"], self.header["root_length"])


class _File:
    """An archive on disk, mapped, and mapped again when a rewrite has
    renamed a new one over it (its inode changes)."""

    def __init__(self, path: Path):
        self.path = path
        self.key = None
        self.archive: Archive | None = None
        self.lock = threading.Lock()

    def current(self) -> Archive | None:
        try:
            st = self.path.stat()
        except OSError:
            return None
        key = (st.st_ino, st.st_mtime_ns, st.st_size)
        with self.lock:
            if key != self.key:
                with open(self.path, "rb") as f:
                    mapping = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
                self.archive = Archive(lambda offset, length, m=mapping: m[offset : offset + length])
                self.key = key
            return self.archive


_files: dict = {}
_files_lock = threading.Lock()


def on_disk(path: Path) -> Archive | None:
    """The archive at path as it is now, or None where there is none."""
    with _files_lock:
        held = _files.setdefault(str(path), _File(path))
    return held.current()


_remote: dict = {}


def over_http(url: str, session, timeout: float = 10) -> Archive | None:
    """The published archive at url, read by HTTP range requests through
    `session` (requests'), its directories kept; None where it cannot be
    read. A published archive's name changes with its contents
    (wingtip.charts.publish), so what is kept never goes stale."""
    held = _remote.get(url)
    if held is not None:
        return held

    def get_bytes(offset: int, length: int) -> bytes:
        resp = session.get(url, headers={"Range": f"bytes={offset}-{offset + length - 1}"}, timeout=timeout)
        resp.raise_for_status()
        # 206 is the range alone; a server that ignores Range sends 200
        # and the whole file.
        return resp.content[offset : offset + length] if resp.status_code == 200 else resp.content

    try:
        archive = Archive(get_bytes)
    except Exception:  # noqa: BLE001 -- unreachable or not an archive: the tile is drawn here instead
        return None
    _remote[url] = archive
    return archive
