"""The paper panels a terminal area chart prints over its own face, found
and cut out of the face's mask with their titles, and the mask raster
itself, which cuts out a sectional's framed insets (wingtip.chart_insets)
the same way.

A TAC lays some of its notes and route diagrams over the chart: Puerto
Rico-VI's Low Offshore, Kemmo and Sunny & Eccho route panels and the
text box of their procedures sit over the Atlantic inside the sheet's
neatline. They are white paper boxes with a straight edge, and the map
drew them as if the ocean were paper; cut out, the sectional beneath
shows there, as it does past the collar. wingtip.chart_faces calls in
here once a sheet's face is found.

A panel is told from the chart's own paper by being large, a good part
paper, and bounded by four straight raster edges with chart outside
each, framed or not, its frame stopping at its corners: the
white label boxes ("CTC SAN JUAN APP WITHIN 20 NM") are paper and
straight but a few hundred pixels long at most; the white areas the
chart leaves untinted (west of Phoenix inside its hatched border, the
Great Salt Lake Desert's flats) are as large but bounded by the
geography, not a straight raster row and column; a cell of the graticule
is framed, but its lines run on.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np

from . import chart_insets

log = logging.getLogger(__name__)

# Everything here works in the pooled blocks of the face search
# (chart_edges.POOL_PX, 4 px), from the fraction of each block that is
# paper.
#
# Paper is looked for over this many blocks on a side (128 px, 2.7 km
# on a TAC): wide enough that a panel's drawings and text (a route's
# magenta rings, its arrows) average out to paper, and a road or a
# lettered label on the chart to chart.
_WINDOW_BLOCKS = 32
# ... where at least half of the window is paper: the seed of a panel,
# its sides found from it. Measured on the 10-29-2026 sheets: the seeds
# on Puerto Rico's four panels are 0.74 to 0.82 paper, the chart round
# them under 0.1 (water and land tints).
_MIN_WINDOW_PAPER = 0.5
# A panel is at least this many blocks on its shorter side and this
# many in all: 150 blocks is 600 px (Puerto Rico's smallest panel is
# 608 px by 1,648), where the largest label box on any TAC is under
# 120 px tall; 25,000 blocks is 0.4 Mpx (the smallest panel, 1.0 Mpx).
_MIN_SIDE_BLOCKS = 150
_MIN_AREA_BLOCKS = 25_000
# ... and a quarter paper over the box its sides make: Puerto Rico's are
# 0.33 (Sunny & Eccho, whose route map is drawn on the ocean's blue) to
# 0.82 (the text box); the boxes of chart the side search also closes
# round a white Class B band or a sheet's scale bars, 0.15 to 0.18.
_MIN_PANEL_PAPER = 0.25
# Each side is the panel's straight edge: walking out from inside the
# paper found with the window (which blurs a panel's edge by up to half
# its width, and leaves out the part of it a route diagram crowds) up
# to this far, the first raster line past which the chart's tint
# resumes ...
_SIDE_REACH_BLOCKS = 250  # 1,000 px: Puerto Rico's Low Offshore panel draws 440 px of its map above its text
# ... over the middle four-fifths of the side: this much tint on the
# lines outside it (past the one block the edge falls in; Puerto
# Rico's panels have the ocean there, 0.92 to 1.0), and on or just
# inside it either the panel's frame, a line of ink along this much of
# the side (1.0, or 0.6 on Sunny & Eccho's, which its route lines and
# rings cross), or the panel's paper, at most this much tint (its blue
# print and a route's magenta leave 0.0 to 0.3 of the lines inside the
# frameless text box tinted). West of Phoenix and on the Great Salt
# Lake Desert the chart's untinted areas have neither: no frame, and
# the geography's own edge leaves the lines inside their bounding boxes
# half tint and more.
_SIDE_MIN_TINT_OUT = 0.85
_SIDE_MAX_TINT_IN = 0.4
_SIDE_MIN_FRAME = 0.55
_SIDE_MAX_INK_OUT = 0.15
# A frame line that carries on this far past both of the box's corners
# with this much ink is the graticule, not a panel's frame.
_GRATICULE_REACH = 40
_GRATICULE_BAND = 3
_GRATICULE_MIN_INK = 0.5


def _edge(tint: np.ndarray, dark: np.ndarray, start: int) -> int | None:
    """The line a panel's side is on: `tint` and `dark` the fraction of
    chart tint (NaN past the face) and of ink in the side's blocks, one
    row per line with the outside toward index 0, walked out from
    `start`. None when the chart does not resume within reach."""
    past = np.isnan(tint)
    # Past the face counts as chart: a panel may run on into the collar,
    # where the face's own edge cuts it.
    outer = np.where(past, 1.0, tint).mean(axis=1)
    counted = (~past).sum(axis=1)
    inner = np.where(counted > 0, np.where(past, 0.0, tint).sum(axis=1) / np.maximum(counted, 1), 1.0)
    ink = dark.mean(axis=1)
    crossed_chart = False
    for i in range(min(start, len(outer) - 3), max(4, start - _SIDE_REACH_BLOCKS), -1):
        if outer[i - 3 : i - 1].mean() < _SIDE_MIN_TINT_OUT:
            continue
        # A frame is a line of ink with clean chart just outside it.
        if any(ink[j] >= _SIDE_MIN_FRAME and ink[j - 2] <= _SIDE_MAX_INK_OUT for j in (i - 1, i, i + 1)):
            return i - 1
        # A frameless edge is where the chart first resumes; past that
        # the walk is crossing tint inside the panel (an inset's sea,
        # as Puerto Rico's Low Offshore draws above its text) toward
        # the frame, and only a frame will do.
        if not crossed_chart and inner[i : i + 3].mean() <= _SIDE_MAX_TINT_IN:
            return i - 1
        crossed_chart = True
    return None


def find_paper_panels(white: np.ndarray, tint: np.ndarray, dark: np.ndarray, inside: np.ndarray) -> list:
    """(r0, r1, c0, c1) in pooled blocks, the end exclusive, of each
    paper panel inside the face: `white`, `tint` and `dark` the fraction
    of each block that is paper, chart tint and ink, `inside` which
    blocks are in the face."""
    from scipy import ndimage as ndi

    window = ndi.uniform_filter(np.where(inside, white, 0.0).astype(np.float32), _WINDOW_BLOCKS)
    labels, _ = ndi.label((window >= _MIN_WINDOW_PAPER) & inside)
    tint = np.where(inside, tint, np.nan)
    dark = dark.astype(np.float32)
    rows, cols = tint.shape
    half = _WINDOW_BLOCKS // 2
    panels = []
    for sl in ndi.find_objects(labels):
        r0, r1, c0, c1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if (r1 - r0) * (c1 - c0) < _MIN_AREA_BLOCKS / 4:
            continue
        # The middle four-fifths of each side: a panel's corners are
        # where its frame and a neighbouring line meet.
        ra, rb = r0 + (r1 - r0) // 10, r1 - (r1 - r0) // 10
        ca, cb = c0 + (c1 - c0) // 10, c1 - (c1 - c0) // 10
        top = _edge(tint[:, ca:cb], dark[:, ca:cb], r0 + half)
        bottom = _edge(tint[::-1, ca:cb], dark[::-1, ca:cb], rows - r1 + half)
        left = _edge(tint[ra:rb, :].T, dark[ra:rb, :].T, c0 + half)
        right = _edge(tint[ra:rb, ::-1].T, dark[ra:rb, ::-1].T, cols - c1 + half)
        if None in (top, bottom, left, right):
            continue
        box = (top, rows - bottom, left, cols - right)
        height, width = box[1] - box[0], box[3] - box[2]
        if min(height, width) < _MIN_SIDE_BLOCKS or height * width < _MIN_AREA_BLOCKS or box in panels:
            continue
        if white[box[0] : box[1], box[2] : box[3]].mean() < _MIN_PANEL_PAPER or _on_graticule(dark, inside, box):
            continue
        panels.append(box)
    return panels


# A panel's cut reaches past its edges by this much: Puerto Rico prints
# each route panel's title above its frame ("LOW OFFSHORE ROUTES", 64 to
# 68 px from the frame's top to the letters' top), and a cut along the
# frame itself left the title and a line of the frame over the sea
# (the owner's comparison with ForeFlight, 2026-11-21).
_CUT_MARGIN_BLOCKS = 25  # 100 px
# A cut that ends this close to the face's edge, or to the next panel's
# cut, runs on to it, rather than leave a strip of chart a few hundred
# pixels wide between: the procedures text box began 120 px below the
# neatline and the panels stand 80 to 190 px apart.
_CUT_JOIN_BLOCKS = 75  # 300 px


def panel_cuts(panels: list, inside: np.ndarray) -> list:
    """The boxes cut out of the face for `panels` (find_paper_panels):
    each panel with its title and frame, run on to the face's edge or
    the next panel's cut where either is near."""
    rows, cols = inside.shape
    m, j = _CUT_MARGIN_BLOCKS, _CUT_JOIN_BLOCKS
    cuts = []
    for r0, r1, c0, c1 in panels:
        # The middle half of each side, away from the corners, where the
        # face's own edge may be near the other sides.
        ra, rb = r0 + (r1 - r0) // 4, r1 - (r1 - r0) // 4
        ca, cb = c0 + (c1 - c0) // 4, c1 - (c1 - c0) // 4
        r0, r1, c0, c1 = max(0, r0 - m), min(rows, r1 + m), max(0, c0 - m), min(cols, c1 + m)
        # Off the face within reach on a side: run the cut to the
        # raster's edge (past the face nothing is drawn).
        top = not inside[max(0, r0 - j) : r0, ca:cb].all()
        bottom = not inside[r1 : r1 + j, ca:cb].all()
        left = not inside[ra:rb, max(0, c0 - j) : c0].all()
        right = not inside[ra:rb, c1 : c1 + j].all()
        cuts.append((0 if top else r0, rows if bottom else r1, 0 if left else c0, cols if right else c1))
    joins = []
    for a in cuts:
        for b in cuts:
            rows_both = (max(a[0], b[0]), min(a[1], b[1]))
            cols_both = (max(a[2], b[2]), min(a[3], b[3]))
            if rows_both[0] < rows_both[1] and 0 < b[2] - a[3] <= j:
                joins.append((rows_both[0], rows_both[1], a[3], b[2]))
            if cols_both[0] < cols_both[1] and 0 < b[0] - a[1] <= j:
                joins.append((a[1], b[0], cols_both[0], cols_both[1]))
    return cuts + joins


