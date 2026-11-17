"""Roads, railroads and rivers where the course crosses them: reading a
block's linear chart features (a line is told from lettering by its extent
and its width) and the great-circle course in pixels they are crossed on.
wingtip.chartvision calls linear_crossings for every block."""

from __future__ import annotations

import math

import numpy as np

from .chartmosaic import DEFAULT_ZOOM, TILE_PX, Mosaic, latlon_to_global_px, metres_per_pixel
from .chartpalette import (
    CROSSING_SEPARATION_PX,
    LINE_THICKNESS_WINDOW_PX,
    LINEAR_PALETTE,
    LOCAL_THICKNESS_FROM_PX,
    MAX_SHORT_LINE_FILL,
    SHORT_LINE_PX,
    Landmark,
    PaletteClass,
)
from .geo import EARTH_RADIUS_NM, distance_nm, great_circle_points, tile_xy

# How many course steps either side of a crossing's middle its marker may
# be looked for -- about the tolerance's width again (see linear_crossings).
SNAP_STEPS = 6

# How far from the course line a pixel may sit and still count as being
# on it. The course is drawn as a mathematical line but chart linework
# has width, and a pilot clicking a crossing does not hit the exact
# pixel; 3 px at zoom 12 is a bit over 100 m.
CROSSING_TOLERANCE_PX = 3


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
        # once (_course_windows): it was a Python loop, a fifth of a
        # route's crossings.
        hits = _course_windows(mask, points, indices)
        if not hits:
            continue
        # Whether the thing under a crossing is a line at all: how far it
        # runs, how thick it is, whether it is a number -- see
        # MIN_LINE_EXTENT_PX, MAX_LINE_HALF_WIDTH_PX and
        # MAX_SHORT_LINE_FILL. Only where the course meets the class.
        lines = _Lines(mask, spec) if spec.min_extent_px or spec.max_half_width_px is not None else None

        # Collapse runs of consecutive hits into one crossing each.
        for group in _group_hits(hits):
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
                snapped = _nearest_mask_pixel(mask, group[i][1], group[i][2], CROSSING_TOLERANCE_PX, lines)
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


class _Lines:
    """Which of a block's `spec` pixels belong to a line the course could
    cross: a component that runs at least min_extent_px -- and, where the
    class has a max_half_width_px, is a line and not a number (see
    MAX_SHORT_LINE_FILL) and is no thicker than that where the course
    crosses it. One labelling of the block's mask; the thickness only
    where the course crosses."""

    def __init__(self, mask, spec: PaletteClass):
        from scipy import ndimage

        self.spec = spec
        self.labelled, _ = ndimage.label(mask)
        self.boxes = ndimage.find_objects(self.labelled)
        self.thin_whole: dict = {}

    # A component's extent and area, asked of the few a crossing touches:
    # they were worked out for all of a block's thousands, most of them
    # letters, which was half of a crossing's time.
    def _extent(self, label: int) -> int:
        box = self.boxes[label - 1]
        return max(box[0].stop - box[0].start, box[1].stop - box[1].start)

    def _area(self, label: int) -> int:
        box = self.boxes[label - 1]
        return int(np.count_nonzero(self.labelled[box] == label))

    def _is_line(self, label: int) -> bool:
        extent = self._extent(label)
        if extent < self.spec.min_extent_px:
            return False
        if self.spec.max_half_width_px is None or extent >= SHORT_LINE_PX:
            return True
        return self._area(label) / extent <= MAX_SHORT_LINE_FILL

    def _thin_at(self, label: int, cx: int, cy: int) -> bool:
        """Whether the component is no thicker than max_half_width_px:
        anywhere, for one shorter than LOCAL_THICKNESS_FROM_PX, and
        otherwise within LINE_THICKNESS_WINDOW_PX of (cx, cy), measured on
        a crop a little larger than that so the crop's edge is not taken
        for the stroke's."""
        from scipy import ndimage

        if self._extent(label) < LOCAL_THICKNESS_FROM_PX:
            if label not in self.thin_whole:
                box = self.boxes[label - 1]
                depth = ndimage.distance_transform_edt(np.pad(self.labelled[box] == label, 1))
                self.thin_whole[label] = float(depth.max()) <= self.spec.max_half_width_px
            return self.thin_whole[label]
        r = LINE_THICKNESS_WINDOW_PX + int(self.spec.max_half_width_px) + 1
        y0, x0 = max(0, cy - r), max(0, cx - r)
        crop = self.labelled[y0 : cy + r + 1, x0 : cx + r + 1] == label
        depth = ndimage.distance_transform_edt(np.pad(crop, 1))[1:-1, 1:-1]
        inner = depth[
            max(0, cy - LINE_THICKNESS_WINDOW_PX - y0) : cy + LINE_THICKNESS_WINDOW_PX + 1 - y0,
            max(0, cx - LINE_THICKNESS_WINDOW_PX - x0) : cx + LINE_THICKNESS_WINDOW_PX + 1 - x0,
        ]
        return float(inner.max(initial=0)) <= self.spec.max_half_width_px

    def accept(self, window, lo_y: int, lo_x: int, cx: int, cy: int):
        """`window` (the mask from (lo_y, lo_x)) less what is no line,
        for a crossing at (cx, cy)."""
        height, width = window.shape
        labels = self.labelled[lo_y : lo_y + height, lo_x : lo_x + width]
        for label in np.unique(labels[window]):
            label = int(label)
            if not self._is_line(label) or (self.spec.max_half_width_px is not None and not self._thin_at(label, cx, cy)):
                window = window & (labels != label)
        return window


