"""Finding the masked-line bands in a sectional's raster: the strip of
paper the FAA's masking leaves along another chart's boundary, searched
for at a coarse scale and measured across at full resolution before
anything is touched. wingtip.chart_masked_lines extends, fills and
removes what is found here.

Split out of wingtip.chart_faces, which keeps the face of a sheet.
"""

from __future__ import annotations

import numpy as np


# ---------------------------------------------------------------------------
# The masked line, taken back out of the sectional
# ---------------------------------------------------------------------------
#
# A sectional marks where a terminal area chart takes over -- and where
# one of its own insets does -- with a "masked line": a band a few
# millimetres wide on the paper sheet (thirty-odd pixels of raster, a
# kilometre and a half of ground) along the other chart's boundary,
# where the terrain tint is knocked out to bare paper and "TAC" or
# "INSET" is lettered at intervals. Everything crossing it -- roads,
# rivers, obstructions, airways -- is still printed over it. On paper
# it points at another sheet. On this map, which draws that sheet
# itself when asked (the TAC layer), it was a white box around every
# Class B whether the TAC was drawn or not, and read as a seam.
#
# `remove_masked_lines` finds the bands and puts the tint back under
# them. Only paper changes: each paper pixel of a band takes the tint
# of the nearest chart just outside it. Ink is left exactly as printed,
# the lettering included -- it is the same blue as real symbols, and a
# filter that told "TAC" from an obstruction height lying in the band
# would have to be trusted not to delete the obstruction.
#
# A band is searched for as paper that runs straight for kilometres
# with chart either side, and then measured across at full resolution
# before anything is touched. The white label boxes ("CTC MEMPHIS APP
# WITHIN 20 NM") are straight and even too, but have a border inside
# them and are only a few times longer than they are wide; dry lakes,
# salt flats, beaches and the white of a neighbouring country have
# ragged edges and no steady width. A sheet with no TAC and no inset
# finds nothing.

BAND_BLOCK = 4  # searched at a quarter of the raster's resolution
_BAND_RUN = 61  # blocks a band stays paper along (about 10 km)
_BAND_SIDE = 14  # blocks either side of it that must be chart, not paper
_BAND_MIN_BLOCKS = 100  # blocks (about 17 km) a band runs at the least
_BAND_BRIDGE = 41  # blocks of lettering or crossing linework a band is joined across
_BAND_PAPER_IN, _BAND_PAPER_OUT = 0.55, 0.25
# Measured across every this many pixels, a band is a strip of paper
# of steady width, whose edges lie on smooth lines for most of its
# length, mostly paper inside. Its width depends on the sheet (about 40
# pixels round a TAC, 100 round the Alaska insets); a label box is as
# wide as that but only a few times longer, with a border inside it.
BAND_STEP_PX = 24
_BAND_CHART_RUN_PX = 10  # not-paper this long across is the chart resuming, not a line over the band
_BAND_WIDTH_PX = (18, 120)
_BAND_WIDTH_SPREAD_PX = 4
_BAND_MIN_ON_EDGE = 0.3
_BAND_MAX_EDGE_WOBBLE_PX = 2.5  # the scan's pale edge colours jitter it a pixel or two
_BAND_MIN_PAPER = 0.4
_BAND_BOX_ASPECT = 10
_BAND_BOX_BORDERED = 0.25
_BAND_MIN_SECTIONS = 8
_BAND_MIN_SECTION_SHARE = 0.3
# A candidate that runs on from a band already measured -- the fourth
# side of a box whose other three are, the rest of a side a crossing
# broke -- has that for evidence, and is measured again more loosely:
# busy stretches of chart leave fewer clean cuts across a band.
BAND_NEIGHBOUR_BLOCKS = 30  # past the corner square of the widest bands (100 px, round the Alaska insets)
_BAND_LOOSE = {"wobble": 5.0, "on_edge": 0.15, "spread": 12, "paper": 0.3}
# ... and, beside a band, a run need only be this much paper to be
# looked at at all: where a band crosses a town, the lettering, the
# symbols and their halos can leave a third of it paper.
BAND_PAPER_IN_NEAR = 0.3
# ... and be this short: the last few kilometres of a band before a
# sheet's own edge cuts it off.
BAND_MIN_BLOCKS_NEAR = 40


