"""The FAA's Digital Obstacle File (DOF): every obstacle the FAA has
surveyed or been told of, its position, height above the ground and above
sea level, and its lighting -- the towers a route's floor and the terrain
view are held above (wingtip.terrain, wingtip.ifr, wingtip.profile).

DOF.DAT is a fixed-width text file, read here by pandas' fixed-width
reader on the columns the FAA's README gives, and checked whole: a
shifted layout stops the read with the line it is on, never an obstacle
dropped or a height read from the wrong columns. It is published every
56 days on the FAA's DOF page, which APRA does not carry (wingtip.apra);
wingtip.faa_data downloads it with the NASR tables.
"""

import json
import re
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
from cachetools import LRUCache

from . import data_cycles, outside
from .atomic import atomic_path

# The FAA's site 403s a bare python-requests User-Agent.
from .config import FAA_HEADERS

DOF_INDEX_URL = "https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dof/"

# DOF.DAT's columns, from the FAA's own layout: "OAS Digital Obstacle
# File (DOF)" README, 21 May 2026, "The DOF format" (the FAA's DOF page,
# media/DOF_README_05-21-2026.pdf). The README counts columns from 1,
# both ends in; these are pandas' (start, end) from 0, end out -- the
# README's 19-34 City Name is (18, 34). Checked against the whole 2 Aug
# 2026 edition, 652,785 records, every one in this layout.
_DOF_COLUMNS = {
    "city": (18, 34),  # 19-34 City Name
    "lat_deg": (35, 37),  # 36-37 Latitude Degrees
    "lat_min": (38, 40),  # 39-40 Latitude Minutes
    "lat_sec": (41, 46),  # 42-46 Latitude Seconds
    "lat_hem": (46, 47),  # 47 Latitude Hemisphere
    "lon_deg": (48, 51),  # 49-51 Longitude Degrees
    "lon_min": (52, 54),  # 53-54 Longitude Minutes
    "lon_sec": (55, 60),  # 56-60 Longitude Seconds
    "lon_hem": (60, 61),  # 61 Longitude Hemisphere
    "type": (62, 80),  # 63-80 Obstacle Type
    "agl": (83, 88),  # 84-88 AGL HT, feet above ground level
    "amsl": (89, 94),  # 90-94 AMSL HT, feet above mean sea level
    "lt": (95, 96),  # 96 Lighting
}
# The README's blank columns between them (35, 38, 41, 48, 52, 55, 62, 81,
# 83, 89 and 95): a layout shifted by a column puts a character in one.
_DOF_GAPS = [(c - 1, c) for c in (35, 38, 41, 48, 52, 55, 62, 81, 83, 89, 95)]
# What each column holds, whole: a figure that does not match is a layout
# that moved, and the read stops rather than take a wrong height.
_DOF_FORMATS = {
    "lat_deg": r"\d{2}",
    "lat_min": r"\d{2}",
    "lat_sec": r"\d{2}\.\d{2}",
    "lat_hem": r"[NS]",
    "lon_deg": r"\d{3}",
    "lon_min": r"\d{2}",
    "lon_sec": r"\d{2}\.\d{2}",
    "lon_hem": r"[EW]",
    "agl": r"\d{5}",
    "amsl": r"-\d{4}|\d{5}",
    "lt": r"[RDHMSFCWLNU]",
    **{f"gap{start}": "" for start, _ in _DOF_GAPS},
}
# The README's lighting codes for an obstacle that is lit: red, the
# strobes, flood, catenary, synchronized red and "lighted (type unknown)";
# not "N" (none) or "U" (unknown).
_DOF_LIT = frozenset("RDHMSFCWL")


_DOF_ZIP = re.compile(r'href="(https://aeronav\.faa\.gov/Obst_Data/DOF_(\d{6})\.zip)"')


def dof_zip_url(html: str, on: date) -> str:
    """The newest DOF zip on the FAA's DOF page that is out by `on`. The
    page lists the previous edition first, then the current one, each
    named by the last day of the changes it holds and released two days
    later (the page's "Release Date"; the engine's `data_cycle` "dof").
    The first link was taken, and the planner read the 2 Aug 2026
    obstacles for six weeks after the 27 Sep edition was out."""
    released = []
    for url, stamp in _DOF_ZIP.findall(html):
        changes_to = datetime.strptime(stamp, "%y%m%d").date()
        if changes_to + timedelta(days=2) <= on:
            released.append((changes_to, url))
    if not released:
        raise RuntimeError(f"No released DOF zip on {DOF_INDEX_URL}")
    return max(released)[1]