def _ruled_past(line: np.ndarray, a: int, b: int) -> bool:
    """Whether a line of ink along [a, b) carries on past both its ends."""
    ends = [line[max(0, a - _GRATICULE_REACH) : max(0, a - 4)], line[b + 4 : b + _GRATICULE_REACH]]
    return all(len(e) and e.mean() >= _GRATICULE_MIN_INK for e in ends)


def _on_graticule(dark: np.ndarray, inside: np.ndarray, box: tuple) -> bool:
    """Whether a box's frame is the chart's graticule: a cell of the
    15-minute grid with untinted chart in it (the white Washington SFRA
    band through one on the Baltimore-Washington sheet) has ink lines on
    its sides like a panel's frame, but they run on past its corners,
    where a panel's stop. A graticule line leans and bows across the
    raster's rows a little, so each side is the ink within a few lines
    of it. A side on the face's own edge is the neatline, which runs on
    too, and is not asked."""
    r0, r1, c0, c1 = box
    w = _GRATICULE_BAND
    bands = (
        (np.s_[max(0, r0 - w) : r0 + w + 2, :], 0, c0, c1),
        (np.s_[max(0, r1 - w - 2) : r1 + w, :], 0, c0, c1),
        (np.s_[:, max(0, c0 - w) : c0 + w + 2], 1, r0, r1),
        (np.s_[:, max(0, c1 - w - 2) : c1 + w], 1, r0, r1),
    )
    for band, axis, a, b in bands:
        line = dark[band].max(axis=axis)
        on_face = inside[band].min(axis=axis)[a:b].mean() >= 0.9
        if on_face and line[a:b].mean() >= _SIDE_MIN_FRAME and _ruled_past(line, a, b):
            return True
    return False


