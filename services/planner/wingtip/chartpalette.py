"""What a sectional draws and how to recognise it by colour: the palette
classes (water, towns, rivers, roads and rails), the colour tests, the
thresholds the line classes are held to, and the Landmark a detection
becomes. wingtip.chartvision reads the chart with these."""

from __future__ import annotations

import threading
from dataclasses import dataclass, field

import numpy as np


@dataclass
class PaletteClass:
    """One thing the chart draws, and how to recognise its pixels.

    `test` takes the R/G/B planes as integer arrays and returns a boolean
    mask. Written as relationships between channels rather than distance
    to a reference colour because the tiles are JPEG-compressed: a lake
    interior varies by 20-30 per channel, but blue stays dominant over
    red throughout.
    """

    name: str
    test: object
    min_area_px: int
    # Upper bound, where being too big is itself disqualifying. An
    # airport symbol is a small glyph; a magenta region the size of a
    # county is airspace shading wearing the same colour.
    max_area_px: int | None = None
    # For linear classes: how far the feature must run before it counts
    # as a line rather than a glyph -- see MIN_LINE_EXTENT_PX.
    min_extent_px: int = 0
    # For linear classes: how thick its stroke may be, as the furthest
    # any of its pixels lies from its edge -- see MAX_LINE_HALF_WIDTH_PX.
    max_half_width_px: float | None = None
    # For fills: the most of its bounding box a blob may fill. A lake is
    # never a rectangle; the pale fill inside a boxed chart label is.
    max_box_fill: float | None = None
    # Roughly how confidently this class means "a pilot can find it".
    # Water and towns are unambiguous on a chart; anything softer would
    # need the learned scorer rather than a constant.
    base_score: float = 3.0
    # Drawn in the ink of the chart's latitude and longitude lines, which
    # are therefore taken out first (Mosaic.graticule).
    graticule_ink: bool = False


def _water(r, g, b):
    # Sampled at Nepco Lake: (190, 223, 238). Blue clearly above red, and
    # light -- the chart's water is a tint, not a saturated blue.
    return (b > r + 25) & (b > 200) & (g > r) & (r > 120)


def _urban(r, g, b):
    # The (250, 248, 86) yellow used for built-up areas.
    return (r > 210) & (g > 200) & (b < 160)


def _airport(r, g, b):
    """The magenta an airport is drawn in. Kept, but NOT in PALETTE.

    Colour cannot find airports on a sectional, and this function is here
    to record why rather than to be used for detection. The magenta is
    real -- sampled at KISW and Wag-Aero as (83,36,52), (74,12,33),
    (86,18,39) -- but the chart shades Class E and Class D airspace in the
    same colour over enormous areas. Detecting on colour returned 554
    "airports" on one 323 nm route. Bounding blob size to something
    glyph-shaped only got that to 535, because the vignette is a gradient
    and thresholding a gradient produces speckle at every size. Worse, at
    KISW's own coordinates the near-black linework of the runway symbol
    outvoted the magenta.

    Airports are the one landmark class where vision is the wrong tool
    anyway: they are a finite, enumerated set with exact published
    coordinates, and this project already caches the FAA's own APT_BASE.
    Reading a local file beats inferring from pixels. See
    wingtip.faa_data.load_route_airports, merged in by the planner.

    Still used by _dark_line, which subtracts it so airport magenta is at
    least not reported as a road.
    """
    return (r > g + 25) & (b > g + 8) & (r < 170) & (g < 90)


def _river_line(r, g, b):
    """A river or stream, drawn as a dark blue line rather than a fill.

    Distinct from _water and missed entirely by it: the chart fills a
    lake with a pale tint around (190,223,238) but draws a watercourse as
    a saturated dark blue line, sampled between (0,43,85) and (3,82,113)
    at points a pilot marked by hand.

    The colour alone is not a river, though. On the FAA's rasters the
    same dark blue draws the obstacle symbols and their heights, the
    maximum elevation figures, marsh symbols and airspace lines, and
    taken at its word this read 89 "river" crossings on C81->KDLH of
    which some 26 were rivers. The river class therefore also has a
    shape (see LINEAR_PALETTE): a line runs, and it is thin.
    """
    return (b > r + 40) & (b > 55) & (r < 110) & (g < b + 20)


def _dark_line(r, g, b):
    """Roads, railroads and boundaries: the chart's black linework.

    Deliberately one class rather than three. They are all near-black and
    separating them needs stroke pattern -- railroads carry cross ticks,
    boundaries are dashed -- which is a different kind of analysis than a
    colour test. As a *crossing* they are all the same thing to a pilot
    anyway: a line the course cuts at a knowable point. Which kind it is
    gets settled during labeling.
    """
    dark = (r < 110) & (g < 115) & (b < 110)
    # Airport magenta is dark too. Excluded here rather than relying on
    # ordering, because linear_crossings runs its own palette and would
    # otherwise report every airport symbol as a road crossing.
    return dark & ~_airport(r, g, b)


# Fills are found as blobs and reported at their centroid. Lines are
# found as crossings of the course, because the centroid of a river is
# not a place -- see linear_crossings.
# No airport class here, deliberately -- see _airport.
PALETTE = (
    PaletteClass("water", _water, min_area_px=40, max_box_fill=0.9, base_score=4.2),
    PaletteClass("town", _urban, min_area_px=400, base_score=4.0),
)