def _course_windows(mask, points, indices, radius: int = CROSSING_TOLERANCE_PX) -> list:
    """(step, x, y, set pixels) for each course point with any of `mask`
    within `radius` of it, the window clipped to the block: every
    point's window gathered at once, offsets that fall off the block
    counted as unset."""
    height, width = mask.shape
    offsets = np.arange(-radius, radius + 1)
    ys = points[:, 1, None, None] + offsets[None, :, None]
    xs = points[:, 0, None, None] + offsets[None, None, :]
    ys, xs = np.broadcast_arrays(ys, xs)
    on_block = (ys >= 0) & (ys < height) & (xs >= 0) & (xs < width)
    set_pixels = mask[np.clip(ys, 0, height - 1), np.clip(xs, 0, width - 1)] & on_block
    counts = set_pixels.sum(axis=(1, 2))
    return [(int(indices[i]), int(points[i, 0]), int(points[i, 1]), int(counts[i])) for i in np.nonzero(counts)[0]]


def _nearest_mask_pixel(mask, cx: int, cy: int, radius: int, lines: _Lines | None = None):
    """The (x, y) of the mask pixel nearest (cx, cy), or None. With
    `lines`, only a pixel of a line (see _Lines).

    Used to put a crossing marker on the feature rather than on the
    course line beside it -- the two are up to `radius` apart by
    construction, which on bare chart is the difference between a marker
    on a river and a marker on grass.
    """
    height, width = mask.shape
    lo_y, hi_y = max(0, cy - radius), min(height, cy + radius + 1)
    lo_x, hi_x = max(0, cx - radius), min(width, cx + radius + 1)
    window = mask[lo_y:hi_y, lo_x:hi_x]
    if lines is not None:
        window = lines.accept(window, lo_y, lo_x, cx, cy)
    if not window.any():
        return None
    ys, xs = np.nonzero(window)
    ys, xs = ys + lo_y, xs + lo_x
    nearest = np.argmin((xs - cx) ** 2 + (ys - cy) ** 2)
    return int(xs[nearest]), int(ys[nearest])


def _group_hits(hits: list, separation: int = CROSSING_SEPARATION_PX) -> list:
    """Split hits along the course into separate crossings."""
    groups, current = [], []
    for hit in hits:
        if current and hit[0] - current[-1][0] > separation:
            groups.append(current)
            current = []
        current.append(hit)
    if current:
        groups.append(current)
    return groups