def write_mask(path: Path, keep: np.ndarray, crs, transform, pool: int) -> None:
    """A mask raster the renderer warps alongside a sheet (chart_warp):
    255 where the sheet is drawn, 0 where it is not, one pixel per
    `pool`-pixel block of the sheet."""
    import rasterio
    from rasterio.transform import Affine

    rows, cols = keep.shape
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=cols,
        height=rows,
        count=1,
        dtype="uint8",
        crs=crs,
        transform=transform @ Affine.scale(pool),
        compress="deflate",
    ) as out:
        out.write(np.where(keep, 255, 0).astype(np.uint8), 1)


def cut_mask(path: Path, kind, ink, inside: np.ndarray, pool: int) -> Path | None:
    """For a kind that prints paper panels (the TAC) or framed insets
    (the sectional) over its face, the mask raster beside the sheet at
    `path` that cuts them out, None when the sheet has none; a mask left
    by an earlier detection is removed with it. `ink` is the face
    search's pooled paper, tint and ink, `inside` its blocks in the face."""
    if not (kind.paper_panels or kind.framed_insets):
        return None
    mask_path = path.with_name(f"{path.stem}.mask.tif")
    cuts = []
    if kind.paper_panels:
        panels = find_paper_panels(ink.white, ink.tint, ink.dark, inside)
        for r0, r1, c0, c1 in panels:
            log.info("%s: paper panel cut out, %d x %d px", path.name, (c1 - c0) * pool, (r1 - r0) * pool)
        cuts += panel_cuts(panels, inside)
    if kind.framed_insets:
        insets = chart_insets.find_framed_insets(ink.dark, inside)
        for r0, r1, c0, c1 in insets:
            log.info("%s: framed inset cut out, %d x %d px", path.name, (c1 - c0) * pool, (r1 - r0) * pool)
        cuts += insets
    if not cuts:
        mask_path.unlink(missing_ok=True)
        return None
    keep = np.ones(ink.white.shape, dtype=bool)
    for r0, r1, c0, c1 in cuts:
        keep[r0:r1, c0:c1] = False
    write_mask(mask_path, keep, ink.crs, ink.transform, pool)
    return mask_path
