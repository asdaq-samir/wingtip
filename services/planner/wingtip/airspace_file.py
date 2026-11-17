"""The FAA's Class Airspace shapefile (NASR's 28-day Class_Airspace
set): fetched whole and checked whole, and its Class B, C and D volumes
read once a process -- from memory, else from the WKB kept beside the
file, else parsed from it -- for wingtip.airspace, which names these too
so its callers ask it as before."""

import pickle
import struct
import threading
from pathlib import Path

import shapefile
from cachetools import LRUCache
from shapely import from_wkb, to_wkb
from shapely.geometry import shape as shapely_shape

from .atomic import atomic_path
from .faa_data import _is_icloud_evicted, nasr_zip_url, download_and_extract

CONTROLLED_CLASSES = ("B", "C", "D")

# A shapefile is three files, not one, and all three are needed: .shp
# holds the geometry, .shx indexes it, .dbf holds the attributes (CLASS,
# NAME, the altitude fields). Missing any one of them fails at read time.
SHAPEFILE_SUFFIXES = (".shp", ".shx", ".dbf")


def _shapefile_is_complete(shp_path: Path) -> bool:
    """Whether a cached shapefile is whole, not just present.

    Two failure modes, both hit for real on 2026-09-10.

    Truncation: a shapefile header stores the file's own total length (in
    16-bit words, big-endian, at byte 24), so a short download is
    detectable without parsing a single shape. Worth checking because the
    symptom is otherwise baffling -- a partial file opens, reads its first
    177 shapes, then raises KeyError on a garbage shape type from the
    middle of the file. The cached copy was 388,769,780 bytes against a
    true 394,056,164, and since the old code asked only whether the path
    existed, no amount of re-running would ever have replaced it.

    Missing companions: iCloud evicted Class_Airspace.dbf minutes after a
    clean download, which fails much later with pyshp's "DbfReader
    requires a .dbf file" rather than anything about the cache.
    """
    try:
        for suffix in SHAPEFILE_SUFFIXES:
            if not shp_path.with_suffix(suffix).exists():
                return False
        with shp_path.open("rb") as f:
            header = f.read(100)
        if len(header) < 100 or struct.unpack(">i", header[0:4])[0] != 9994:
            return False
        declared = struct.unpack(">i", header[24:28])[0] * 2
        return declared == shp_path.stat().st_size
    except OSError:
        return False


def ensure_class_airspace_shapefile(cache_dir) -> Path:
    """Download+extract the current-cycle Class Airspace shapefile into
    cache_dir if not already cached (same 28-day-cycle, cache-once
    convention as wingtip.faa_data.ensure_nasr_data).

    A cached file that is present but incomplete is re-downloaded rather
    than trusted -- see _shapefile_is_complete.
    """
    cache_dir = Path(cache_dir)
    shp_path = cache_dir / "Shape_Files" / "Class_Airspace.shp"
    if not shp_path.exists() or not _shapefile_is_complete(shp_path):
        download_and_extract(nasr_zip_url("Class_Airspace"), cache_dir)
        if not _shapefile_is_complete(shp_path):
            evicted = [shp_path.with_suffix(x).name for x in SHAPEFILE_SUFFIXES if _is_icloud_evicted(shp_path.with_suffix(x))]
            if evicted:
                raise RuntimeError(
                    f"iCloud evicted {', '.join(evicted)} from {shp_path.parent} right after "
                    "downloading it. Re-downloading will not help while this directory syncs "
                    "to iCloud -- exclude data/raw from syncing (renaming a parent directory "
                    "to end in '.nosync', or keeping the project outside Desktop/Documents)."
                )
            raise RuntimeError(
                f"Class Airspace shapefile at {shp_path} is still incomplete after "
                "re-downloading -- the download is being truncated rather than cached wrong."
            )
    return shp_path


def _ceiling_ft_msl(record: dict) -> float | None:
    """UPPER_VAL -> the top in feet MSL, which every Class B, C and D's
    is; None where it is not a number."""
    try:
        return float(record.get("UPPER_VAL")) if record.get("UPPER_CODE") in ("MSL", None) else None
    except (TypeError, ValueError):
        return None


def _floor_ft_msl(record: dict) -> float:
    """LOWER_VAL/LOWER_CODE -> floor altitude in feet MSL. SFC (surface)
    floors are 0 MSL; anything not plain feet MSL (rare for B/C/D, mostly
    an E-airspace concern) is treated as 0 -- conservative, since a
    lower/unknown floor only makes a shelf a *more* restrictive ceiling
    for us, never a less restrictive one.
    """
    code = record["LOWER_CODE"]
    if code == "SFC":
        return 0.0
    if code == "MSL":
        try:
            return float(record["LOWER_VAL"])
        except (TypeError, ValueError):
            return 0.0
    return 0.0


# The Class B/C/D polygons, parsed once per process and held in memory:
# every altitude selection needs them, and walking Class_Airspace.shp --
# 5,612 PolygonZ records, 394 MB, twelve million vertices -- takes about
# thirty seconds. Held bbox-independent, so every route shares one parse,
# and one edition at a time: a new cycle's replaces the last in memory
# rather than sitting beside it.
_ALL_AIRSPACE_CACHE: LRUCache = LRUCache(maxsize=1)
_ALL_AIRSPACE_LOCK = threading.Lock()

