"""Finding visual checkpoints by reading the VFR sectional itself.

The rest of this project derives candidates from OpenStreetMap and FAA
datasets, then filters them down to the ones a sectional actually draws.
This module skips the middle step: it reads the chart raster and takes
what is drawn. That is the same question the 1-5 spottability label asks,
so the chart is the ground truth rather than a proxy for it, and the
filtering work that removed towers, water towers, quarries and unnamed
lakes is unnecessary here -- none of them are drawn, so none of them are
seen.

It is also the fast path, which is the point. Collecting a corridor from
Overpass plus the FAA subscription plus a per-candidate elevation lookup
is minutes of network I/O. Reading tiles the browser is about to render
anyway is seconds, and the segmentation itself is milliseconds: 0.16 s
for a 1024x1024 mosaic, measured.

Sectionals are cartographic products with a fixed palette, which is what
makes this tractable without a trained model. Water is a specific pale
blue, urban tint a specific yellow, sampled from real tiles (see
PALETTE). Classification is by tolerant colour relationships rather
than exact match: the tiles used to arrive JPEG-compressed from a
hosted map service, and the same tests carried over unchanged when the
source became the FAA's own palette rasters (wingtip.charts).

What this does NOT do is name anything. A detected blue blob is a usable
checkpoint before anyone knows it is called Nepco Lake; names are a
cross-check to run afterwards against OSM/FAA, not something to block a
pilot on.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import numpy as np

from .chartlines import _box_area, _interior_point, great_circle_pixels, linear_crossings
from .chartmosaic import (
    DEFAULT_ZOOM,
    TILE_PX,
    Mosaic,
    _has_chart,
    build_mosaic,
    corridor_tiles,
    fetch_tile,
    global_px_to_latlon,
    latlon_to_global_px,
    metres_per_pixel,
    tile_blocks,
)
from .chartpalette import LINEAR_PALETTE, ON_COURSE_NM, PALETTE, Landmark
from .geo import along_track_distance_nm, cross_track_distance_nm, distance_nm


def detect_landmarks(mosaic: Mosaic, palette=PALETTE) -> list:
    """Connected components of each palette class, as Landmarks.

    Blob area is converted to ground area using the mosaic's own latitude,
    not a constant, since a web-mercator pixel covers less ground the
    further north it is.
    """
    from scipy import ndimage

    centre_lat, _ = mosaic.to_latlon(mosaic.pixels.shape[1] / 2, mosaic.pixels.shape[0] / 2)
    m_per_px = metres_per_pixel(centre_lat, mosaic.zoom)

    landmarks = []
    for spec in palette:
        mask = mosaic.on_chart(mosaic.colour(spec.test))
        labelled, count = ndimage.label(mask)
        if count == 0:
            continue
        # np.bincount over the label image rather than ndimage.sum: the
        # same per-component pixel counts, and the single most expensive
        # step in blob detection before this (18 ms a block against 6-9
        # for everything else).
        sizes = np.bincount(labelled.ravel(), minlength=count + 1)[1:]
        boxes = ndimage.find_objects(labelled)
        # By size first, over the whole array at once: nearly every
        # component is a speck, and asking each of thousands in Python was
        # a quarter of a block's time.
        big = sizes >= spec.min_area_px
        if spec.max_area_px is not None:
            big &= sizes <= spec.max_area_px
        keep = [int(i) + 1 for i in np.nonzero(big)[0] if spec.max_box_fill is None or sizes[i] <= spec.max_box_fill * _box_area(boxes[i])]
        if not keep:
            continue

        # A point guaranteed to lie inside each blob, rather than its
        # centre of mass. A centroid need not be inside its own shape: a
        # crescent lake, a river bend or a ring of linework all put it
        # outside, on bare chart. This is the raster form of shapely's
        # representative_point -- the same fix wingtip.osm needed for the
        # same reason.
        #
        # Done per blob inside its own bounding box. Running a distance
        # transform over the whole block was correct but was most of why
        # reading a route took 25 seconds with every tile already cached:
        # it is a global operation repeated per palette class per block,
        # to answer a question about a few hundred small shapes.
        positions = [_interior_point(labelled, boxes[label - 1], label) for label in keep]
        for label, (cy, cx) in zip(keep, positions):
            lat, lon = mosaic.to_latlon(cx, cy)
            landmarks.append(
                Landmark(
                    category=spec.name,
                    lat=lat,
                    lon=lon,
                    area_m2=float(sizes[label - 1]) * m_per_px**2,
                    score=spec.base_score,
                    pixels=int(sizes[label - 1]),
                )
            )
    return landmarks


# Two detections of the same feature closer than this are the same
# feature, seen from two overlapping blocks.
DEDUPE_NM = 0.2

# Blocks read at once, each on a thread of its own: most of a block's
# time is numpy and scipy, which let go of the GIL, so C81->KDLH's ten
# blocks read in 4.2 s four at a time where they took 10.2 s one after
# another (six were 3.9 s, and six processes 3.2 s for the price of a
# process each). Four, not every core: each block holds its mosaic and
# masks, a few hundred MB on a long one, and several routes can be read
# at once.
READ_AT_ONCE = 4


def _dedupe(landmarks: list, within_nm: float = DEDUPE_NM) -> list:
    """Drop repeat sightings of one feature from overlapping blocks,
    keeping the largest -- that is the block that saw more of it."""
    kept = []
    for landmark in sorted(landmarks, key=lambda candidate: -candidate.area_m2):
        if any(k.category == landmark.category and distance_nm(k.lat, k.lon, landmark.lat, landmark.lon) < within_nm for k in kept):
            continue
        kept.append(landmark)
    return kept


def iter_landmarks_along_route(start: tuple, end: tuple, half_width_nm: float = 1.0, zoom: int = DEFAULT_ZOOM, margin_nm: float = 5.0):
    """Everything the chart draws inside the route corridor, a block at a
    time.

    The whole fast path: pick tiles, fetch them (cached), segment, keep
    what falls inside the corridor. No Overpass, no FAA subscription, no
    elevation service.

    Yielded rather than returned because there is no reason to hold the
    whole corridor back. Blocks advance along the course, so the first one
    covers the departure end and is ready in a fraction of a second while
    a 323 nm route takes a few seconds in total -- a caller can put
    checkpoints on the map and let someone start work on them while the
    rest is still being read.
    """
    tiles = corridor_tiles(start, end, half_width_nm + 1.0, zoom)
    route_nm = distance_nm(start[0], start[1], end[0], end[1])

    # Once for the whole route, not once per block: the path is the same
    # for every block and building it 40 times was pure waste.
    course_px = great_circle_pixels(start, end, zoom)

    def big_enough_to_see(landmark, cross_nm: float) -> bool:
        """Whether a blob is large enough to pick out from this far off
        course. Crossings are exempt: they are on the course by
        construction, and a river is identified by where it cuts the
        line rather than by its area."""
        if landmark.extras.get("crossing") or landmark.area_m2 <= 0:
            return True
        spec = next((s for s in PALETTE if s.name == landmark.category), None)
        if spec is None:
            return True
        offset = max(1.0, abs(cross_nm) / ON_COURSE_NM)
        m_per_px = metres_per_pixel(landmark.lat, zoom)
        return landmark.area_m2 >= spec.min_area_px * m_per_px**2 * offset**2

    # Ordered by how far along the route each block sits, so a caller
    # streaming these fills the map from the departure end. tile_blocks
    # advances in ascending tile-x, which is the direction of flight only
    # for an eastbound route -- C81->KDLH runs west, so the departure had
    # the highest x and the whole corridor arrived back to front: the
    # first candidates on screen were the ones 320 nm away.
    def block_along_track(block) -> float:
        xs = [x for x, _ in block]
        ys = [y for _, y in block]
        centre_x = (min(xs) + max(xs) + 1) / 2 * TILE_PX
        centre_y = (min(ys) + max(ys) + 1) / 2 * TILE_PX
        lat, lon = global_px_to_latlon(centre_x, centre_y, zoom)
        return along_track_distance_nm(lat, lon, start, end)

    blocks = [b for b in sorted(tile_blocks(tiles), key=block_along_track) if _has_chart(b, zoom)]

    def read(block):
        """One block's detections and its tile counts -- not the mosaic,
        which would be held while earlier blocks are still being read."""
        mosaic = build_mosaic(block, zoom)
        found = detect_landmarks(mosaic) + linear_crossings(mosaic, start, end, course_px=course_px)
        return found, mosaic.missing_tiles, mosaic.fetched_tiles, mosaic.cached_tiles

    # Every block asked for at once, READ_AT_ONCE read at a time in the
    # order asked, and handed on in that order: the departure end still
    # comes first. A caller that stops listening stops the blocks not
    # yet begun.
    pool = ThreadPoolExecutor(max_workers=READ_AT_ONCE)
    try:
        reads = [pool.submit(read, block) for block in blocks]
        for index, done in enumerate(reads):
            block_landmarks, missing, fetched, cached = done.result()
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

            yield {
                "landmarks": _dedupe(kept),
                "block": index,
                "blocks": len(blocks),
                "tiles": len(tiles),
                "missing": missing,
                "fetched": fetched,
                "cached": cached,
                "route_nm": route_nm,
            }
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


# Order matters: the tests are not mutually exclusive and the first match
# wins. Airport magenta and river dark-blue are both dark enough to also
# satisfy the near-black linework test, so both are checked before it --
# the specific answer beats the generic one.
CLASSIFY_ORDER = ("river", "water", "town", "road_or_rail")

# Half-width of the window sampled around a point, in pixels. Nobody
# clicks the exact centre of a two-pixel-wide river line.
CLASSIFY_WINDOW_PX = 4


def classify_point(lat: float, lon: float, zoom: int = DEFAULT_ZOOM) -> dict:
    """What the chart draws at one point.

    Exists because a person marking a checkpoint should not also have to
    tell the system what kind of thing it is. The chart already says, and
    asking twice is how 34 hand-picked points came to be recorded as
    "water" when most of them sat on roads -- the category came from a
    dropdown default rather than from the pixels.

    Returns the matching class and the pixel that matched, or class None
    if the point is on open chart background.
    """
    px, py = latlon_to_global_px(lat, lon, zoom)
    tile = fetch_tile(int(px // TILE_PX), int(py // TILE_PX), zoom)
    if tile is None:
        return {"category": None, "reason": "no chart coverage here"}

    pixels = np.asarray(tile).astype(np.int16)
    ix, iy = int(px) % TILE_PX, int(py) % TILE_PX
    lo_y, hi_y = max(0, iy - CLASSIFY_WINDOW_PX), min(TILE_PX, iy + CLASSIFY_WINDOW_PX + 1)
    lo_x, hi_x = max(0, ix - CLASSIFY_WINDOW_PX), min(TILE_PX, ix + CLASSIFY_WINDOW_PX + 1)
    window = pixels[lo_y:hi_y, lo_x:hi_x].reshape(-1, 3)
    r, g, b = window[:, 0], window[:, 1], window[:, 2]

    # Whichever class covers the most of the window, not whichever is
    # tested first. Order alone was wrong at the edge of a lake: a lake is
    # outlined in the same dark blue a river is drawn in, so three
    # shoreline pixels made Nepco Lake classify as "river" while dozens of
    # water-fill pixels sat under the same click.
    tests = {spec.name: spec.test for spec in PALETTE + LINEAR_PALETTE}
    scores = {}
    for name in CLASSIFY_ORDER:
        mask = tests[name](r, g, b)
        if mask.any():
            scores[name] = (int(mask.sum()), window[mask][0])
    if not scores:
        return {"category": None, "reason": "chart background -- nothing drawn here"}

    # Ties break by CLASSIFY_ORDER, which runs specific before generic.
    best = max(scores, key=lambda n: (scores[n][0], -CLASSIFY_ORDER.index(n)))
    count, matched = scores[best]
    return {"category": best, "rgb": [int(v) for v in matched], "matched_pixels": count, "considered": {n: scores[n][0] for n in scores}}
