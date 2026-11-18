"""The chart the map draws, as a figure of fields (app.routers.chart's
/api/chart, and the course and the plan, which carry the same fields
so the map has them with no second request): the zoom range, the
serving cycle and every chart kind with its sheets."""

from wingtip import chart_coverage, chart_kinds, chart_serving
from wingtip.config import VFR_SECTIONAL_MAX_ZOOM, VFR_SECTIONAL_MIN_ZOOM

from .schemas.plan import ChartLayer, ChartSheet


def chart_layers() -> list[ChartLayer]:
    """Every chart kind the map may draw, with its zoom range -- and,
    for an overlay, its sheets and where they are, which is how the
    map knows to offer the Chicago TAC over Chicago."""
    return [
        ChartLayer(
            kind=k.key,
            label=k.label,
            min_zoom=k.min_zoom,
            max_zoom=k.max_zoom,
            base=k.base,
            over=list(k.over),
            cycle=(cycle := chart_serving.serving_cycle_of(k.key)),
            revision=chart_serving.tiles_revision(cycle),
            scales=chart_serving.tile_scales(k.key),
            sheets=[]
            if k.base
            else [
                ChartSheet(name=name, label=chart_kinds.sheet_label(k, name), west=w, south=s, east=e, north=n)
                for name, (w, s, e, n) in chart_coverage.sheets(k)
            ],
        )
        for k in chart_kinds.KINDS.values()
    ]


def chart_summary() -> dict:
    cycle = chart_serving.serving_cycle()
    return {
        "max_zoom": VFR_SECTIONAL_MAX_ZOOM,
        "min_zoom": VFR_SECTIONAL_MIN_ZOOM,
        "chart_cycle": cycle,
        "chart_revision": chart_serving.tiles_revision(cycle),
        "chart_layers": chart_layers(),
    }