# The same polygons written beside the shapefile as WKB, so a fresh
# process (every planner restart, every agent run) reads them back in
# about a second instead of re-walking the shapefile. Keyed by the
# shapefile's size and mtime, so a new 28-day cycle rebuilds it.
# v2: the cached records gained an "ident" field, and a cache written
# before that has no way to say so -- a new suffix rebuilds rather
# than reading records that are missing a key every caller now reads.
# v4: and an "upper_desc", for the map's labels (the phone pack, the overlay tiles).
# v5: and the "hours_code" and "hours_remark", for the map's cards.
_CONTROLLED_CACHE_SUFFIX = ".controlled.v5.pkl"


def _load_all_controlled_airspace(shp_path) -> list:
    """Every Class B/C/D polygon in the national shapefile, with its
    Shapely geometry built: from memory, else from the WKB cache beside
    the file, else parsed from the shapefile and cached both ways.

    One loader at a time -- a request arriving while the startup
    warm-up is parsing waits for its result rather than parsing again.
    """
    shp_path = Path(shp_path)
    stat = shp_path.stat()
    key = (str(shp_path), stat.st_size, stat.st_mtime)
    with _ALL_AIRSPACE_LOCK:
        if key not in _ALL_AIRSPACE_CACHE:
            polygons = _read_controlled_cache(shp_path, key)
            if polygons is None:
                polygons = _parse_controlled_airspace(shp_path)
                _write_controlled_cache(shp_path, key, polygons)
            _ALL_AIRSPACE_CACHE[key] = polygons
        return _ALL_AIRSPACE_CACHE[key]


def _text(value) -> str | None:
    """A text field of the shapefile, or None where it is empty or the
    file's "<Null>"."""
    value = (value or "").strip()
    return None if value in ("", "<Null>") else value


def _parse_controlled_airspace(shp_path: Path) -> list:
    sf = shapefile.Reader(str(shp_path))
    polygons = []
    for sr in sf.iterShapeRecords():
        record = sr.record.as_dict()
        if record["CLASS"] not in CONTROLLED_CLASSES:
            continue
        polygons.append(
            {
                # The primary airport's own identifier (MSY, ORD): what
                # a Class B is named for, and what its weather is
                # looked up by. See wingtip.classb.
                "ident": (record.get("IDENT") or "").strip().upper(),
                "name": record["NAME"],
                "class": record["CLASS"],
                "floor_ft_msl": _floor_ft_msl(record),
                "ceiling_ft_msl": _ceiling_ft_msl(record),
                # "TI" where the top is in the volume, "TNI" where it is
                # up to but not including it -- a Class D under a Class B
                # shelf, which the sectional prints as "-30" (FAA
                # Aeronautical Chart User's Guide, VFR Terms and Symbols,
                # Class D: "a minus ceiling value indicates surface up to
                # but not including that value").
                "upper_desc": (record.get("UPPER_DESC") or "").strip().upper() or None,
                # When the volume is in effect, as the FAA's NASR Class
                # Airspace shapefile has it: WKHR_CODE "H24" (continuous),
                # "NOTAM" (part-time, its hours set by NOTAM and kept in
                # the Chart Supplement) or "RMK" (said in WKHR_RMK, the
                # remark). The file writes an empty remark as "<Null>".
                "hours_code": _text(record.get("WKHR_CODE")),
                "hours_remark": _text(record.get("WKHR_RMK")),
                "geometry": shapely_shape(sr.shape.__geo_interface__),
                "bbox": tuple(sr.shape.bbox),  # (min_lon, min_lat, max_lon, max_lat)
            }
        )
    return polygons


def _controlled_cache_path(shp_path: Path) -> Path:
    return shp_path.with_suffix(_CONTROLLED_CACHE_SUFFIX)


def _read_controlled_cache(shp_path: Path, key: tuple) -> list | None:
    path = _controlled_cache_path(shp_path)
    if not path.exists():
        return None
    try:
        with path.open("rb") as f:
            cached = pickle.load(f)
    except Exception:  # noqa: BLE001 -- a damaged cache is rebuilt, never fatal
        return None
    if cached.get("key") != key:
        return None
    return [
        {
            "ident": p.get("ident", ""),
            "name": p["name"],
            "class": p["class"],
            "floor_ft_msl": p["floor_ft_msl"],
            "ceiling_ft_msl": p.get("ceiling_ft_msl"),
            "upper_desc": p.get("upper_desc"),
            "hours_code": p.get("hours_code"),
            "hours_remark": p.get("hours_remark"),
            "bbox": tuple(p["bbox"]),
            "geometry": from_wkb(p["wkb"]),
        }
        for p in cached["polygons"]
    ]


def _write_controlled_cache(shp_path: Path, key: tuple, polygons: list) -> None:
    path = _controlled_cache_path(shp_path)
    payload = {
        "key": key,
        "polygons": [
            {
                "ident": p.get("ident", ""),
                "name": p["name"],
                "class": p["class"],
                "floor_ft_msl": p["floor_ft_msl"],
                "ceiling_ft_msl": p.get("ceiling_ft_msl"),
                "upper_desc": p.get("upper_desc"),
                "hours_code": p.get("hours_code"),
                "hours_remark": p.get("hours_remark"),
                "bbox": p["bbox"],
                "wkb": to_wkb(p["geometry"]),
            }
            for p in polygons
        ],
    }
    try:
        with atomic_path(path) as part, part.open("wb") as f:
            pickle.dump(payload, f, protocol=pickle.HIGHEST_PROTOCOL)
    except OSError:
        # A read-only data directory only loses the speed-up, never the
        # answer: the parse just runs again next process.
        pass
