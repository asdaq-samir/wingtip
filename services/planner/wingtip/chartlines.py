"""Roads, railroads and rivers where the course crosses them: reading a
block's linear chart features (a line is told from lettering by its extent
and its width) and the great-circle course in pixels they are crossed on.
wingtip.chartvision calls linear_crossings for every block."""

from __future__ import annotations

import math

import numpy as np

from .chartmosaic import DEFAULT_ZOOM, TILE_PX, Mosaic, latlon_to_global_px, metres_per_pixel
from .chartpalette import LINEAR_PALETTE, Landmark
from .chart_line_mask import CROSSING_TOLERANCE_PX, Lines, course_windows, group_hits, nearest_mask_pixel
from .geo import EARTH_RADIUS_NM, distance_nm, great_circle_points, tile_xy

# How many course steps either side of a crossing's middle its marker may
# be looked for -- about the tolerance's width again (see linear_crossings).
SNAP_STEPS = 6


def great_circle_pixels(start: tuple, end: tuple, zoom: int = DEFAULT_ZOOM) -> np.ndarray:
    """The course as global pixel coordinates, sampled about one pixel
    apart, following the great circle.

    Interpolating straight between the endpoints *in pixel space* is a
    rhumb line, not a great circle, and the difference is not academic:
    on a 323 nm route it put detected crossings up to 0.6 nm off course,
    drifting further the longer the route ran, so almost none of them
    lined up with the same crossings picked by hand. Cross-track distance
    is measured against the great circle everywhere else in this project,
    so the raster walk has to use it too.

    The engine's points along the great circle (geo.great_circle_points),
    in one crossing for all of them: a long route is tens of thousands of
    samples.
    """
    # Below a microradian (~6 m) there is no course to walk.
    if distance_nm(start[0], start[1], end[0], end[1]) < 1e-6 * EARTH_RADIUS_NM:
        return np.empty((0, 2))

    # One sample per pixel of the straight-line pixel distance is enough:
    # the great circle is never further from it than the drift above.
    x0, y0 = latlon_to_global_px(start[0], start[1], zoom)
    x1, y1 = latlon_to_global_px(end[0], end[1], zoom)
    steps = max(2, int(math.hypot(x1 - x0, y1 - y0)))

    lat, lon = great_circle_points(start, end, steps + 1)
    px, py = tile_xy(lat, lon, zoom)
    return np.column_stack([px, py]) * TILE_PX


