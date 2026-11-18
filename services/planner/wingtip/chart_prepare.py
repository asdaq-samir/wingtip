"""Fetching the FAA's chart sheets and preparing them to be drawn: the zip
downloaded once per cycle, its rasters given overviews, their faces
found and their masked lines taken out (wingtip.chart_faces), for one
sheet a tile needs (ensure_chart), a route's (prepare_for_bbox) or the
country's (prepare_all); and the seam check over the faces found
(face_gaps).
"""

from __future__ import annotations

import logging
import shutil
import threading
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import requests
from cachetools import TTLCache

from .config import REQUEST_HEADERS, get_settings
from . import chart_faces, outside
from . import chart_cycle, chart_serving, chart_sheets
from .chart_coverage import COVERAGE, covers
from .chart_kinds import Box, ChartKind, KINDS, SECTIONAL, is_chart_member, zip_url
from .chart_sheets import Chart, Raster

log = logging.getLogger(__name__)

_FAIL_TTL_S = 600


# A sheet whose download failed, held for ten minutes (_FAIL_TTL_S): a map
# full of tiles does not turn one outage into a request storm.
_failed: TTLCache = TTLCache(maxsize=256, ttl=_FAIL_TTL_S)


# How many sheets may be downloaded and prepared at once, across every
# request thread: preparing one (its overviews, its neatline search)
# takes the process to about 3 GB, and a map zoomed out over the country
# asks for a dozen sheets in one breath. The per-sheet locks (chart_sheets.lock_for) stop
# the same sheet being prepared twice; this stops different sheets being
# prepared all at once. Two by default; CI sets one (infra/docker-compose.ci.yml).
_PREPARE_SLOTS = threading.BoundedSemaphore(get_settings().charts_prepare_at_once)


def ensure_chart(kind: ChartKind, name: str, cycle: str | None = None, *, fetch: bool = True) -> Chart | None:
    """The chart, downloaded and prepared if it is not already -- once
    per cycle, whatever the number of tiles asking. None when it cannot
    be had at all (the FAA's server down and no earlier edition on
    disk); a failed download is not retried for ten minutes, so a map
    full of tiles does not turn one outage into a request storm. With
    `fetch` False, only what is on disk: this cycle's edition, else an
    earlier one, else None."""
    if name not in COVERAGE[kind.key]:
        raise ValueError(f"no such {kind.key} chart: {name}")
    cycle = cycle or chart_cycle.current_cycle()
    directory = chart_sheets.chart_dir(cycle, kind, name)
    if not fetch:
        # Without the sheet's locks, and without making its folder:
        # ready.json is written last, and atomically (chart_sheets.write_ready), so
        # a sheet is either ready here or not, never half of it.
        return chart_sheets.load_ready(directory, kind, name, cycle) or chart_sheets.latest_on_disk(kind, name)
    with chart_sheets.lock_for((kind.key, name)), chart_sheets.directory_lock(directory):
        chart = chart_sheets.load_ready(directory, kind, name, cycle)
        if chart is not None:
            return chart
        if (kind.key, name) in _failed:
            return chart_sheets.latest_on_disk(kind, name)
        try:
            with _PREPARE_SLOTS:
                chart = _download_and_prepare(kind, name, cycle)
        except (requests.RequestException, OSError, zipfile.BadZipFile, RuntimeError) as err:
            log.warning("chart %s/%s (%s) unavailable: %s", kind.key, name, cycle, err)
            _failed[(kind.key, name)] = True
            return chart_sheets.latest_on_disk(kind, name)
        _failed.pop((kind.key, name), None)
        return chart


def _download_and_prepare(kind: ChartKind, name: str, cycle: str) -> Chart:
    directory = chart_sheets.chart_dir(cycle, kind, name)
    directory.mkdir(parents=True, exist_ok=True)
    url = zip_url(kind, name, cycle)
    archive = directory / "chart.zip.part"
    started = time.time()
    with outside.get(url, headers=REQUEST_HEADERS, timeout=600, stream=True) as resp:
        if resp.status_code != 200:
            raise RuntimeError(f"HTTP {resp.status_code} for {url}")
        with archive.open("wb") as out:
            for chunk in resp.iter_content(1 << 20):
                out.write(chunk)
    log.info("downloaded %s (%d MB) in %.0f s", url, archive.stat().st_size >> 20, time.time() - started)

    paths = []
    with zipfile.ZipFile(archive) as z:
        for member in z.namelist():
            if not is_chart_member(kind, name, member):
                continue
            target = directory / Path(member).name
            with z.open(member) as src, target.open("wb") as dst:
                shutil.copyfileobj(src, dst)
            paths.append(target)
    archive.unlink()
    if not paths:
        raise RuntimeError(f"no {kind.raster_suffixes} member in {url}")

    rasters = []
    for path in paths:
        started = time.time()
        chart_sheets.build_overviews(path)
        envelope, face, mask = chart_faces.detect_face(path, kind)
        parts = chart_faces.split_antimeridian(face, envelope)
        removed = chart_faces.remove_masked_lines(path, [f for f, _ in parts]) if kind.masked_lines else None
        for part_face, part_envelope in parts:
            rasters.append(Raster(path=path, face=part_face, envelope=part_envelope, mask=mask, masked_lines=removed))
        log.info(
            "prepared %s in %.0f s: face %s within %s",
            path.name,
            time.time() - started,
            tuple(round(v, 3) for v in face),
            tuple(round(v, 3) for v in envelope),
        )
    chart = Chart(kind=kind, name=name, cycle=cycle, rasters=tuple(rasters), prepared_at=datetime.now(tz=timezone.utc).isoformat())
    chart_sheets.write_ready(directory, chart)
    return chart


