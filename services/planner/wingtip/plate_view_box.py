"""Where a plate's plan view is on its page (wingtip.plates): the long
straight lines the d-TPP boxes it with, the box round its airport, and
the boxes of their own in its lower corners (the airport sketch's), read
from the page's drawn paths with pdfium. Kept apart from the plates'
fetching and placing, which ask it."""

from __future__ import annotations

import pypdfium2.raw as pdfium_c

#: A line that boxes the plan view: this long at least, in points.
BOX_LINE_PT = 150.0
#: A line that boxes a corner box of the plan view (corner_boxes): this
#: long at least, in points.
CORNER_LINE_PT = 60.0
#: How far past the airport, above and below, a side of its plan view
#: runs at least, in points.
SIDE_PAST_PT = 5.0


def _box_lines(page) -> tuple:
    """The page's straight lines at least CORNER_LINE_PT long: horizontal
    ones as (y, left, right), vertical ones as (x, bottom, top). A
    rectangle's sides are among them -- the chart's frame, the plan
    view's sides, is one."""
    across, down = [], []
    for obj in page.get_objects(max_depth=15):
        if obj.type != pdfium_c.FPDF_PAGEOBJ_PATH:
            continue
        left, bottom, right, top = obj.get_bounds()
        w, h = right - left, top - bottom
        if w >= CORNER_LINE_PT and h < 2:
            across.append(((bottom + top) / 2, left, right))
        elif h >= CORNER_LINE_PT and w < 2:
            down.append(((left + right) / 2, bottom, top))
        elif w >= CORNER_LINE_PT and h >= CORNER_LINE_PT and pdfium_c.FPDFPath_CountSegments(obj.raw) in (4, 5):
            across += [(bottom, left, right), (top, left, right)]
            down += [(left, bottom, top), (right, bottom, top)]
    return across, down


def plan_view_box(across: list, down: list, airport: tuple, page: tuple) -> tuple:
    """The plan view's box on the page, (left, bottom, right, top), round
    the airport drawn in it: the nearest long lines to either side of it,
    then above and below it across that width, the page's own edges where
    there is none."""
    width, height = page
    x, y = airport
    across = [line for line in across if line[2] - line[1] >= BOX_LINE_PT]
    down = [line for line in down if line[2] - line[1] >= BOX_LINE_PT]
    # A side runs past the airport, above and below: the profile's own
    # divider, under a plan view whose airport is drawn at its foot, ends
    # at the airport's height (KLSE's RNAV (GPS) RWY 18).
    beside = lambda lo, hi: lo <= y - SIDE_PAST_PT and hi >= y + SIDE_PAST_PT  # noqa: E731
    left = max((at for at, lo, hi in down if at < x and beside(lo, hi)), default=0.0)
    right = min((at for at, lo, hi in down if at > x and beside(lo, hi)), default=width)
    # Its top and bottom lines need only run along part of it: under the
    # plan view, the profile's box and the minimums' are often drawn as
    # lines of their own, side by side.
    along = lambda lo, hi: min(hi, right) - max(lo, left) >= BOX_LINE_PT / 2  # noqa: E731
    top, top_lo, top_hi = min(((at, lo, hi) for at, lo, hi in across if at > y and along(lo, hi)), default=(height, 0.0, width))
    bottom = max((at for at, lo, hi in across if at < y and along(lo, hi)), default=0.0)
    # Where no side is drawn as a line of its own, the line over the plan
    # view -- the foot of the frequencies' row, across the whole chart --
    # ends at its sides (KJVL's ILS OR LOC RWY 32).
    if left == 0.0:
        left = top_lo
    if right == width:
        right = top_hi
    return left, bottom, right, top


def corner_boxes(across: list, down: list, box: tuple, airport: tuple) -> list:
    """Boxes of their own in the plan view's lower corners, (left,
    bottom, right, top) each: the airport sketch's, beside the profile,
    whose top is the plan view's foot on that side while the profile's
    is its foot on the other (KDLH's ILS OR LOC RWY 09). A line from a
    side, under the airport, with a line from its other end down to the
    box's foot."""
    left, bottom, right, top = box
    found = []
    for at, lo, hi in across:
        if not bottom + 2 < at < airport[1]:
            continue
        if lo <= left + 3 < hi < right - 3:
            end = hi
        elif left + 3 < lo < right - 3 <= hi:
            end = lo
        else:
            continue
        if any(abs(x - end) < 3 and low <= bottom + 3 and high >= at - 3 for x, low, high in down):
            found.append((max(lo, left), bottom, min(hi, right), at))
    return found