def linear_crossings(mosaic: Mosaic, start: tuple, end: tuple, palette=LINEAR_PALETTE, course_px=None) -> list:
    """Where the course crosses linear chart features, as Landmarks.

    A blob centroid is the wrong answer for anything linear. The centroid
    of a river that wanders across a whole mosaic is a point in a field
    somewhere; what a pilot uses is the place the course actually cuts
    it. This is the raster equivalent of wingtip.osm_resolvers.find_line_crossings, and
    the same reasoning: for a linear feature the checkpoint *is* the
    intersection.

    Found by walking the course in pixel space and testing the mask
    under it, rather than by labelling components and intersecting
    geometry -- the course is one line, so walking it is O(length) and
    needs no component analysis at all.
    """
    height, width = mosaic.pixels.shape[:2]
    if course_px is None:
        course_px = great_circle_pixels(start, end, mosaic.zoom)
    if len(course_px) < 2:
        return []

    local = course_px - np.array(mosaic.origin_px)
    # Only the stretch of course that actually crosses this block. Every
    # block used to walk the whole route -- 16,000 points per palette
    # class per block, about 900,000 Python iterations to examine 29 small
    # images, which was the entire reason reading a route took 30 seconds
    # when the tiles were already cached and fetching them took 0.05 s.
    inside = (local[:, 0] >= 0) & (local[:, 0] < mosaic.pixels.shape[1]) & (local[:, 1] >= 0) & (local[:, 1] < mosaic.pixels.shape[0])
    indices = np.nonzero(inside)[0]
    if not len(indices):
        return []
    # Each course point's pixel, rounded as round() rounds (half to even).
    points = np.rint(local[indices]).astype(int)

    centre_lat, _ = mosaic.to_latlon(width / 2, height / 2)
    m_per_px = metres_per_pixel(centre_lat, mosaic.zoom)

    found = []
    graticule = None
    for spec in palette:
        mask = mosaic.on_chart(mosaic.colour(spec.test))
        if spec.graticule_ink:
            graticule = mosaic.graticule() if graticule is None else graticule
            mask = mask & ~graticule
        # Sampled per course point rather than by filtering the whole
        # block. Precomputing proximity with a uniform_filter was tried
        # and was twice as slow: the course touches a couple of thousand
        # pixels of a block that holds millions, so answering the question
        # everywhere costs far more than asking it where it matters. Each
        # point's window, clipped to the block, read for every point at
        # once (course_windows): it was a Python loop, a fifth of a
        # route's crossings.
        hits = course_windows(mask, points, indices)
        if not hits:
            continue
        # Whether the thing under a crossing is a line at all: how far it
        # runs, how thick it is, whether it is a number -- see
        # MIN_LINE_EXTENT_PX, MAX_LINE_HALF_WIDTH_PX and
        # MAX_SHORT_LINE_FILL. Only where the course meets the class.
        lines = Lines(mask, spec) if spec.min_extent_px or spec.max_half_width_px is not None else None

        # Collapse runs of consecutive hits into one crossing each.
        for group in group_hits(hits):
            # The course point is where the line passes, which is up to
            # CROSSING_TOLERANCE_PX away from the linework it crossed.
            # Snap onto an actual pixel of the feature so the marker sits
            # on the river, not beside it -- from the middle of the
            # crossing's hits outwards, a few steps either way, and, where
            # the class needs one, onto a line: a symbol drawn over a river
            # is hit by the same stretch of course and can take its middle.
            # No further than SNAP_STEPS: a long run of hits is a cluster
            # of figures, and somewhere among them one stroke passes for a
            # line. Nothing that is a line under the course -- a letter, a
            # symbol or speckle -- and no crossing.
            middle = len(group) // 2
            snapped = None
            for i in sorted(range(max(0, middle - SNAP_STEPS), min(len(group), middle + SNAP_STEPS + 1)), key=lambda i: abs(i - middle)):
                snapped = nearest_mask_pixel(mask, group[i][1], group[i][2], CROSSING_TOLERANCE_PX, lines)
                if snapped is not None:
                    break
            if snapped is None:
                continue
            lat, lon = mosaic.to_latlon(snapped[0], snapped[1])
            weight = sum(h[3] for h in group)
            if weight < spec.min_area_px:
                continue
            found.append(
                Landmark(
                    category=spec.name,
                    lat=lat,
                    lon=lon,
                    # A crossing has no area; the linework under it stands
                    # in for how prominent the feature is on the chart.
                    area_m2=float(weight) * m_per_px**2,
                    score=spec.base_score,
                    pixels=weight,
                    extras={"crossing": True, "width_px": len(group)},
                )
            )
    return found


def _interior_point(labelled, box, label: int) -> tuple:
    """A (row, col) inside this component, near its middle.

    Takes the component's own pixels within its bounding box and picks
    the one closest to the box centre, which is inside by construction
    and close enough to the middle to read as "where the feature is".
    Kept where it is, though the pixel deepest inside would sit better
    on a big town: a rating is matched to its detection by place
    (wingtip.routecsv.SAME_PLACE_NM), and moving the markers left the ratings
    of half a dozen lakes and towns on C81->KDLH beside points of their
    own.
    """
    ys, xs = np.nonzero(labelled[box] == label)
    cy = (ys.min() + ys.max()) / 2.0
    cx = (xs.min() + xs.max()) / 2.0
    nearest = np.argmin((xs - cx) ** 2 + (ys - cy) ** 2)
    return ys[nearest] + box[0].start, xs[nearest] + box[1].start


def _box_area(box) -> int:
    return (box[0].stop - box[0].start) * (box[1].stop - box[1].start)
