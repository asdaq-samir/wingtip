"""The chart's lakes and towns read once a cycle, so a new route's read
does not find them again.

A corridor read (app.detection, wingtip.chartvision) was most of a new
route's checkpoints: KOVS->KRGK's 116 nm took 2.2 to 2.6 s of one
processor, 1.3 s of it finding the water and towns in each block
(detect_landmarks), 0.4 to 0.6 s stitching the tiles and 0.5 to 0.7 s
finding where the course crosses rivers and roads (measured 2026-10-28,
the planner's image on two processors). The water and towns are the
chart's, the same for every route; the crossings are the course's, and
are read with it as before.

`python -m app.landmarks build` reads every sectional tile once, in
cells of 32 by 32 zoom-12 tiles (a zoom-7 tile), and keeps each cell's
blobs in a file of its own beside the cycle's tiles, named for the
cycle, its tile revision and the reader's code as a kept read is: a new
edition, tiles rendered again or a change to the reader starts the
cells again, and a cell with its file is done, so a build stopped part
way picks up where it was.

A corridor read then takes a block's blobs from the cells wherever that
gives exactly what reading the block would: the same points, areas and
order, so the read it keeps is the reader's own to the last digit and
the training page, which replays it, cannot tell. That is so for a kind
of blob in a block when none of its blobs there is cut off, by the
corridor's edge or the block's, which the cells know from where each of
their tiles' blobs runs into the next tile. Where it is not so -- a lake
across the corridor's edge, a cell not built -- the block reads that
kind as before."""

import argparse
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from cachetools import LRUCache
from wingtip import chartvision
from wingtip.geo import along_track_distance_nm, cross_track_distance_nm, distance_nm

from .landmark_cells import BITS_PER_KIND, CUT, DOWN, LEFT, RIGHT, TILE_PX, UP, ZOOM, build, cell_of, cell_path, cells_dir

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# A corridor's read, its blobs from the cells
# ---------------------------------------------------------------------------

# Cells as loaded, by path: a few dozen kilobytes each, and a route
# crosses a handful. A missing cell is not remembered, so one built while
# the planner runs is taken up by the next route over it.
_CELLS: LRUCache = LRUCache(maxsize=512)
_CELLS_LOCK = threading.Lock()


