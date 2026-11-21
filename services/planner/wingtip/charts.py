"""FAA VFR and IFR charts, drawn from the FAA's own GeoTIFFs: the map of
the chart modules, and the two names app.detection asks by this one.

The map used to draw the sectional from a hosted ArcGIS map service:
first the FAA's own tile cache, then Texas A&M's public mirror once the
FAA put theirs behind a login. Each was a dependency on someone else's
server for the one layer a pilot actually looks at, and each rendered
the chart its own way -- reprojected, resampled, and (for the mirror)
with a no-data checkerboard wherever its mosaic ran out, which it did
just west of Duluth. The FAA publishes every sectional, terminal area
chart and IFR enroute chart as a georeferenced TIFF, free, on the same
56-day cycle as the paper chart. The planner downloads the ones a route
needs, once per cycle, and renders {z}/{x}/{y} tiles from them: the
chart exactly as printed, served by this app.

Two things make that more than a file download:

- The rasters include the printed sheet's collar -- the legend column,
  the communication boxes, the title -- georeferenced along with the
  chart face. Drawn as-is, the legend of one chart would paper over its
  neighbour along every seam. `chart_faces.detect_face` finds the
  neatline (the black border the chart face ends at) in each raster, and
  the renderer clips to it so adjacent charts butt together. A TAC's
  paper panels printed over its own face (Puerto Rico's route panels
  over the Atlantic) are cut out with a mask (chart_panels).

- Charts overlap (the sheets of the 36-40N row share a degree or so
  with their neighbours; a TAC sits inside its sectional), so a tile is
  composited from every chart whose face covers it.

The modules, lowest first, each with one job:

- chart_kinds: the kinds of chart and the FAA's zips;
  chart_coverage: where each sheet is.
- chart_cycle: the FAA's cycle, the cycles on disk, and when one is in
  force.
- chart_grid, chart_warp, chart_render: the renderer -- the tile grid,
  a sheet warped to web mercator, and a tile composited from the sheets
  under it, with the helpers every way of drawing a tile shares (the
  composite, the PNG, the cache path, the draw order).
- chart_sheets: a prepared sheet on disk; chart_prepare: fetching and
  preparing one (the face and masked lines are chart_faces', a TAC's
  paper panels chart_panels').
- chart_serving: each cycle's pyramid record, the cycle the map is drawn
  from, and the tile revision.
- chart_archives: a finished pyramid packed into its archives;
  chart_tiles: a tile as the map asks for it.
- chart_workers and chart_pyramid: the whole country drawn ahead of
  time; chart_rerender: tiles drawn again after a sheet changed.
- chart_publish: the archives to S3; chart_upkeep: keeping up with the
  cycle, its lock and the Dev console's status.

These were one module of 2,336 lines until 2026-11-18. A split was
measured and turned down on 2026-09-24, at 1,794 lines: the pyramid half
needed fourteen of the renderer's private helpers, the refresh machinery
alone held none of the recent commits whole, and the catalogue took six
of 115 hunks. The owner's instruction of 2026-11-18 ("Audit the whole
project for simplicity and performance. No matter how big the change
is, fix it.") and 540 more lines asked again, and the cut answers each
objection: the renderer's helpers are a module of their own
(chart_grid, chart_warp, chart_render) that the tile on request, the
pyramid and the re-render share, rather than private names one half
needed of the other; and the modules follow what changed together since
-- the archive packing (2026-11-08 and 11-16), the tile grid and warp
(11-12), the next cycle's swap (11-09) and preparing a sheet each sit
in one, the catalogue in two small ones nothing else touches.

app.detection may not be edited (a kept read is hashed against it), and
it asks the served cycle and its tile revision through this module: they
are passed on to wingtip.chart_serving at each call, so a test that
replaces either there is seen here too. Every other caller asks the
chart module itself.
"""

from __future__ import annotations

from . import chart_serving


def serving_cycle() -> str:
    """wingtip.chart_serving.serving_cycle, for app.detection."""
    return chart_serving.serving_cycle()


def tiles_revision(cycle: str) -> int:
    """wingtip.chart_serving.tiles_revision, for app.detection."""
    return chart_serving.tiles_revision(cycle)
