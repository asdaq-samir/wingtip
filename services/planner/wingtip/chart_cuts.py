"""What each chart cycle cut out of its sheets, kept so that a new cycle
which cuts more is looked at by a person before the map serves it.

A sheet's face (wingtip.chart_faces) and the panels and insets cut out of
it (wingtip.chart_panels, wingtip.chart_insets: the zeros of its
`.mask.tif`) are found by reading pixels, and an edition that prints
something new -- a route diagram over the ocean, a bigger inset -- can
make the detection cut away chart a pilot flies by, or leave a hole in
the map, with nothing but a log line to say so. Each cycle's cuts are
written beside its sheets at prepare time (`cuts.json`, by sheet: the
faces, and each cut's kind, box in degrees and size); `review` sets the
new cycle's against the cycle being served and names each cut that is new
or has grown, and each face edge that moved, past a tolerance (the same
panel moves a little between editions). `accept` records the reviewed set,
after which `review` passes it until it changes again. The charts job's
`check` prints the findings and exits 1; `build_cycle` stops on them
before it renders, so the map never swaps to a cycle nobody looked at.
Owner decision 2026-11-21.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path


from . import chart_cut_preview, chart_cycle, chart_sheets, config
from .atomic import atomic_path
from .chart_faces import _POOL_PX
from .chart_kinds import Box, ChartKind

log = logging.getLogger(__name__)

RECORD = "cuts.json"
ACCEPTED = "cuts.accepted.json"
VERSION = 1

#: How far, in degrees, a cut's edge may differ from the earlier edition's
#: and still be the same cut (0.05 deg is 3 nautical miles of latitude: a
#: panel redrawn a few hundred pixels over, not a new one), and how far a
#: face edge may move before it is a finding. Sectional faces snap to
#: the chart's own graticule (chart_faces._snap), so a real move is
#: larger than any detection jitter.
CUT_TOLERANCE = 0.05
FACE_TOLERANCE = 0.05


class CutsNeedReview(RuntimeError):
    """A new cycle cut something the one being served did not."""


@dataclass(frozen=True)
class Finding:
    sheet: str  # kind/name/raster stem
    what: str  # "new cut", "grown cut" or "face edge moved"
    box: Box  # the cut's box, or the sheet's new face
    detail: str
    preview: Path | None = None

    def line(self) -> str:
        shown = " ".join(f"{v:.3f}" for v in self.box)
        text = f"{self.what}: {self.sheet} ({shown}) {self.detail}"
        return text + (f" -> {self.preview}" if self.preview else "")


def _cut_kind(kind: ChartKind) -> str:
    if kind.paper_panels and kind.framed_insets:
        return "cut"
    return "panel" if kind.paper_panels else "inset"


def _mask_cuts(mask: Path, kind: ChartKind) -> list[dict]:
    """The cuts in a sheet's mask raster: each connected run of zeros, as
    its box in degrees and its size."""
    import rasterio
    from rasterio.warp import transform_bounds
    from scipy import ndimage as ndi

    with rasterio.open(mask) as src:
        data, transform, crs = src.read(1), src.transform, src.crs
    labels, _ = ndi.label(data == 0)
    cuts = []
    for rows, cols in ndi.find_objects(labels):
        x0, y0 = transform @ (cols.start, rows.start)
        x1, y1 = transform @ (cols.stop, rows.stop)
        west, south, east, north = (float(v) for v in transform_bounds(crs, "EPSG:4326", x0, y1, x1, y0, densify_pts=21))
        cuts.append(
            {
                "kind": _cut_kind(kind),
                "box": [round(west, 4), round(south, 4), round(east, 4), round(north, 4)],
                "size_deg": [round(east - west, 4), round(north - south, 4)],
                "size_px": [(cols.stop - cols.start) * _POOL_PX, (rows.stop - rows.start) * _POOL_PX],
            }
        )
    return sorted(cuts, key=lambda c: c["box"])


def record(cycle: str) -> dict:
    """The cycle's cuts, read from its prepared sheets on disk: per raster
    its faces (more than one where a sheet crosses the antimeridian) and
    the cuts of its mask. An IFR chart's mask is its straight border, not
    a cut, so those sheets have a face only."""
    sheets: dict = {}
    for chart in chart_sheets.prepared_charts(cycle):
        done: set = set()
        for raster in chart.rasters:
            entry = sheets.setdefault(f"{chart.kind.key}/{chart.name}/{raster.path.stem}", {"faces": [], "cuts": []})
            entry["faces"].append([round(v, 4) for v in raster.face])
            if raster.mask and not chart.kind.straight_border and raster.mask not in done and raster.mask.exists():
                done.add(raster.mask)
                entry["cuts"] += _mask_cuts(raster.mask, chart.kind)
    return {"version": VERSION, "cycle": cycle, "sheets": dict(sorted(sheets.items()))}


def _path(cycle: str, name: str) -> Path:
    return config.CHARTS_DIR / cycle / name


def write_record(cycle: str) -> dict:
    """The cycle's record, written beside its sheets (prepare's last step)."""
    data = record(cycle)
    _path(cycle, RECORD).parent.mkdir(parents=True, exist_ok=True)
    with atomic_path(_path(cycle, RECORD)) as tmp:
        tmp.write_text(json.dumps(data, indent=1))
    n = sum(len(s["cuts"]) for s in data["sheets"].values())
    log.info("cycle %s: %d cuts on %d sheets recorded", cycle, n, len(data["sheets"]))
    return data


def _load(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return None
    return data if data.get("version") == VERSION else None


def load_record(cycle: str) -> dict:
    """The cycle's written record, else read from its sheets (an edition
    prepared before cuts were recorded)."""
    return _load(_path(cycle, RECORD)) or record(cycle)


def _near(a: list, b: list, tol: float) -> bool:
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def _overlaps(a: list, b: list) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def compare(old: dict, new: dict) -> list[Finding]:
    """What `new` cuts that `old` did not, by sheet: a cut matching none of
    the sheet's old ones within CUT_TOLERANCE is new where it touches none
    of them and grown where it reaches past one that it overlaps; a face
    edge that moved more than FACE_TOLERANCE is a finding of its own. A
    sheet the old record lacks is all new. A cut that shrank or went is
    not a finding: it shows more chart, not less."""
    found: list[Finding] = []
    for sheet, now in new["sheets"].items():
        before = old["sheets"].get(sheet)
        old_cuts = [c["box"] for c in before["cuts"]] if before else []
        for cut in now["cuts"]:
            box = cut["box"]
            if any(_near(box, o, CUT_TOLERANCE) for o in old_cuts):
                continue
            touched = [o for o in old_cuts if _overlaps(box, o)]
            size = f"{cut['size_px'][0]} x {cut['size_px'][1]} px, {cut['size_deg'][0]:.2f} x {cut['size_deg'][1]:.2f} deg"
            if not touched:
                found.append(Finding(sheet, f"new {cut['kind']} cut", tuple(box), size))
            elif any(
                box[0] < o[0] - CUT_TOLERANCE
                or box[1] < o[1] - CUT_TOLERANCE
                or box[2] > o[2] + CUT_TOLERANCE
                or box[3] > o[3] + CUT_TOLERANCE
                for o in touched
            ):
                found.append(Finding(sheet, f"grown {cut['kind']} cut", tuple(box), size))
        if before:
            for old_face, new_face in zip(before["faces"], now["faces"]):
                moved = [e for e, a, b in zip("wsen", old_face, new_face) if abs(a - b) > FACE_TOLERANCE]
                if moved:
                    found.append(
                        Finding(
                            sheet,
                            "face edge moved",
                            tuple(new_face),
                            f"({', '.join(moved)}) from " + " ".join(f"{v:.3f}" for v in old_face),
                        )
                    )
    return found


def baseline_cycle(cycle: str) -> str | None:
    """The cycle to compare `cycle` with: the one being served, else the
    newest older one on disk; None when there is none to compare with."""
    from . import chart_serving

    serving = chart_serving.serving_cycle()
    if serving != cycle and (config.CHARTS_DIR / serving).is_dir():
        return serving
    older = [c for c in chart_cycle.cycles_on_disk(config.CHARTS_DIR) if _date(c) < _date(cycle)]
    return older[0] if older else None


def _date(cycle: str):
    from datetime import datetime

    return datetime.strptime(cycle, "%m-%d-%Y")


def review(cycle: str, baseline: str | None = None, previews: bool = True) -> tuple[str | None, list[Finding]]:
    """(the cycle compared with, the findings) for `cycle`. Once `accept`
    has recorded a reviewed set for the cycle it is compared with that
    instead, so only what changed since is a finding. Previews are
    written for the findings (see wingtip.chart_cut_preview)."""
    new = load_record(cycle)
    accepted = _load(_path(cycle, ACCEPTED))
    if accepted is not None:
        baseline, old = f"{cycle} (accepted)", accepted
    else:
        baseline = baseline or baseline_cycle(cycle)
        if baseline is None:
            return None, []
        old = load_record(baseline)
    findings = compare(old, new)
    if findings and previews:
        findings = _with_previews(cycle, findings)
    return baseline, findings


def accept(cycle: str) -> dict:
    """Record `cycle`'s present cuts as reviewed."""
    data = write_record(cycle)
    with atomic_path(_path(cycle, ACCEPTED)) as tmp:
        tmp.write_text(json.dumps(data, indent=1))
    return data


def gate(cycle: str) -> None:
    """Stop, raising CutsNeedReview, where `cycle` cuts what the served one
    did not and nobody has accepted it: the refresh's and the next cycle's
    check before they render a tile, so the map cannot swap to it."""
    gate_against(cycle, None)


def gate_against(cycle: str, baseline: str | None) -> None:
    """gate, against `baseline` (the served cycle by default)."""
    baseline, findings = review(cycle, baseline)
    if findings:
        lines = "\n".join(f"  {f.line()}" for f in findings)
        raise CutsNeedReview(
            f"cycle {cycle} cuts {len(findings)} thing(s) that {baseline} did not; look at the previews, "
            f"then `charts accept-cuts {cycle}`:\n{lines}"
        )


def _with_previews(cycle: str, findings: list[Finding]) -> list[Finding]:
    out = []
    for f in findings:
        try:
            path = chart_cut_preview.preview(cycle, f.sheet, [x.box for x in findings if x.sheet == f.sheet])
        except Exception:  # noqa: BLE001 -- a preview is a help; the failing check stands without it
            log.warning("no preview for %s", f.sheet, exc_info=True)
            path = None
        out.append(Finding(f.sheet, f.what, f.box, f.detail, path))
    return out