def prepare_for_bbox(bbox: Box, kinds: tuple = tuple(KINDS)) -> list:
    """Download and prepare every chart of the given kinds whose raster
    touches `bbox` -- the corridor read and the warm-up call this so a
    route's charts are ready before its tiles are asked for."""
    charts = []
    for key in kinds:
        kind = KINDS[key]
        for name, envelope in COVERAGE[key].items():
            if covers(envelope, bbox):
                chart = ensure_chart(kind, name)
                if chart is not None:
                    charts.append(chart)
    return charts


def prepare_all(kinds: tuple = tuple(KINDS), cycle: str | None = None, redetect: bool = False) -> list[Chart]:
    """Every chart of the given kinds, downloaded and prepared: about
    7 GB for the country, twenty-odd seconds of overviews and neatline
    search per sheet on top of the download. `redetect` runs the face
    detection again on sheets already on disk (after a change to it)
    and rewrites what they say about themselves."""
    cycle = cycle or chart_cycle.current_cycle()
    charts = []
    for key in kinds:
        kind = KINDS[key]
        names = list(COVERAGE[key])
        for i, name in enumerate(names, 1):
            started = time.time()
            chart = ensure_chart(kind, name, cycle)
            if chart is None:
                log.warning("%s/%s: could not be prepared", key, name)
                continue
            if redetect:
                chart = _redetect(chart)
            charts.append(chart)
            log.info("%s/%s ready (%d of %d, %.0f s)", key, name, i, len(names), time.time() - started)
    return charts


def _redetect(chart: Chart) -> Chart:
    directory = chart.rasters[0].path.parent
    removed = {r.path: r.masked_lines for r in chart.rasters}
    with chart_sheets.lock_for((chart.kind.key, chart.name)), chart_sheets.directory_lock(directory):
        rasters = []
        for path in sorted({r.path for r in chart.rasters}):
            envelope, face, mask = chart_faces.detect_face(path, chart.kind)
            for part_face, part_envelope in chart_faces.split_antimeridian(face, envelope):
                rasters.append(Raster(path=path, face=part_face, envelope=part_envelope, mask=mask, masked_lines=removed.get(path)))
        chart = Chart(
            kind=chart.kind,
            name=chart.name,
            cycle=chart.cycle,
            rasters=tuple(rasters),
            prepared_at=datetime.now(tz=timezone.utc).isoformat(),
        )
        chart_sheets.write_ready(directory, chart)
    return chart


def face_gaps(charts: list | None = None) -> list[tuple]:
    """Adjacent sectional faces that fail to meet: (a, b, gap in
    degrees) for every pair whose faces leave daylight between them
    along a shared edge that no third sheet fills. The seam check
    the charts job's `check` prints (services/jobs/charts); an empty list is what a
    healthy cycle looks like (the sheets overlap by a tenth of a
    degree to a degree), except that the FAA charts no sheet over the
    open Gulf between the Caribbean 1 chart and Jacksonville, and that
    is reported as what it is."""
    charts = charts if charts is not None else chart_sheets.prepared_charts(chart_serving.serving_cycle())
    faces = {r.path.stem: r.face for c in charts if c.kind is SECTIONAL for r in c.rasters}

    def overlap(a0, a1, b0, b1):
        return min(a1, b1) - max(a0, b0)

    def unfilled(strip: Box, a: str, b: str) -> bool:
        """Whether some point of the strip between two faces lies in
        no other face."""
        west, south, east, north = strip
        lons = west + (np.arange(24) + 0.5) / 24 * (east - west)
        lats = south + (np.arange(4) + 0.5) / 4 * (north - south)
        covered = np.zeros((4, 24), dtype=bool)
        for name, (w, s, e, n) in faces.items():
            if name in (a, b):
                continue
            covered |= ((lats >= s) & (lats <= n))[:, None] & ((lons >= w) & (lons <= e))[None, :]
        return not covered.all()

    gaps = []
    for a, (aw, as_, ae, an) in faces.items():
        for b, (bw, bs, be, bn) in faces.items():
            if a == b:
                continue
            if overlap(as_, an, bs, bn) > 0.5 and abs(ae - bw) < 1.5 and bw > aw and be > ae and bw - ae > 0.005:
                strip = (ae, max(as_, bs), bw, min(an, bn))
                if unfilled(strip, a, b):
                    gaps.append((a, b, round(bw - ae, 3)))
            if overlap(aw, ae, bw, be) > 1.0 and abs(an - bs) < 1.5 and bs > as_ and bn > an and bs - an > 0.005:
                strip = (max(aw, bw), an, min(ae, be), bs)
                if unfilled(strip, a, b):
                    gaps.append((a, b, round(bs - an, 3)))
    return gaps
