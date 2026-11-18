"""The map's FAA overlays as vector tiles, one PMTiles archive a cycle: the
Class B, C, D and E airspace, the special-use areas, the airports, the
navaids and the fixes, for a MapLibre map (the web's, Android's, iOS's) to
draw crisp at every zoom, at once and with no network once it holds the
file. The same for every pilot for the cycle, so it is built once, by
this job, beside the cycle pack the planner writes (wingtip.cycle_pack),
and the planner serves it whole with byte ranges (/api/overlay-tiles,
reading it through wingtip.vector_tiles, which keeps the archive's name,
index and layers). The planner built it at its own start until the jobs
split (#535); now it only serves it.

Where each layer comes from -- every feature is a row or a shape of the
FAA's own data set, its attributes the fields named below:

- `airspace`: the NASR Class Airspace shapefile (class_airspace_shape_files.zip,
  Class_Airspace.shp, Class B to E), as the cycle pack holds it: CLASS,
  LOCAL_TYPE, NAME, IDENT, LOWER_VAL/LOWER_CODE (floor, read as
  wingtip.airspace_at reads it), UPPER_VAL (ceiling, ft MSL; the floor of
  Class A, 18,000 ft MSL per 14 CFR 71.33, for "up to but not including"
  it), UPPER_DESC TNI, WKHR_CODE and WKHR_RMK.
- `airspace_labels`: a point a Class B, C or D volume of that file, where
  the map writes its altitudes on its ring, with the engine's words for
  them (`tab`), their figures and the text's turn (airspace_label_features).
- `special_use`: the FAA's special use airspace feature service (ADDS),
  as the cycle pack holds it: NAME, TYPE_CODE, LOWER_*/UPPER_*, TIMESOFUSE,
  GMTOFFSET/DST_CODE and CONT_AGENT, read as wingtip.sua reads them.
- `special_use_labels`: a point on each area's edge, its tab (sua_labels).
- `airports`: NASR's APT_BASE.csv (ARPT_ID, ICAO_ID, ARPT_NAME,
  SITE_TYPE_CODE, FACILITY_USE_CODE, OWNERSHIP_TYPE_CODE, TWR_TYPE_CODE,
  ELEV, FUEL_TYPES, LAT_DECIMAL/LONG_DECIMAL; ARPT_STATUS O only), with
  each field's runways from APT_RWY.csv (RWY_ID, RWY_LEN,
  SURFACE_TYPE_CODE) and APT_RWY_END.csv (TRUE_ALIGNMENT), by SITE_NO.
- `navaids`: NASR's NAV_BASE.csv, read as wingtip.fixes reads it (in
  service, the kinds a route flies to), with each one's own remarks from
  NAV_RMK.csv (REMARK, as wingtip.fixes.navaid_remarks reads them), one
  a line.
- `fixes`: NASR's FIX_BASE.csv, read as wingtip.fixes reads it, every row.
- `runways`: each runway with both its ends surveyed, from APT_RWY.csv
  (SITE_NO, RWY_ID, RWY_WIDTH in ft, SURFACE_TYPE_CODE) and
  APT_RWY_END.csv (RWY_END_ID, LAT_DECIMAL/LONG_DECIMAL, the end's own
  position): its surface as a polygon, its centreline, and a point at
  each end with the end's number (09L) and true heading, for the close
  zooms where the chart's own airport symbol is too coarse to land by.

The tiles are made by tippecanoe (felt/tippecanoe, built into the
charts job's image at a pinned tag) into PMTiles, the single-file archive a
browser reads by HTTP range requests (protomaps' pmtiles, spec v3). How
true the lines stay to the FAA's is TOLERANCE_M's comment.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from wingtip import cycle_pack, geo, vector_tiles
from wingtip.atomic import atomic_path
from wingtip.vector_tiles import INDEX, LAYERS, VERSION, archive_name

from .nasr_layers import fix_features, navaid_features, runway_features
from .overlay_layers import airspace_features, airspace_label_features, special_use_features

log = logging.getLogger(__name__)

#: The tippecanoe to run: the charts job's image has it on its PATH.
TIPPECANOE = os.environ.get("TIPPECANOE", "tippecanoe")

#: The zooms there are tiles of (XYZ zooms, 256-pixel tiles: MapLibre,
#: whose tiles are 512, draws tile z at its own zoom z). From 4, a
#: country on a phone, to 12, where a tile is 9.8 km at the equator;
#: closer in, the map draws zoom 12's tiles larger (overzoom).
MIN_ZOOM = 4
MAX_ZOOM = 12
#: Tile units across a tile (tippecanoe's --detail, its default).
DETAIL = 12

#: How far a drawn line may be from the FAA's, in metres on the ground at
#: the deepest zoom. tippecanoe keeps every simplified line within one
#: tile unit of the line it is given (Douglas-Peucker, --simplification=1,
#: its default) and then puts each point on the tile's grid, at most half
#: a unit each way, 0.71 of a unit off: 1.71 units of a 4096-unit tile.
#: At zoom 12 a tile is 40,075,017 m / 2^12 = 9,784 m across at the
#: equator (WGS 84's equator, web mercator), so a unit is 2.39 m and the
#: worst 4.1 m. Measured on Chicago's Class B at 42 N (every point of its
#: six shelves in every zoom-12 tile, both ways round): 3.6 m at worst,
#: a little over the 1.71 units there (3.0 m), as tippecanoe also nudges
#: the shared borders it detects -- so the bound kept and tested is the
#: equator's 4.1 m. At any zoom below 12 the worst is the same two units
#: or so of that zoom's tile, which MapLibre draws 512 px across: about a
#: quarter of a pixel, at every zoom there are tiles of. Overzoomed past
#: 12 it stays 4.1 m, under 2 px at MapLibre's zoom 15. The phones' packs keep their rings
#: within 0.0001 degree, 11 m (wingtip.cycle_pack.PHONE_TOLERANCE_DEG); a
#: sectional's printed airspace line is itself some 100 m wide at
#: 1:500,000. services/jobs/charts/tests/test_overlays.py measures it on Chicago's Class B.
TOLERANCE_M = round((1 + 0.5 * 2**0.5) * geo.WEB_MERCATOR_CIRCUMFERENCE_M / 2**MAX_ZOOM / 2**DETAIL, 1)

ATTRIBUTION = "FAA NASR and special use airspace (ADDS), cycle {cycle}"


def write_layers(
    folder: Path,
    pack,
    *,
    apt_path: Path,
    rwy_path: Path | None,
    rwy_end_path: Path | None,
    nav_path: Path,
    fix_path: Path,
    bbox=None,
    nav_rmk_path: Path | None = None,
    shp_path: Path | None = None,
) -> dict[str, int]:
    """Each layer's GeoJSON, a feature a line, into folder/<layer>.geojsonl;
    how many features each holds."""
    from .airports import airport_features, primaries
    from .sua_labels import special_use_label_features

    sources = {
        "airspace": airspace_features(pack, bbox),
        "airspace_labels": airspace_label_features(pack, bbox),
        "special_use": special_use_features(pack, bbox),
        "special_use_labels": special_use_label_features(pack, bbox),
        "airports": airport_features(apt_path, rwy_path, rwy_end_path, bbox, primaries(pack), shp_path),
        "navaids": navaid_features(nav_path, bbox, nav_rmk_path),
        "fixes": fix_features(fix_path, bbox),
        "runways": runway_features(rwy_path, rwy_end_path, bbox) if rwy_path and rwy_end_path else iter(()),
    }
    counts = {}
    for layer, lines in sources.items():
        n = 0
        with open(folder / f"{layer}.geojsonl", "w") as out:
            for line in lines:
                out.write(line)
                n += 1
        counts[layer] = n
    return counts


def tippecanoe_args(folder: Path, out: Path, cycle: str, tippecanoe: str = TIPPECANOE) -> list[str]:
    """tippecanoe's command for the layers in folder. Nothing is dropped
    to keep a tile small, a polygon too small to see included; adjacent
    volumes' shared borders (a Class B's shelves) simplified alike, so no
    sliver opens between them; each feature an id, for the map's state
    (hover, the one tapped)."""
    args = [
        tippecanoe,
        "-o",
        str(out),
        "--force",
        "--quiet",
        "-Z",
        str(MIN_ZOOM),
        "-z",
        str(MAX_ZOOM),
        "--full-detail",
        str(DETAIL),
        "--low-detail",
        str(DETAIL),
        "--simplification",
        "1",
        "--no-feature-limit",
        "--no-tile-size-limit",
        "--no-tiny-polygon-reduction",
        "--drop-rate",
        "1",
        "--detect-shared-borders",
        "--generate-ids",
        "--read-parallel",
        "--temporary-directory",
        str(folder),
        *("--name", f"Wingtip FAA overlays {cycle}", "--attribution", ATTRIBUTION.format(cycle=cycle)),
        *("--description", f"Airspace, special use, airports, navaids, fixes and runways, FAA cycle {cycle}"),
    ]
    for layer in LAYERS:
        args += ["-L", f"{layer}:{folder / f'{layer}.geojsonl'}"]
    return args


def build(pack, cache_dir, out_dir=None, *, bbox=None, tippecanoe: str = TIPPECANOE) -> dict:
    """The archive of the pack's shapes and the NASR files in cache_dir,
    written whole into out_dir with its index (what /api/overlay-tiles
    gives), and any older archive removed. With bbox, (west, south, east,
    north), only the features that meet it: a sample."""
    from wingtip import airspace, faa_data

    cache_dir, out_dir = Path(cache_dir), Path(out_dir or vector_tiles.TILES_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    name = archive_name(pack)
    path = out_dir / f"{name}.pmtiles"
    started = time.monotonic()

    def nasr(file: str) -> Path:
        return faa_data.ensure_nasr_file(file, cache_dir)

    # The layers and tippecanoe's own temporary files are worked on the
    # container's disk (the system's temporary folder, TMPDIR), never in
    # out_dir: on the owner's Mac out_dir is the data folder bind-mounted
    # from macOS, and tippecanoe opens each temporary file twice, unlinks
    # it, and asks its size back through the other descriptor (fstat),
    # which Docker Desktop's file share can answer with "No such file or
    # directory" once the file is gone on the Mac's side: "tippecanoe
    # failed (117): stat geom" on a whole-country build, 2026-11-08, with a
    # second build and a stack restart under way (two builds side by side
    # there passed after, so it comes and goes). Only the finished archive
    # is copied over, beside its final name, and renamed into place.
    with tempfile.TemporaryDirectory(prefix="wingtip-overlays-") as tmp:
        folder = Path(tmp)
        counts = write_layers(
            folder,
            pack,
            apt_path=nasr("APT_BASE.csv"),
            rwy_path=nasr("APT_RWY.csv"),
            rwy_end_path=nasr("APT_RWY_END.csv"),
            nav_path=nasr("NAV_BASE.csv"),
            nav_rmk_path=nasr("NAV_RMK.csv"),
            fix_path=nasr("FIX_BASE.csv"),
            bbox=bbox,
            shp_path=airspace.ensure_class_airspace_shapefile(cache_dir),
        )
        built = folder / "out.pmtiles"
        run = subprocess.run(tippecanoe_args(folder, built, pack.cycle, tippecanoe), capture_output=True, text=True)
        if run.returncode != 0:
            raise RuntimeError(f"tippecanoe failed ({run.returncode}): {run.stderr[-2000:]}")
        with atomic_path(path) as part:
            shutil.copyfile(built, part)
    index = {
        "cycle": pack.cycle,
        "name": name,
        "version": VERSION,
        "bytes": path.stat().st_size,
        "built_at": time.time(),
        "min_zoom": MIN_ZOOM,
        "max_zoom": MAX_ZOOM,
        "tolerance_m": TOLERANCE_M,
        "layers": [{"name": layer, "features": counts[layer]} for layer in LAYERS],
    }
    with atomic_path(out_dir / INDEX) as part:
        part.write_text(json.dumps(index, separators=(",", ":")))
    for old in out_dir.glob("*.pmtiles"):
        if old != path:
            old.unlink(missing_ok=True)
    log.info(
        "Overlay tiles %s built in %.1f s, %.1f MB: %s",
        name,
        time.monotonic() - started,
        index["bytes"] / 1e6,
        ", ".join(f"{k} {v}" for k, v in counts.items()),
    )
    return index


def due(pack_dir=None, out_dir=None) -> bool:
    """Whether there is a cycle pack whose archive is not on disk: the
    planner writes the pack (wingtip.cycle_pack) and asks this job for its
    tiles (app.chart_refresh)."""
    pack = cycle_pack.current(pack_dir)
    if pack is None:
        return False
    held = vector_tiles.tiles_index(out_dir)
    return held is None or held.get("name") != archive_name(pack)


def ensure(cache_dir, pack_dir=None, out_dir=None) -> dict | None:
    """The archive built where the one on disk is not of the cycle pack
    the planner holds now (archive_name); None where it already is, or
    there is no pack yet -- the planner writes it on its first start of a
    cycle, and the next run of this job builds its tiles. Without a
    tippecanoe it fails, as this job has nothing else to do."""
    if not due(pack_dir, out_dir):
        return None
    if shutil.which(TIPPECANOE) is None:
        raise RuntimeError(f"No {TIPPECANOE} on the PATH: the overlay tiles are built in the charts job's image")
    return build(cycle_pack.current(pack_dir), cache_dir, out_dir)
