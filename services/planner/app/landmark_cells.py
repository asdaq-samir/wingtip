"""The chart's lakes and towns read a cell at a time and kept on disk
(app.landmarks reads a corridor's blobs from them).

A cell is a zoom-7 tile's 32 by 32 zoom-12 tiles; `build` reads every
cell under the sectionals this planner has, one process each, and
keeps each cell's blobs in a file of its own beside the cycle's tiles,
named for the cycle, its tile revision and the reader's code as a kept
read is: a new edition, tiles rendered again or a change to the reader
starts the cells again, and a cell with its file is done, so a build
stopped part way picks up where it was. See app.landmarks for why."""

import logging
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from wingtip import chart_coverage, chart_kinds, chart_serving, chart_sheets, chartvision
from wingtip.atomic import atomic_path
from wingtip.config import CHART_TILE_CACHE_DIR, get_settings

from . import detection

log = logging.getLogger(__name__)

ZOOM = chartvision.DEFAULT_ZOOM
TILE_PX = chartvision.TILE_PX
# A cell is a zoom-7 tile: 1,024 zoom-12 tiles, about 2.8 by 2.1 degrees
# at 42 N, read in 10 to 30 s. Small enough to build a sheet at a time
# and to load only the few a route crosses.
CELL_ZOOM = 7
CELL_TILES = 2 ** (ZOOM - CELL_ZOOM)
# Each cell read in blocks of 8 by 8 tiles with a tile of chart around
# them: a blob is the block's whose point is in its middle 8 by 8, seen
# whole if it reaches no further than the tile around. 1.56 tiles read
# for each one kept; a blob that reaches further is marked cut off
# (below), and the blocks that have it read it themselves.
CORE_TILES = 8
APRON_TILES = 1

# Where the cells are kept: beside the cycle's tiles, or elsewhere where
# CHART_LANDMARKS_DIR says (a server whose tiles are in the cloud).
LANDMARKS_ROOT = get_settings().chart_landmarks_dir or CHART_TILE_CACHE_DIR

# Per tile and per kind of blob, five bits: whether that kind's pixels
# run on into the tile to the right, below, to the left or above, and
# whether any of them belongs to a blob its cell's block saw cut off.
RIGHT, DOWN, LEFT, UP, CUT = 1, 2, 4, 8, 16
BITS_PER_KIND = 5


def cells_dir(cycle: str | None = None) -> Path:
    """The cells of the cycle the planner serves, named as its kept reads
    are (app.detection._kept_path): by tile revision and reader."""
    cycle = cycle or chart_serving.serving_cycle()
    return LANDMARKS_ROOT / cycle / f"landmarks-r{chart_serving.tiles_revision(cycle)}-{detection._READER}"


def cell_path(root: Path, cell: tuple) -> Path:
    return root / str(cell[0]) / f"{cell[1]}.npz"


def cell_of(tile: tuple) -> tuple:
    return tile[0] // CELL_TILES, tile[1] // CELL_TILES


# ---------------------------------------------------------------------------
# Reading the chart a cell at a time
# ---------------------------------------------------------------------------