def _cell(root: Path, cell: tuple) -> dict | None:
    path = cell_path(root, cell)
    with _CELLS_LOCK:
        if path in _CELLS:
            return _CELLS[path]
    if not path.exists():
        return None
    with np.load(path) as data:
        by_tile: dict = {}
        for kind, lat, lon, pixels, first_y, first_x in zip(
            data["kind"].tolist(),
            data["lat"].tolist(),
            data["lon"].tolist(),
            data["pixels"].tolist(),
            data["first_y"].tolist(),
            data["first_x"].tolist(),
        ):
            gx, gy = (round(v) for v in chartvision.latlon_to_global_px(lat, lon, ZOOM))
            by_tile.setdefault((gx // TILE_PX, gy // TILE_PX), []).append((kind, first_y, first_x, lat, lon, pixels))
        loaded = {"blobs": by_tile, "bits": {(int(x), int(y)): int(b) for x, y, b in data["tiles"]}}
    with _CELLS_LOCK:
        _CELLS[path] = loaded
    return loaded


def _sides(tile: tuple) -> tuple:
    x, y = tile
    return (RIGHT, (x + 1, y)), (DOWN, (x, y + 1)), (LEFT, (x - 1, y)), (UP, (x, y - 1))


def _tiles_to_read(kind: int, block: list, cells: dict) -> set | None:
    """The block's tiles whose blobs of `kind` the cells cannot give as a
    read of the block would find them -- a blob cut off where its cell
    read it, or running on into a tile the block has not got, which the
    block sees cut off there -- with every tile those blobs run on into
    within the block: what is left holds only blobs that are whole in
    the block and kept whole in the cells. None where a tile's cell is
    not built: the whole block is read."""
    if any(cells.get(cell_of(tile)) is None for tile in block):
        return None
    have = set(block)
    shift = kind * BITS_PER_KIND

    def bits(tile):
        return cells[cell_of(tile)]["bits"].get(tile, 0) >> shift

    todo = [tile for tile in block if bits(tile) & CUT or any(bits(tile) & side and n not in have for side, n in _sides(tile))]
    read: set = set()
    while todo:
        tile = todo.pop()
        if tile in read:
            continue
        read.add(tile)
        todo += [n for side, n in _sides(tile) if bits(tile) & side and n in have and n not in read]
    return read


def _read_tiles(mosaic, tiles: set, spec) -> list:
    """The blobs of `spec` in these of the block's tiles, read from the
    block's mosaic cut down to them, as cell rows (first row, first
    column, lat, lon, pixels): the blobs the whole block's read finds
    there, since no blob in them runs on out of them (_tiles_to_read)."""
    from scipy import ndimage

    tx0 = min(x for x, _ in tiles)
    ty0 = min(y for _, y in tiles)
    tx1 = max(x for x, _ in tiles) + 1
    ty1 = max(y for _, y in tiles) + 1
    mx, my = mosaic.origin_px[0] // TILE_PX, mosaic.origin_px[1] // TILE_PX
    rows, cols = slice((ty0 - my) * TILE_PX, (ty1 - my) * TILE_PX), slice((tx0 - mx) * TILE_PX, (tx1 - mx) * TILE_PX)
    block_covered = mosaic.covered[rows, cols]
    covered = np.zeros_like(block_covered)
    for x, y in tiles:
        r, c = (y - ty0) * TILE_PX, (x - tx0) * TILE_PX
        covered[r : r + TILE_PX, c : c + TILE_PX] = block_covered[r : r + TILE_PX, c : c + TILE_PX]
    mosaic.colour(spec.test)  # the block's classes, read once, shared with the cut-down one
    part = chartvision.Mosaic(
        pixels=mosaic.pixels[rows, cols],
        origin_px=(tx0 * TILE_PX, ty0 * TILE_PX),
        zoom=mosaic.zoom,
        covered=covered,
        _classes=mosaic._classes[rows, cols],
    )
    found = chartvision.detect_landmarks(part, palette=(spec,))
    labelled, _ = ndimage.label(part.on_chart(part.colour(spec.test)))
    boxes = ndimage.find_objects(labelled)
    ox, oy = part.origin_px
    out = []
    for landmark in found:
        gx, gy = (round(v) for v in chartvision.latlon_to_global_px(landmark.lat, landmark.lon, ZOOM))
        label = int(labelled[gy - oy, gx - ox])
        box = boxes[label - 1]
        first_col = box[1].start + int(np.argmax(labelled[box[0].start, box[1]] == label))
        out.append((oy + box[0].start, ox + first_col, landmark.lat, landmark.lon, landmark.pixels))
    return out


def _block_blobs(block: list, mosaic, cells: dict) -> list:
    """What detect_landmarks would find in the block: each kind's blobs
    from the cells where they hold them whole, read from the mosaic in
    the tiles where not -- in detect_landmarks' order, kind by kind, each
    kind's blobs in the order a scan of the block meets them, their areas
    at the block's own scale."""
    height, width = mosaic.pixels.shape[:2]
    centre_lat, _ = mosaic.to_latlon(width / 2, height / 2)
    m_per_px = chartvision.metres_per_pixel(centre_lat, mosaic.zoom)
    found = []
    for kind, spec in enumerate(chartvision.PALETTE):
        to_read = _tiles_to_read(kind, block, cells)
        if to_read is None:
            found += chartvision.detect_landmarks(mosaic, palette=(spec,))
            continue
        rows = [row[1:] for tile in block if tile not in to_read for row in cells[cell_of(tile)]["blobs"].get(tile, ()) if row[0] == kind]
        if to_read:
            rows += _read_tiles(mosaic, to_read, spec)
        found += [
            chartvision.Landmark(
                category=spec.name, lat=lat, lon=lon, area_m2=float(pixels) * m_per_px**2, score=spec.base_score, pixels=int(pixels)
            )
            for _, _, lat, lon, pixels in sorted(rows)
        ]
    return found


def read_blocks(start: tuple, end: tuple, half_width_nm: float, margin_nm: float = 5.0) -> list | None:
    """The corridor's read as app.detection keeps it -- its blocks, each
    with the landmarks no earlier block had -- or None where no cell
    under it is built (the reader's own read is then the same work).

    chartvision.iter_landmarks_along_route and detection._run_detect's
    steps, one for one, with the blobs from _block_blobs: written out
    here rather than given a way in there, because their source names
    every kept read (detection._READER), and a change to it would read
    every corridor again."""
    tiles = chartvision.corridor_tiles(start, end, half_width_nm + 1.0, ZOOM)
    root = cells_dir()
    cells = {cell: _cell(root, cell) for cell in {cell_of(tile) for tile in tiles}}
    if not any(cells.values()):
        return None
    route_nm = distance_nm(start[0], start[1], end[0], end[1])
    course_px = chartvision.great_circle_pixels(start, end, ZOOM)

    def big_enough_to_see(landmark, cross_nm: float) -> bool:
        if landmark.extras.get("crossing") or landmark.area_m2 <= 0:
            return True
        spec = next((s for s in chartvision.PALETTE if s.name == landmark.category), None)
        if spec is None:
            return True
        offset = max(1.0, abs(cross_nm) / chartvision.ON_COURSE_NM)
        m_per_px = chartvision.metres_per_pixel(landmark.lat, ZOOM)
        return landmark.area_m2 >= spec.min_area_px * m_per_px**2 * offset**2

    def block_along_track(block) -> float:
        xs = [x for x, _ in block]
        ys = [y for _, y in block]
        centre_x = (min(xs) + max(xs) + 1) / 2 * TILE_PX
        centre_y = (min(ys) + max(ys) + 1) / 2 * TILE_PX
        lat, lon = chartvision.global_px_to_latlon(centre_x, centre_y, ZOOM)
        return along_track_distance_nm(lat, lon, start, end)

    blocks = [b for b in sorted(chartvision.tile_blocks(tiles), key=block_along_track) if chartvision._has_chart(b, ZOOM)]

    def read(block):
        mosaic = chartvision.build_mosaic(block, ZOOM)
        found = _block_blobs(block, mosaic, cells) + chartvision.linear_crossings(mosaic, start, end, course_px=course_px)
        return found, mosaic.missing_tiles

    kept_blocks: list = []
    emitted: list = []
    with ThreadPoolExecutor(max_workers=chartvision.READ_AT_ONCE) as pool:
        for index, (block_landmarks, missing) in enumerate(pool.map(read, blocks)):
            kept = []
            for landmark in block_landmarks:
                cross = cross_track_distance_nm(landmark.lat, landmark.lon, start, end)
                along = along_track_distance_nm(landmark.lat, landmark.lon, start, end)
                if abs(cross) > half_width_nm or not (-margin_nm <= along <= route_nm + margin_nm):
                    continue
                if not big_enough_to_see(landmark, cross):
                    continue
                landmark.extras.update({"cross_track_nm": cross, "along_track_nm": along})
                kept.append(landmark)
            fresh = []
            for landmark in chartvision._dedupe(kept):
                if any(
                    other.category == landmark.category
                    and distance_nm(other.lat, other.lon, landmark.lat, landmark.lon) < chartvision.DEDUPE_NM
                    for other in emitted
                ):
                    continue
                emitted.append(landmark)
                fresh.append(landmark)
            kept_blocks.append({"block": index, "blocks": len(blocks), "tiles": len(tiles), "missing": missing, "landmarks": fresh})
    return kept_blocks


def _main(argv: list | None = None) -> int:
    """`python -m app.landmarks build [--sheet Chicago ...]` reads the
    served cycle's cells not read yet, under the named sectionals or all
    of them."""
    parser = argparse.ArgumentParser(description="The chart's lakes and towns, read once a cycle.")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("build")
    p.add_argument("--sheet", nargs="+", help="sectionals by name (Chicago, Green_Bay); every one by default")
    p.add_argument("--workers", type=int, default=2)
    p.add_argument("--cycle", help="the cycle to read; the served one by default")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    count = build(args.sheet, workers=args.workers, cycle=args.cycle)
    log.info("%d cells read into %s", count, cells_dir(args.cycle))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