def dof_link() -> str:
    """The current DOF zip, off the FAA's DOF page: APRA does not carry
    the obstacle file (wingtip.apra)."""
    resp = outside.get(DOF_INDEX_URL, headers=FAA_HEADERS, timeout=30)
    resp.raise_for_status()
    return dof_zip_url(resp.text, data_cycles.in_force_day())


def _dof_records(dof_dat_path: Path) -> tuple[pd.DataFrame, int]:
    """DOF.DAT's columns as text, and the line its first record is on.
    The national file opens with the README's four header lines, which
    are checked; a file of records alone (a state's extract cut down, a
    test's) starts at its first line."""
    with open(dof_dat_path, encoding="latin-1") as f:
        head = [f.readline() for _ in range(4)]
    skip = 0
    if "CURRENCY DATE" in head[0]:
        columns, dashes = head[1], head[3].rstrip("\n")
        if (columns[83:86], columns[89:93], columns[94:96]) != ("AGL", "AMSL", "LT") or dashes != "-" * 127:
            raise ValueError(f"{dof_dat_path}: the header is not the DOF README's (AGL at 84, AMSL at 90, LT at 95, 127 dashes)")
        skip = 4
    names = [*_DOF_COLUMNS, *(f"gap{start}" for start, _ in _DOF_GAPS)]
    records = pd.read_fwf(
        dof_dat_path,
        colspecs=[*_DOF_COLUMNS.values(), *_DOF_GAPS],
        names=names,
        dtype=str,
        header=None,
        skiprows=skip,
        encoding="latin-1",
        keep_default_na=False,
    )
    return records, skip + 1


def _check_dof(records: pd.DataFrame, first_line: int, dof_dat_path: Path) -> None:
    """Every record in the README's layout, or a ValueError naming the
    first one that is not: a column shifted by one puts a digit in a blank
    column or a space in a number, and an obstacle read a column off is a
    height wrong by a factor of ten -- never a row quietly dropped or a NaN."""
    if records.empty:
        raise ValueError(f"{dof_dat_path}: no obstacle records")
    for name, pattern in _DOF_FORMATS.items():
        bad = ~records[name].str.fullmatch(pattern).fillna(False).astype(bool)
        if bad.any():
            at = int(bad.to_numpy().argmax())
            raise ValueError(
                f"{dof_dat_path}: line {at + first_line} has {name} {records[name].iloc[at]!r}, "
                f"not the DOF README's layout ({pattern}); the FAA may have changed it"
            )
    out_of_range = (
        (records["lat_deg"].astype(int) > 90)
        | (records["lon_deg"].astype(int) > 180)
        | (records["lat_min"].astype(int) >= 60)
        | (records["lon_min"].astype(int) >= 60)
    )
    if out_of_range.any():
        at = int(out_of_range.to_numpy().argmax())
        raise ValueError(f"{dof_dat_path}: line {at + first_line} has a position out of range; the layout may have shifted")


def _degrees(records: pd.DataFrame, axis: str, negative: str) -> pd.Series:
    value = records[f"{axis}_deg"].astype(int) + records[f"{axis}_min"].astype(int) / 60 + records[f"{axis}_sec"].astype(float) / 3600
    return value.where(records[f"{axis}_hem"] != negative, -value)


def _parse_dof(dof_dat_path: Path) -> pd.DataFrame:
    """Every obstacle in a DOF.DAT, by pandas' fixed-width reader on the
    README's columns, checked whole before a figure is taken from it."""
    records, first_line = _dof_records(dof_dat_path)
    _check_dof(records, first_line, dof_dat_path)
    return pd.DataFrame(
        {
            "lat": _degrees(records, "lat", "S"),
            "lon": _degrees(records, "lon", "W"),
            "city": records["city"],
            "type": records["type"],
            # Feet: the README's AGL HT and AMSL HT (an AMSL below sea
            # level is written with a minus, -0018 in Death Valley's).
            "agl_ft": records["agl"].astype(int),
            "amsl_ft": records["amsl"].astype(int),
            # Lit only where the README's code says it is: "N" is none
            # and "U" unknown, and a pilot is not told an obstacle of
            # unknown lighting will be seen lit at night.
            "lit": records["lt"].isin(_DOF_LIT),
        }
    )