def _shifted(a: np.ndarray, by: int, axis: int, fill) -> np.ndarray:
    """`a` moved `by` places along `axis`, the vacated end filled --
    np.roll without the wrap-around, which would bring one edge of the
    sheet in beside the other."""
    out = np.full_like(a, fill)
    src = [slice(None)] * a.ndim
    dst = [slice(None)] * a.ndim
    if by >= 0:
        src[axis], dst[axis] = slice(0, a.shape[axis] - by), slice(by, None)
    else:
        src[axis], dst[axis] = slice(-by, None), slice(0, a.shape[axis] + by)
    out[tuple(dst)] = a[tuple(src)]
    return out


def faces_in_blocks(crs, transform, faces, shape: tuple) -> np.ndarray:
    """Which search blocks lie inside the chart face: the face boxes,
    traced along their edges into the raster's own projection (where a
    parallel is an arc) and filled."""
    from affine import Affine
    from rasterio.features import rasterize
    from rasterio.warp import transform as transform_points

    shapes = []
    for west, south, east, north in faces:
        n = 200
        lons = np.concatenate([np.linspace(west, east, n), np.full(n, east), np.linspace(east, west, n), np.full(n, west)])
        lats = np.concatenate([np.full(n, south), np.linspace(south, north, n), np.full(n, north), np.linspace(north, south, n)])
        xs, ys = transform_points("EPSG:4326", crs, lons.tolist(), lats.tolist())
        ring = list(zip(xs, ys))
        shapes.append(({"type": "Polygon", "coordinates": [ring + ring[:1]]}, 1))
    block = transform @ Affine.scale(BAND_BLOCK, BAND_BLOCK)
    return rasterize(shapes, out_shape=shape, transform=block).astype(bool)


def band_candidates(paper: np.ndarray, inside: np.ndarray, paper_in: float = _BAND_PAPER_IN, min_blocks: int = _BAND_MIN_BLOCKS) -> list:
    """(axis, mask, span) for each straight run of paper with chart
    either side, in search blocks: axis 0 runs down the raster, 1
    across it; `mask` is the run within `span`. `paper_in` is how much
    of a run must be paper and `min_blocks` how long it must be, both
    less where a band is expected."""
    from scipy import ndimage as ndi

    p = paper.astype(np.float32)
    found = []
    for axis in (0, 1):
        across = 1 - axis
        # reflected at the raster's own edge: a band the sheet's edge cuts
        # off is as much paper up to it as anywhere else
        along = ndi.uniform_filter1d(p, _BAND_RUN, axis=axis, mode="reflect")
        ridge = (
            (along >= paper_in)
            & (_shifted(along, _BAND_SIDE, across, 1.0) <= _BAND_PAPER_OUT)
            & (_shifted(along, -_BAND_SIDE, across, 1.0) <= _BAND_PAPER_OUT)
            & inside
            & _shifted(inside, _BAND_SIDE, across, False)
            & _shifted(inside, -_BAND_SIDE, across, False)
            # a band, not a line: paper for several blocks across it too
            & (ndi.uniform_filter1d(along, 5, axis=across) >= 0.8 * paper_in)
        )
        line = np.ones((_BAND_BRIDGE, 1) if axis == 0 else (1, _BAND_BRIDGE), bool)
        ridge = ndi.binary_closing(ridge, line) & inside
        labels, _ = ndi.label(ridge, structure=np.ones((3, 3), bool))
        for i, span in enumerate(ndi.find_objects(labels), 1):
            if span[axis].stop - span[axis].start >= min_blocks:
                found.append((axis, labels[span] == i, span))
    return found