# Each palette class's colour test answered once for every colour a
# pixel can be, as a bit in a 16 MB table indexed by 0xRRGGBB, and then
# looked up per pixel (Mosaic.colour): the tests are arithmetic over a
# block's millions of pixels, several times over per block, and a
# sectional is drawn in a handful of colours. Built on first use.
_COLOUR_BITS: dict = {}
_COLOUR_TABLE: np.ndarray | None = None
_COLOUR_TABLE_LOCK = threading.Lock()


def _colour_table() -> np.ndarray:
    global _COLOUR_TABLE
    with _COLOUR_TABLE_LOCK:
        if _COLOUR_TABLE is None:
            table = np.zeros(1 << 24, dtype=np.uint8)
            g, b = np.meshgrid(np.arange(256, dtype=np.int16), np.arange(256, dtype=np.int16), indexing="ij")
            for red in range(256):
                r = np.full_like(g, red)
                row = table[red << 16 : (red + 1) << 16].reshape(256, 256)
                for test, bit in _COLOUR_BITS.items():
                    row |= np.where(test(r, g, b), bit, 0).astype(np.uint8)
            _COLOUR_TABLE = table
        return _COLOUR_TABLE


# Two crossing pixels further apart than this along the course are
# separate crossings. A river meanders and can cut the course several
# times within a mile, but below this they are one checkpoint.
CROSSING_SEPARATION_PX = 24

# How far the feature under a crossing must extend before it counts as a
# line at all, measured as the longer side of its connected component's
# bounding box. 60 px at zoom 12 is a bit over 2 km.
#
# This is what separates a road from a letter. Chart text is drawn in the
# same near-black ink as roads, so "Nepco Lake" and every airport name
# matched the linework test and produced crossings on bare grass wherever
# a label happened to sit near the course. Measured over one tile block:
# the median dark-line component is 1 px across and the 99th percentile
# is 31 px, while genuine roads and rivers are the handful that run for
# hundreds. Requiring real extent keeps those and discards the text,
# without needing to recognise text as such.
MIN_LINE_EXTENT_PX = 60

# A landmark abeam has to be bigger to be usable than the same landmark
# underneath you. Apparent size falls off with distance, so the area
# required grows with the square of how far off course it sits: a pond
# 290 m across is a fine checkpoint overhead and invisible at four miles.
#
# This is the answer to "why are there 400 candidates". The corridor was
# widened from 1 nm to 4 nm half-width to admit visual references, which
# multiplied the searched area four-fold -- 8,900 km2 on one route -- and
# nearly all of the extra was small water. Median blob was 0.084 km2 with
# only 24 of 209 above 1 km2. The area is not wrong; requiring the same
# minimum size across all of it was.
ON_COURSE_NM = 1.0

# An obstacle is drawn as a small inverted V, in the same near-black ink,
# and is a hazard to avoid rather than a checkpoint to look for. The
# extent test removes it for the same reason it removes text: the glyph
# is a dozen pixels across and goes nowhere.

# A river runs at least this far, measured as for MIN_LINE_EXTENT_PX: a
# single digit or a marsh symbol's tuft is shorter. Not much further --
# where a road, a label or a symbol is drawn over a river the chart breaks
# its line, and pieces of 27 to 36 px were crossings picked by hand. (The
# rule once had no extent test at all: on the hosted tiles it ran against
# then, text was never blue, and a 60 px test cost real crossings.)
MIN_RIVER_EXTENT_PX = 24

# And a river is thin where the course crosses it: its pixels there lay 2
# to 5.4 px from its edge at zoom 12, where an obstacle symbol's lie 7 to
# 8.5 (a filled, heavy glyph) and a maximum elevation figure's 9 to 15.
MAX_LINE_HALF_WIDTH_PX = 6.0
# How far either side of a crossing a long line's thickness is read. A
# river that runs into a lake is one component with the lake's outline,
# thick where they meet, and is still a thin line where the course cuts
# it. Anything shorter than LOCAL_THICKNESS_FROM_PX is read whole: an
# obstacle symbol is thin at its tips and its dots, and a course passing
# by one of those is still passing a symbol.
LINE_THICKNESS_WINDOW_PX = 8
LOCAL_THICKNESS_FROM_PX = 120

# A short piece of blue is a river only if it is a line: its pixels over
# its length (its average width, near enough) no more than this. The
# obstacle heights beside each obstacle, "1538 (430)", are as long as a
# broken river's pieces and as thin in the stroke, but a number's digits
# pack 6 to 16 px of ink per pixel of length, a line 3 to 5.
SHORT_LINE_PX = 60
MAX_SHORT_LINE_FILL = 5.5


# The sectional's latitude and longitude lines, every half degree, and
# how far either side of one its stroke is taken out: the line is two
# pixels at zoom 12, and the warp from the FAA's projection places it to
# within one (Mosaic.graticule).
GRATICULE_STEP_DEG = 0.5
GRATICULE_HALF_WIDTH_PX = 3

LINEAR_PALETTE = (
    PaletteClass(
        "river", _river_line, min_area_px=12, min_extent_px=MIN_RIVER_EXTENT_PX, max_half_width_px=MAX_LINE_HALF_WIDTH_PX, base_score=4.3
    ),
    PaletteClass("road_or_rail", _dark_line, min_area_px=12, min_extent_px=MIN_LINE_EXTENT_PX, base_score=3.6, graticule_ink=True),
)

_COLOUR_BITS.update({spec.test: 1 << i for i, spec in enumerate(PALETTE + LINEAR_PALETTE)})


@dataclass
class Landmark:
    """One thing found on the chart, in the candidate schema's shape."""

    category: str
    lat: float
    lon: float
    area_m2: float
    score: float
    pixels: int
    name: str | None = None  # filled in later by name cross-check, if at all
    extras: dict = field(default_factory=dict)
