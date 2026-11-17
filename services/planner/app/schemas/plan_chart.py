"""The chart a plan is drawn on: its sheets, layers and revision, for app.schemas.plan's Course and Plan."""

from pydantic import BaseModel


class ChartSheet(BaseModel):
    """One sheet of an overlay chart kind and where it is: the map
    offers to pin the terminal area chart when the view is over one."""

    name: str
    label: str
    west: float
    south: float
    east: float
    north: float


class ChartLayer(BaseModel):
    """One kind of FAA chart the map can draw and the zooms it has
    tiles for: the sectional and the IFR enroute charts as base layers
    (`base`), the terminal area chart as an overlay."""

    kind: str
    label: str
    min_zoom: int
    max_zoom: int
    base: bool
    # For an overlay, the base kinds it belongs over.
    over: list[str] = []
    # For an overlay, its sheets and their extents.
    sheets: list[ChartSheet] = []
    # The cycle this kind is drawn from (wingtip.charts.serving_cycle_of) and
    # its tiles' revision there: each kind goes over to a new cycle as its
    # own pyramid is finished, so the map's tile URLs carry its own.
    cycle: str | None = None
    revision: int = 0
    # The pixel densities its tiles were drawn at there
    # (wingtip.charts.tile_scales): 1, the 256-pixel tiles, and 2 when
    # the same z/x/y also comes as a 512-pixel tile named {y}@2x.png,
    # which a 2x or 3x screen draws in its place.
    scales: list[int] = [1]


class ChartInfo(BaseModel):
    """Which chart the map draws and where its tiles are: the map with no
    route on it yet asks for this alone (/api/chart), and a Course
    carries it as well."""

    chart_layers: list[ChartLayer]
    # The zooms the sectional layer draws at. Each overlay's own are in
    # chart_layers.
    max_zoom: int
    min_zoom: int
    # The chart edition the tile endpoints are serving. The map puts it
    # in every tile URL, so a browser that cached tiles under the same
    # {z}/{x}/{y} from an earlier edition -- or from the hosted service
    # this app drew before, whose no-coverage checkerboard one phone
    # went on showing for a day -- asks afresh when it changes.
    chart_cycle: str
    # How many times tiles already served for that edition have been
    # rendered again (a sheet cleaned on disk): in the tile URL beside
    # the cycle for the same reason, since a re-render leaves {z}/{x}/{y}
    # and the cycle as they were.
    chart_revision: int = 0
    # Where the map fetches tiles from instead of this planner: a base URL
    # the map appends /<cycle>/<kind>/{z}/{x}/{y}.png to. Always None
    # since a pyramid is kept as one archive a kind (wingtip.tile_archive,
    # #535): the planner serves every tile, on AWS from the published
    # archive and through CloudFront's cache. Kept for the apps that read
    # it, which then ask this planner.
    chart_tiles_base: str | None = None