def measure_band(
    data: np.ndarray, paper_lut: np.ndarray, tint_lut: np.ndarray, axis: int, mask: np.ndarray, span: tuple, loose: bool = False
) -> tuple | None:
    """A candidate measured at full resolution: (axis, first, last, left
    edge, right edge) -- the run along the raster it covers and its two
    edges as quadratics in the position along it -- when it measures as
    a masked line, None when it does not.

    Cut across every few pixels, a band's edge is the last paper before
    the chart resumes: before a long run of anything that is not paper.
    The lines and letters over the band are a few pixels thick; the
    tint beyond it -- a flat green, or a mountain's shading in dozens of
    shades -- goes on. A halo beside the band can push an edge out and a
    solid symbol in it can pull one in, so each edge is fitted to the
    sections that agree: a running median first, then the ones on it. A
    masked line then has edges on smooth lines (a parallel is an arc,
    so a quadratic) along most of its length, a steady width, mostly
    paper inside, and is far longer than it is wide -- which a label box
    is not, and a label box has its border just outside its paper.
    `loose` is for a candidate running on from a band already measured."""
    from scipy import ndimage as ndi

    wobble = _BAND_LOOSE["wobble"] if loose else _BAND_MAX_EDGE_WOBBLE_PX
    min_on_edge = _BAND_LOOSE["on_edge"] if loose else _BAND_MIN_ON_EDGE
    spread = _BAND_LOOSE["spread"] if loose else _BAND_WIDTH_SPREAD_PX
    min_paper = _BAND_LOOSE["paper"] if loose else _BAND_MIN_PAPER

    b = BAND_BLOCK
    grid = data if axis == 0 else data.T
    mask = mask if axis == 0 else mask.T
    (along0, along1), across0 = (
        ((span[0].start, span[0].stop), span[1].start) if axis == 0 else ((span[1].start, span[1].stop), span[0].start)
    )
    half = 2 * _BAND_SIDE * b
    linework = ~paper_lut & ~tint_lut
    sections, found = 0, []
    for pos in range(along0 * b, min(along1 * b, grid.shape[0]), BAND_STEP_PX):
        blocks = np.nonzero(mask[pos // b - along0])[0]
        if not len(blocks):
            continue
        sections += 1
        centre = int((across0 + blocks.mean()) * b + b // 2)
        lo = max(centre - half, 0)
        row = grid[pos, lo : min(centre + half, grid.shape[1])]
        on = paper_lut[row]
        c = centre - lo
        start = next((c + d for d in (0, -1, 1, -2, 2, -3, 3) if 0 <= c + d < len(on) and on[c + d]), None)
        if start is None:
            continue  # something printed right across the centre line here
        edges = []
        for step in (-1, 1):
            i, last, gap = start, start, 0
            while 0 <= i < len(on) and gap < _BAND_CHART_RUN_PX:
                if on[i]:
                    last, gap = i, 0
                else:
                    gap += 1
                i += step
            edges.append(last if gap >= _BAND_CHART_RUN_PX else None)
        left, right = edges
        if left is None or right is None:
            continue  # paper as far as the section reaches: not a band
        bordered = bool(linework[row[max(left - 2, 0) : left]].any() and linework[row[right + 1 : right + 3]].any())
        found.append((pos, lo + left, lo + right, float(on[left : right + 1].mean()), bordered))
    if len(found) < max(_BAND_MIN_SECTIONS, _BAND_MIN_SECTION_SHARE * sections):
        return None
    pos, left, right, paper, bordered = (np.array(v) for v in zip(*found))

    on_edge, fits = [], []
    for edge in (left, right):
        fit = np.polyfit(pos, ndi.median_filter(edge, size=9, mode="nearest").astype(float), 2)
        for _ in range(4):
            keep = np.abs(edge - np.polyval(fit, pos)) <= wobble
            if keep.sum() < _BAND_MIN_SECTIONS:
                return None
            fit = np.polyfit(pos[keep], edge[keep], 2)
        on_edge.append(np.abs(edge - np.polyval(fit, pos)) <= wobble)
        fits.append(fit)
    both = on_edge[0] & on_edge[1]
    if min(on_edge[0].mean(), on_edge[1].mean()) < min_on_edge or both.sum() < _BAND_MIN_SECTIONS:
        return None
    # ... all along it, not in one stretch: a lake narrows for a while.
    either = on_edge[0] | on_edge[1]
    if min(either[third].mean() for third in np.array_split(np.arange(len(pos)), 3)) < min_on_edge:
        return None
    width = (right - left + 1)[both]
    q1, median, q3 = np.percentile(width, [25, 50, 75])
    if not _BAND_WIDTH_PX[0] <= median <= _BAND_WIDTH_PX[1] or q3 - q1 > spread:
        return None
    if float(np.median(paper[both])) < min_paper:
        return None
    length = float(pos.max() - pos.min() + BAND_STEP_PX)
    if length < _BAND_BOX_ASPECT * median and float(bordered[both].mean()) >= _BAND_BOX_BORDERED:
        return None
    return axis, int(pos.min()), int(pos.max()), fits[0], fits[1]
