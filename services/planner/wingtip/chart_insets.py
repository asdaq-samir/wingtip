"""The framed insets a sectional prints over its own face, found so they can
be cut out of it.

A sectional sets a busy area out again at a larger scale in a box laid
over a quiet part of its face: Los Angeles prints its Los Angeles basin
over the Pacific in its south-west corner (from 122.2W to 120.1W, 31.96N
to 33.57N), Jacksonville Tampa and Orlando, Ketchikan its own town. They
are tinted maps like the chart round them, so the paper search
(chart_panels) does not see them, and the map drew them as geography:
a second Los Angeles over the ocean west of San Nicolas Island (the
owner's phone, 2026-11-21). wingtip.chart_faces calls in here once a
sheet's face is found.

An inset is told by its frame: two straight raster lines of ink that
meet in a corner and both stop there, each at least 600 px long. The
chart's graticule is as straight over that length (a parallel on a
sectional bows under two pixels in 2,000) but its lines cross and run
on; the neatline's corners are on the face's edge, not inside it. The
box the two arms span is the inset, kept only where each of its far
sides is framed too or lies off the face.
"""

from __future__ import annotations

import numpy as np

# Pooled blocks of the face search (chart_faces._POOL_PX, 4 px).
#
# An arm is a run of ink along one raster row or column (or the next,
# for a line astride two) at least this long: 600 px, where the longest
# straight line a sectional draws inside its face that is not graticule
# or a frame (a label box's side) is under 400.
_MIN_ARM_BLOCKS = 150
# Gaps this short in a line are bridged: the frame is solid, but a
# label's halo or a crossing route can break it for a few pixels.
_ARM_GAP_BLOCKS = 2
# Two arms meet when their ends are this close.
_CORNER_BLOCKS = 3
# ... and stop there when, past the corner, the line they are on has
# ink on under this much of the next 140 px: the graticule runs on with
# ink on all of it (a tick or a label leaves 0.9).
_STOP_REACH = (4, 35)
_STOP_MAX_INK = 0.5
# A corner this far inside the face at least: the neatline's own
# corners are on its edge.
_CORNER_INSIDE_BLOCKS = 20
# A far side is framed when this much of it is ink, within a block
# either side (Los Angeles's inset frame 1.0, the chart's lines under
# 0.2); off the face when this much of it is.
_SIDE_MIN_FRAME = 0.55
_SIDE_MIN_OFF_FACE = 0.5
# Past the outer frame, the block its edge falls in.
_MARGIN_BLOCKS = 2


def _runs(line: np.ndarray) -> list:
    """(start, end) of each run of True in `line`, gaps of up to
    _ARM_GAP_BLOCKS bridged, at least _MIN_ARM_BLOCKS long."""
    hits = np.flatnonzero(line)
    if hits.size == 0:
        return []
    breaks = np.flatnonzero(np.diff(hits) > _ARM_GAP_BLOCKS + 1)
    starts = np.concatenate([[hits[0]], hits[breaks + 1]])
    ends = np.concatenate([hits[breaks], [hits[-1]]]) + 1
    return [(int(a), int(b)) for a, b in zip(starts, ends) if b - a >= _MIN_ARM_BLOCKS]


def _arms(dark: np.ndarray) -> list:
    """(line, start, end) of every arm along the rows of `dark`."""
    pair = dark[:-1] | dark[1:]
    return [(r, a, b) for r in range(pair.shape[0]) for a, b in _runs(pair[r])]


def _stops(line: np.ndarray, at: int, outward: int) -> bool:
    """Whether a line of ink in `line` stops at `at`, looking `outward`
    (+1 or -1) past it."""
    near, far = _STOP_REACH
    lo, hi = (at + near, at + far) if outward > 0 else (at - far, at - near)
    lo, hi = max(0, lo), min(len(line), hi)
    return hi <= lo or line[lo:hi].mean() < _STOP_MAX_INK


def _side(dark: np.ndarray, inside: np.ndarray, axis: int, at: int, a: int, b: int) -> bool:
    """Whether the box side on line `at` (a row for axis 0, a column for
    axis 1) between `a` and `b` is framed or off the face."""
    n = dark.shape[axis]
    if at <= 0 or at >= n - 1:
        return True  # the raster's own edge
    band = np.s_[max(0, at - 1) : at + 2, a:b] if axis == 0 else np.s_[a:b, max(0, at - 1) : at + 2]
    ink = dark[band].max(axis=axis)
    off = ~inside[band].max(axis=axis)
    return ink.mean() >= _SIDE_MIN_FRAME or off.mean() >= _SIDE_MIN_OFF_FACE


def find_framed_insets(dark: np.ndarray, inside: np.ndarray) -> list:
    """(r0, r1, c0, c1) in pooled blocks, the end exclusive, of each
    framed inset over the face: `dark` which blocks hold ink, `inside`
    which are in the face."""
    from scipy import ndimage as ndi

    rows, cols = dark.shape
    deep = ndi.binary_erosion(inside, iterations=_CORNER_INSIDE_BLOCKS)
    across = _arms(dark)
    down = [(c, a, b) for c, a, b in _arms(dark.T)]
    by_column: dict = {}
    for c, a, b in down:
        by_column.setdefault(c, []).append((a, b))
    boxes = []
    for r, h0, h1 in across:
        # Either end of the row arm, as the corner it may make.
        for corner_c, h_far in ((h0, h1), (h1 - 1, h0)):
            for c in range(corner_c - _CORNER_BLOCKS, corner_c + _CORNER_BLOCKS + 1):
                for v0, v1 in by_column.get(c, ()):
                    for corner_r, v_far in ((v0, v1), (v1 - 1, v0)):
                        if abs(corner_r - r) > _CORNER_BLOCKS or not deep[min(r, rows - 1), min(c, cols - 1)]:
                            continue
                        h_out = 1 if corner_c == h1 - 1 else -1
                        v_out = 1 if corner_r == v1 - 1 else -1
                        row_line = (dark[r] | dark[min(r + 1, rows - 1)]).astype(np.float32)
                        col_line = (dark[:, c] | dark[:, min(c + 1, cols - 1)]).astype(np.float32)
                        if not (_stops(row_line, corner_c, h_out) and _stops(col_line, corner_r, v_out)):
                            continue
                        r0, r1 = sorted((r, v_far))
                        c0, c1 = sorted((c, h_far))
                        # The two far sides: the row at the vertical arm's
                        # other end, the column at the horizontal one's.
                        far_row = v_far if v_out < 0 else v_far - 1
                        far_col = h_far if h_out < 0 else h_far - 1
                        if not (_side(dark, inside, 0, far_row, c0, c1) and _side(dark, inside, 1, far_col, r0, r1)):
                            continue
                        m = _MARGIN_BLOCKS
                        boxes.append((max(0, r0 - m), min(rows, r1 + m + 1), max(0, c0 - m), min(cols, c1 + m + 1)))
    return _merged(boxes)


def _merged(boxes: list) -> list:
    """The boxes with those inside another left out: an inset's double
    frame gives a box per frame."""
    kept = []
    for box in sorted(set(boxes), key=lambda b: -(b[1] - b[0]) * (b[3] - b[2])):
        if not any(k[0] <= box[0] and k[1] >= box[1] and k[2] <= box[2] and k[3] >= box[3] for k in kept):
            kept.append(box)
    return kept