_OBSTACLES_CACHE: LRUCache = LRUCache(maxsize=1)
_OBSTACLES_LOCK = threading.Lock()
# v2: read by the README's columns, "U" lighting no longer lit; a copy
# from before is parsed again.
_OBSTACLE_CACHE_KEY = b"wingtip.dof_key.v2"


def _load_all_obstacles(dof_dat_path) -> pd.DataFrame:
    """Every obstacle in the national DOF.DAT extract, parsed once per
    edition and held in memory: from memory, else from the Parquet copy
    beside the file, else parsed from the 650,000-line text and written
    back as Parquet, which reads in a fraction of a second. The two
    filters (min_agl_ft, bbox) differ per caller, so what's cached is the
    unfiltered rows; filtering that afterward is a cheap pandas boolean
    mask, not a second file read. One edition held: a new one (every 56
    days) replaces the old in memory rather than sitting beside it."""
    dof_dat_path = Path(dof_dat_path)
    stat = dof_dat_path.stat()
    key = (str(dof_dat_path), stat.st_size, stat.st_mtime)
    with _OBSTACLES_LOCK:
        if key not in _OBSTACLES_CACHE:
            df = _read_obstacle_cache(dof_dat_path, key)
            if df is None:
                df = _parse_dof(dof_dat_path)
                _write_obstacle_cache(dof_dat_path, key, df)
            _OBSTACLES_CACHE[key] = df
        return _OBSTACLES_CACHE[key]


def _obstacle_cache_path(dof_dat_path: Path) -> Path:
    return dof_dat_path.with_suffix(".parquet")


def _read_obstacle_cache(dof_dat_path: Path, key: tuple) -> pd.DataFrame | None:
    path = _obstacle_cache_path(dof_dat_path)
    if not path.exists():
        return None
    try:
        import pyarrow.parquet as pq

        table = pq.read_table(path)
    except Exception:  # noqa: BLE001 -- no pyarrow here, or a damaged file: parse instead
        return None
    stamp = (table.schema.metadata or {}).get(_OBSTACLE_CACHE_KEY, b"null")
    if json.loads(stamp) != list(key):
        return None
    return table.to_pandas()


def _write_obstacle_cache(dof_dat_path: Path, key: tuple, df: pd.DataFrame) -> None:
    path = _obstacle_cache_path(dof_dat_path)
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq

        table = pa.Table.from_pandas(df, preserve_index=False)
        metadata = {**(table.schema.metadata or {}), _OBSTACLE_CACHE_KEY: json.dumps(key).encode()}
        with atomic_path(path) as part:
            pq.write_table(table.replace_schema_metadata(metadata), part)
    except (ImportError, OSError):
        # Without pyarrow, or on a read-only data directory, only the
        # speed-up is lost: the parse runs again next process.
        pass


def load_obstacles(dof_dat_path, bbox: tuple, min_agl_ft: float = 200) -> pd.DataFrame:
    """Obstacles from the national DOF.DAT extract, within bbox and at
    least min_agl_ft tall. Replaces the old generic OSM man_made=tower
    category -- the boldmethod checkpoint guide flags plain "towers" as
    blending into terrain, and FAA obstacle height/lighting data lets us
    filter to the ones actually significant enough to have been surveyed
    and registered as an aeronautical obstruction (FAA/Part 77 uses 200ft
    AGL as its own general obstruction-notification threshold, hence the
    default here) rather than guessing from an OSM tag alone.

    The DOF's own typed columns -- lat, lon, city, type, agl_ft, amsl_ft,
    lit -- as the cache holds them. It used to rebuild each row into a
    checkpoint-shaped record with a dict of tags, for candidates the
    pipeline had long stopped collecting, and its one caller unpacked the
    height back out of the dict, ten thousand rows at a time.
    """
    all_obstacles = _load_all_obstacles(dof_dat_path)
    min_lat, min_lon, max_lat, max_lon = bbox
    wanted = (
        (all_obstacles["agl_ft"] >= min_agl_ft)
        & all_obstacles["lat"].between(min_lat, max_lat)
        & all_obstacles["lon"].between(min_lon, max_lon)
    )
    return all_obstacles[wanted].reset_index(drop=True)
