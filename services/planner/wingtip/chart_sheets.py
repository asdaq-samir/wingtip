"""The chart sheets on disk: a prepared chart and its rasters (Chart,
Raster), the ready.json that says a sheet is whole, the locks that keep
two runs from preparing one sheet at once, and the overviews inside
each TIFF.

Fetching and preparing a sheet is wingtip.chart_prepare; this is what it
leaves, and what every reader of a sheet needs.
"""

from __future__ import annotations

import contextlib
import json
import threading
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from .atomic import atomic_path
from . import config
from .chart_kinds import Box, ChartKind, KINDS


@dataclass(frozen=True)
class Raster:
    path: Path
    face: Box  # what the renderer draws: the chart, neatline inward
    envelope: Box  # the whole raster, collar included
    # A small companion raster, 255 where the sheet is chart and 0
    # where it is collar, for a sheet whose chart area is a rectangle
    # of pixels rather than of latitude and longitude (the IFR enroute
    # charts): the face box then covers the whole leaning rectangle and
    # this cuts the collar out of its corners. None for a VFR sheet.
    mask: Path | None = None
    # The areas whose masked lines were taken out of this raster, () when
    # it had none, and None when it has not been looked at -- a sheet
    # prepared before chart_faces.remove_masked_lines existed, which the `unmask`
    # command then finds.
    masked_lines: tuple | None = None


@dataclass(frozen=True)
class Chart:
    kind: ChartKind
    name: str
    cycle: str
    rasters: tuple[Raster, ...]
    prepared_at: str


READY = "ready.json"


_locks: dict = {}
_locks_guard = threading.Lock()


def chart_dir(cycle: str, kind: ChartKind, name: str) -> Path:
    return config.CHARTS_DIR / cycle / kind.key / name


def lock_for(key: tuple) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(key, threading.Lock())


def load_ready(directory: Path, kind: ChartKind, name: str, cycle: str) -> Chart | None:
    try:
        data = json.loads((directory / READY).read_text())
    except (OSError, ValueError):
        return None
    rasters = tuple(
        Raster(
            path=directory / r["file"],
            face=tuple(r["face"]),
            envelope=tuple(r["envelope"]),
            mask=directory / r["mask"] if r.get("mask") else None,
            masked_lines=None if r.get("masked_lines") is None else tuple(tuple(b) for b in r["masked_lines"]),
        )
        for r in data.get("rasters", [])
    )
    if not rasters or not all(r.path.exists() for r in rasters):
        return None
    return Chart(kind=kind, name=name, cycle=cycle, rasters=rasters, prepared_at=data.get("prepared_at", ""))


def write_ready(directory: Path, chart: Chart) -> None:
    data = {
        "name": chart.name,
        "kind": chart.kind.key,
        "cycle": chart.cycle,
        "prepared_at": chart.prepared_at,
        "rasters": [
            {
                "file": r.path.name,
                "face": list(r.face),
                "envelope": list(r.envelope),
                "mask": r.mask.name if r.mask else None,
                "masked_lines": None if r.masked_lines is None else [list(b) for b in r.masked_lines],
            }
            for r in chart.rasters
        ],
    }
    with atomic_path(directory / READY) as tmp:
        tmp.write_text(json.dumps(data, indent=1))


def latest_on_disk(kind: ChartKind, name: str) -> Chart | None:
    """The newest prepared edition of a chart, from any cycle -- what
    is served while a newer edition cannot be downloaded."""
    if not config.CHARTS_DIR.exists():
        return None
    cycles = []
    for directory in config.CHARTS_DIR.iterdir():
        try:
            cycles.append((datetime.strptime(directory.name, "%m-%d-%Y"), directory.name))
        except ValueError:
            continue
    for _, cycle in sorted(cycles, reverse=True):
        chart = load_ready(chart_dir(cycle, kind, name), kind, name, cycle)
        if chart is not None:
            return chart
    return None


@contextlib.contextmanager
def directory_lock(directory: Path):
    """An exclusive lock on a chart's folder, held across processes:
    the serving planner's warm-up and a `prepare` run in another
    container can want the same sheet at the same moment, and two
    extractions plus two overview builds on one TIFF is a corrupt
    TIFF. The second one waits, then finds the sheet ready."""
    import fcntl

    directory.mkdir(parents=True, exist_ok=True)
    with (directory / ".lock").open("w") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


_OVERVIEW_LEVELS = [2, 4, 8, 16, 32, 64]


def build_overviews(path: Path) -> None:
    """Reduced-resolution copies inside the TIFF, so a zoom-8 tile
    (a tenth of the chart's resolution) reads a tenth of the pixels,
    and a zoom-5 one a hundredth. Nearest-neighbour because the band
    is a palette: averaging colour indices would mean nothing."""
    import rasterio
    from rasterio.enums import Resampling

    with rasterio.open(path, "r+") as ds:
        if len(ds.overviews(1)) < len(_OVERVIEW_LEVELS):
            ds.build_overviews(_OVERVIEW_LEVELS, Resampling.nearest)
            ds.update_tags(ns="rio_overview", resampling="nearest")


def prepared_charts(cycle: str | None = None) -> list[Chart]:
    """Every chart prepared on disk -- one cycle's, or any cycle's
    newest first."""
    charts = []
    if not config.CHARTS_DIR.exists():
        return charts
    for ready in sorted(config.CHARTS_DIR.glob(f"*/*/*/{READY}"), reverse=True):
        directory = ready.parent
        kind = KINDS.get(directory.parent.name)
        if kind is None or (cycle and directory.parent.parent.name != cycle):
            continue
        chart = load_ready(directory, kind, directory.name, directory.parent.parent.name)
        if chart is not None:
            charts.append(chart)
    return charts
