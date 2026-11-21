"""The FAA chart kinds the map draws: the sectional, the terminal area
chart, and the IFR enroute charts low, high and area. Each kind names the
zip its sheets come in, the zooms it is drawn at, the collar to fall back
on and how its face is found; zip_url and is_chart_member say which zip
and which of its members are a sheet.

Where each sheet is, is wingtip.chart_coverage; the rest of the chart
pipeline, wingtip.charts' docstring maps.
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import (
    FAA_ENROUTE_ZIP_URL,
    FAA_VISUAL_ZIP_URL,
    IFR_AREA_MAX_ZOOM,
    IFR_AREA_MIN_ZOOM,
    IFR_HIGH_MAX_ZOOM,
    IFR_HIGH_MIN_ZOOM,
    IFR_LOW_MAX_ZOOM,
    IFR_LOW_MIN_ZOOM,
    VFR_SECTIONAL_MAX_ZOOM,
    VFR_SECTIONAL_MIN_ZOOM,
    VFR_TAC_MAX_ZOOM,
    VFR_TAC_MIN_ZOOM,
)


Box = tuple[float, float, float, float]  # (west, south, east, north), degrees


@dataclass(frozen=True)
class ChartKind:
    key: str  # what the API and the tile cache call it
    label: str  # what the map's layer picker calls it
    zip_url: str  # the FAA's URL template for one chart's zip, with {cycle} and {name}
    raster_suffixes: tuple  # which members of the zip are the chart (a TAC zip also carries the flyway planning chart)
    min_zoom: int
    max_zoom: int
    # Typical collar widths (west, south, east, north) in degrees, for
    # a raster whose neatline could not be found: the sectional's west
    # collar is the legend column, its north one the communication
    # boxes; a TAC carries its legend down both sides.
    fallback_collar: Box
    # A base layer the map draws one of (sectional, IFR low, IFR high),
    # or an overlay drawn on top of a base: `over` names the base kinds
    # it belongs over (the TAC over the sectional, the IFR area charts
    # over the IFR enroute charts).
    base: bool = True
    over: tuple = ()
    # How the chart face is found in the raster. A VFR sheet's neatline
    # follows parallels and meridians, which curve and lean across the
    # sheet; an IFR enroute chart's border is the sheet's own rectangle,
    # straight rows and columns of pixels, with the legend panels'
    # table rules the only other straight lines on it.
    straight_border: bool = False
    # Whether the sheets carry masked lines -- the paper band a
    # sectional prints around a TAC's coverage and its own insets --
    # to be taken back out when a sheet is prepared (see
    # chart_faces.remove_masked_lines).
    masked_lines: bool = False
    # How far in from each side of the raster, as a share of its width
    # or height, the face's edge is looked for. A TAC prints its legend
    # and its Class B notes down the sides, a third of the sheet across
    # on Minneapolis-St Paul's east side: a quarter stopped short of its
    # neatline, the collar guessed, and the notes drawn over Wisconsin as
    # chart (the owner's screenshot, 2026-11-20).
    edge_search: float = 0.25
    # Whether the sheets print paper panels over the chart face, cut out
    # of it when the face is found (wingtip.chart_panels): a TAC's route
    # diagrams and notes laid over open water.
    paper_panels: bool = False
    # Whether the sheets lay framed insets over the face, tinted maps of
    # a busy area at a larger scale (wingtip.chart_insets), cut out of
    # it as the paper panels are: the sectional's Los Angeles basin over
    # the Pacific.
    framed_insets: bool = False


SECTIONAL = ChartKind(
    "sec",
    "Sectional",
    FAA_VISUAL_ZIP_URL.replace("{folder}", "sectional-files"),
    (" SEC.tif", " VFR Chart.tif"),
    VFR_SECTIONAL_MIN_ZOOM,
    VFR_SECTIONAL_MAX_ZOOM,
    (1.1, 0.2, 0.35, 0.55),
    masked_lines=True,
    framed_insets=True,
)
TAC = ChartKind(
    "tac",
    "Terminal area",
    FAA_VISUAL_ZIP_URL.replace("{folder}", "tac-files").replace("{name}", "{name}_TAC"),
    (" TAC.tif",),
    VFR_TAC_MIN_ZOOM,
    VFR_TAC_MAX_ZOOM,
    (0.35, 0.02, 0.35, 0.08),
    base=False,
    over=("sec",),
    edge_search=0.45,
    paper_panels=True,
)
IFR_LOW = ChartKind(
    "ifr_low", "IFR low", FAA_ENROUTE_ZIP_URL, (".tif",), IFR_LOW_MIN_ZOOM, IFR_LOW_MAX_ZOOM, (0.3, 0.3, 0.3, 0.3), straight_border=True
)
IFR_HIGH = ChartKind(
    "ifr_high", "IFR high", FAA_ENROUTE_ZIP_URL, (".tif",), IFR_HIGH_MIN_ZOOM, IFR_HIGH_MAX_ZOOM, (0.3, 0.3, 0.3, 0.3), straight_border=True
)
# The IFR area charts: the enroute charts' own terminal-area sheets
# (Atlanta, Chicago, Denver ... fourteen of them, two zips), drawn over
# the IFR bases the way the TAC is drawn over the sectional. Not the
# Boston and Wilmington "insets" that ride in two of the low-altitude
# zips: those rasters are georeferenced as strips of their parent
# sheets, seven and ten degrees across, not as the excerpts they show.
IFR_AREA = ChartKind(
    "ifr_area",
    "IFR area",
    FAA_ENROUTE_ZIP_URL,
    (".tif",),
    IFR_AREA_MIN_ZOOM,
    IFR_AREA_MAX_ZOOM,
    (0.2, 0.2, 0.2, 0.2),
    base=False,
    over=("ifr_low", "ifr_high"),
    straight_border=True,
)
KINDS = {kind.key: kind for kind in (SECTIONAL, TAC, IFR_LOW, IFR_HIGH, IFR_AREA)}

# Sheets that come from another kind's zip, or a folder of their own:
# the two Caribbean VFR charts are sectional-scale sheets published
# under their own folder; the Honolulu inset is a terminal-area-scale
# sheet inside the Hawaiian Islands sectional zip.
_ZIP_URL_OVERRIDES = {
    ("sec", "Caribbean_1_VFR"): FAA_VISUAL_ZIP_URL.replace("{folder}", "Caribbean"),
    ("sec", "Caribbean_2_VFR"): FAA_VISUAL_ZIP_URL.replace("{folder}", "Caribbean"),
    ("tac", "Honolulu_Inset"): FAA_VISUAL_ZIP_URL.replace("{folder}", "sectional-files").replace("{name}", "Hawaiian_Islands"),
}
_MEMBER_OVERRIDES = {("tac", "Honolulu_Inset"): ("Honolulu Inset SEC.tif",)}


def zip_url(kind: ChartKind, name: str, cycle: str) -> str:
    return _ZIP_URL_OVERRIDES.get((kind.key, name), kind.zip_url).format(cycle=cycle, name=name)


def is_chart_member(kind: ChartKind, name: str, member: str) -> bool:
    """Whether a zip member is a sheet of chart `name`. Insets are not
    part of the sheet they ride with -- larger-scale excerpts that
    would paint over it -- and are listed as sheets of their own
    (_MEMBER_OVERRIDES) under the overlay kinds instead."""
    wanted = _MEMBER_OVERRIDES.get((kind.key, name))
    if wanted is not None:
        return member in wanted
    upper = member.upper()
    if " INSET " in upper or "_INSET" in upper:
        return False
    return any(member.endswith(suffix) for suffix in kind.raster_suffixes)


def sheet_label(kind: ChartKind, name: str) -> str:
    """What to call a sheet on screen: "Chicago TAC", "Dallas-Ft Worth
    TAC"; the IFR area charts, several sheets to a zip, go by the
    kind's own name."""
    if kind is TAC:
        return f"{name.replace('_', ' ')} TAC"
    return "IFR area chart" if kind is IFR_AREA else kind.label