def _read_block(bx: int, by: int) -> tuple[list, dict]:
    """One block of a cell, its middle 8 by 8 tiles from (bx, by): the
    blobs whose point is in the middle and are not cut off, as rows
    (kind, lat, lon, pixels, first row, first column), and each middle
    tile's bits (above). Read with chartvision's own build_mosaic and
    detect_landmarks; the blobs labelled again here, the same way, to
    know where each runs."""
    from scipy import ndimage

    block = [
        (x, y)
        for x in range(bx - APRON_TILES, bx + CORE_TILES + APRON_TILES)
        for y in range(by - APRON_TILES, by + CORE_TILES + APRON_TILES)
    ]
    if not chartvision._has_chart(block, ZOOM):
        return [], {}
    mosaic = chartvision.build_mosaic(block, ZOOM)
    found = chartvision.detect_landmarks(mosaic)
    ox, oy = mosaic.origin_px
    rows: list = []
    bits: dict = {}
    for kind, spec in enumerate(chartvision.PALETTE):
        mask = mosaic.on_chart(mosaic.colour(spec.test))
        labelled, _ = ndimage.label(mask)
        edge = np.unique(np.concatenate([labelled[0], labelled[-1], labelled[:, 0], labelled[:, -1]]))
        cut = np.isin(labelled, edge[edge > 0])
        shift = kind * BITS_PER_KIND
        for i in range(CORE_TILES):
            for j in range(CORE_TILES):
                c0, r0 = (APRON_TILES + i) * TILE_PX, (APRON_TILES + j) * TILE_PX
                c1, r1 = c0 + TILE_PX, r0 + TILE_PX
                tile_bits = (
                    RIGHT * bool((mask[r0:r1, c1 - 1] & mask[r0:r1, c1]).any())
                    | DOWN * bool((mask[r1 - 1, c0:c1] & mask[r1, c0:c1]).any())
                    | LEFT * bool((mask[r0:r1, c0] & mask[r0:r1, c0 - 1]).any())
                    | UP * bool((mask[r0, c0:c1] & mask[r0 - 1, c0:c1]).any())
                    | CUT * bool(cut[r0:r1, c0:c1].any())
                )
                if tile_bits:
                    key = (bx + i, by + j)
                    bits[key] = bits.get(key, 0) | (tile_bits << shift)
        boxes = ndimage.find_objects(labelled)
        for landmark in found:
            if landmark.category != spec.name:
                continue
            # The blob's own pixel, back from its point: a whole pixel,
            # as detect_landmarks placed it.
            gx, gy = (round(v) for v in chartvision.latlon_to_global_px(landmark.lat, landmark.lon, ZOOM))
            if not (bx <= gx // TILE_PX < bx + CORE_TILES and by <= gy // TILE_PX < by + CORE_TILES):
                continue
            label = int(labelled[gy - oy, gx - ox])
            box = boxes[label - 1] if label else None
            if box is None or int(np.count_nonzero(labelled[box] == label)) != landmark.pixels:
                # Not the blob found there: never so far, and should it be,
                # its tile is read by each block that has it, not trusted.
                key = (gx // TILE_PX, gy // TILE_PX)
                bits[key] = bits.get(key, 0) | (CUT << shift)
                continue
            if cut[gy - oy, gx - ox]:
                continue
            # Its first pixel as a block is scanned, row by row: the order
            # detect_landmarks finds blobs in.
            first_col = box[1].start + int(np.argmax(labelled[box[0].start, box[1]] == label))
            rows.append((kind, landmark.lat, landmark.lon, landmark.pixels, oy + box[0].start, ox + first_col))
    return rows, bits


def build_cell(cell: tuple, root: Path) -> Path:
    """A cell read and its file written, whole or not at all."""
    cx, cy = cell
    rows: list = []
    bits: dict = {}
    for bx in range(cx * CELL_TILES, (cx + 1) * CELL_TILES, CORE_TILES):
        for by in range(cy * CELL_TILES, (cy + 1) * CELL_TILES, CORE_TILES):
            block_rows, block_bits = _read_block(bx, by)
            rows += block_rows
            bits.update(block_bits)
    blobs = np.array(rows, dtype=float).reshape(-1, 6)
    tiles = np.array([(x, y, b) for (x, y), b in sorted(bits.items())], dtype=np.int64).reshape(-1, 3)
    path = cell_path(root, cell)
    with atomic_path(path) as part, part.open("wb") as handle:
        np.savez_compressed(
            handle,
            kind=blobs[:, 0].astype(np.int8),
            lat=blobs[:, 1],
            lon=blobs[:, 2],
            pixels=blobs[:, 3].astype(np.int64),
            first_y=blobs[:, 4].astype(np.int64),
            first_x=blobs[:, 5].astype(np.int64),
            tiles=tiles,
        )
    return path


def sheet_cells(names: list | None = None) -> list:
    """The cells under the named sectionals, every sectional's by default."""
    cells = set()
    for name, (west, south, east, north) in chart_coverage.sheets(chart_kinds.SECTIONAL):
        if names and name not in names:
            continue
        x0, y0 = (int(v) // TILE_PX for v in chartvision.latlon_to_global_px(north, west, ZOOM))
        x1, y1 = (int(v) // TILE_PX for v in chartvision.latlon_to_global_px(south, east, ZOOM))
        cells |= {(x, y) for x in range(x0 // CELL_TILES, x1 // CELL_TILES + 1) for y in range(y0 // CELL_TILES, y1 // CELL_TILES + 1)}
    return sorted(cells)


def build(names: list | None = None, workers: int = 2, cycle: str | None = None, initializer=None) -> int:
    """Every cell under the named sectionals not built yet for the cycle,
    `workers` at a time, each in a process of its own (a cell holds the
    interpreter for most of its read). Returns the cells built."""
    root = cells_dir(cycle)
    todo = [c for c in sheet_cells(names) if not cell_path(root, c).exists()]
    log.info("%d cells to read into %s", len(todo), root)
    if not todo:
        return 0
    with ProcessPoolExecutor(max_workers=workers, initializer=initializer) as pool:
        for done, path in enumerate(pool.map(build_cell, todo, [root] * len(todo)), 1):
            if done % 10 == 0 or done == len(todo):
                log.info("  %d of %d cells (%s)", done, len(todo), path.name)
    return len(todo)


def _low_priority() -> None:
    """A builder's process yields to the planner's own: the cells are a
    head start on the next routes, not anything a pilot is waiting for."""
    try:
        os.nice(10)
    except OSError:
        pass


def build_on_disk(cycle: str | None = None) -> int:
    """The cells under every sectional this planner already has on disk,
    the ones its corridors are read from, one process at a time and at a
    low priority. A sectional not prepared here is not fetched for it:
    the whole set is 7 GB, the daily refresh's to bring (app.chart_refresh),
    and its cells are read the next start after. Returns the cells built."""
    names = [
        name
        for name, _ in chart_coverage.sheets(chart_kinds.SECTIONAL)
        if chart_sheets.latest_on_disk(chart_kinds.SECTIONAL, name) is not None
    ]
    if not names:
        return 0
    return build(names, workers=1, cycle=cycle, initializer=_low_priority)
