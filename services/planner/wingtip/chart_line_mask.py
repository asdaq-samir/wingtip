"""Which pixels of a block's mask belong to a line the course could cross:
the labelling of a block's components, the course's windows on the mask and
the hits grouped into crossings. wingtip.chartlines turns them into
Landmarks."""

from __future__ import annotations

import numpy as np

from .chartpalette import (
    CROSSING_SEPARATION_PX,
    LINE_THICKNESS_WINDOW_PX,
    LOCAL_THICKNESS_FROM_PX,
    MAX_SHORT_LINE_FILL,
    SHORT_LINE_PX,
    PaletteClass,
)

# How far from the course line a pixel may sit and still count as being
# on it. The course is drawn as a mathematical line but chart linework
# has width, and a pilot clicking a crossing does not hit the exact
# pixel; 3 px at zoom 12 is a bit over 100 m.
CROSSING_TOLERANCE_PX = 3


class Lines:
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


def course_windows(mask, points, indices, radius: int = CROSSING_TOLERANCE_PX) -> list:
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


def nearest_mask_pixel(mask, cx: int, cy: int, radius: int, lines: Lines | None = None):
    """The (x, y) of the mask pixel nearest (cx, cy), or None. With
    `lines`, only a pixel of a line (see Lines).

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


def group_hits(hits: list, separation: int = CROSSING_SEPARATION_PX) -> list:
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
