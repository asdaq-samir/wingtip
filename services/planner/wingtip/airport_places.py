"""The airports as the map names them: a place for each open landing
field (find_place, places_in), the nearest fields to a point and, abroad,
the ones that name where a followed flight began or ended."""

from pathlib import Path

import numpy as np
import pandas as pd

from . import geo, geo_boxes
from .airport_tables import DEFAULT_CACHE_PATH, FAA_COUNTRIES, OURAIRPORTS_URL, _ensure_cached, _faa_key, _read_table, countries_of
from .airport_us import _US_AIRPORTS_LOCK, _us_airports, _us_airports_of
from .single_flight import once

# The airports a map draws a place for: fields a pilot can land at. No
# heliports, balloonports or seaplane bases, and nothing closed.
_FIELD_KINDS = {"large_airport": "large", "medium_airport": "medium", "small_airport": "small"}


def _landing(df: pd.DataFrame) -> pd.DataFrame:
    """The open landing fields (every list to land at, map mark, Nearest):
    an airport by OurAirports' type, and not one NASR files as a heliport,
    balloonport or seaplane base (wingtip.field_use's `_airplane`, the
    engine's field_site_type), which OurAirports calls a small airport at
    times and an airplane on wheels cannot land at."""
    airplane = df["_airplane"].ne(False) if "_airplane" in df.columns else True
    return df[df["type"].isin(list(_FIELD_KINDS)) & df["_closed"].isna() & airplane]


def _place_of(row) -> dict:
    """A US airport as the map names it: the ident pilots use (see
    `_us_airports_of`), OurAirports' own (what its runways, frequencies
    and the weather are keyed by), where it is, and what size of field."""
    elevation = row.get("elevation_ft")
    return {
        "ident": row["_display_ident"],
        "source_ident": row["ident"],
        # The FAA's own location identifier (OurAirports' local_code), which
        # the FAA's airspace file names a Class B, C or D's primary field by
        # ("DFW", not KDFW); None where the field has none.
        "faa_id": str(row["local_code"]).strip().upper() or None if pd.notna(row.get("local_code")) else None,
        "name": row["name"],
        "municipality": row["municipality"] if pd.notna(row.get("municipality")) else None,
        "region": row["iso_region"] if pd.notna(row.get("iso_region")) else None,
        "lat": float(row["latitude_deg"]),
        "lon": float(row["longitude_deg"]),
        "elevation_ft": float(elevation) if pd.notna(elevation) else None,
        "kind": _FIELD_KINDS.get(row["type"], "other"),
        # NASR's ARPT_STATUS, and a closed field's label (wingtip.field_status).
        "status": row.get("_status"),
        "closed": row.get("_closed"),
    }


#: The columns _place_of reads.
_PLACE_COLUMNS = (
    "_display_ident",
    "ident",
    "name",
    "municipality",
    "iso_region",
    "latitude_deg",
    "longitude_deg",
    "elevation_ft",
    "type",
    "local_code",
    "_status",
    "_closed",
)


def _places_of(frame: pd.DataFrame) -> list[dict]:
    """_place_of for each row of a frame, read a column at a time: row by
    row (iterrows) it was 14 ms of the 149 fields in a box of Minnesota,
    this a tenth of that (pandas 3, measured 2026-10-10)."""
    columns = [c for c in _PLACE_COLUMNS if c in frame.columns]
    return [_place_of(dict(zip(columns, values))) for values in zip(*(frame[c].tolist() for c in columns))]


def _among(idents: pd.Series, chosen: set) -> pd.Series:
    """Whether each ident is one of `chosen`, by the set's own lookup:
    pandas' isin made an array of the set at each call, 39 ms for the
    5,066 stations that report against the few hundred fields in a box
    (pandas 3, measured 2026-10-10) -- the most of what the map's fields
    in view cost -- where this is half a millisecond."""
    return pd.Series(np.fromiter((i in chosen for i in idents), bool, len(idents)), index=idents.index)


def find_place(ident: str, cache_path: Path = DEFAULT_CACHE_PATH) -> dict | None:
    """One US airport by any ident it goes by -- the one pilots use
    (C81, KDLH), its local code, or OurAirports' own (KC81) -- or None.
    The display ident wins a tie, so KC81 never shadows a real KC81."""
    ident = ident.strip().upper()
    if not ident:
        return None
    path = _ensure_cached(OURAIRPORTS_URL, cache_path)
    df, index = _place_index(str(path), path.stat().st_mtime, *_faa_key(cache_path))
    for first in index:
        if ident in first:
            return _place_of(df.iloc[first[ident]])
    return None


#: The columns find_place looks an ident up in, the first that has it winning.
_PLACE_IDENT_COLUMNS = ("_display_ident", "_ident_upper", "_local_upper")


@once(maxsize=2)
def _place_index(path: str, _mtime: float, faa_path: str = "", _faa_mtime: float = 0.0) -> tuple:
    """The US table and, for each of _PLACE_IDENT_COLUMNS, each ident's
    first row in it, made once per table as the table is: three whole
    columns upper-cased and compared, and the table taken by the answer,
    for every field asked about was 1.7 s of a route's Stops along it, a
    lookup apiece (py-spy on the live planner, 2026-10-28). Upper-cased
    as that comparison did, so the same idents match."""
    with _US_AIRPORTS_LOCK:
        df = _us_airports_of(path, _mtime, faa_path, _faa_mtime)
    index = []
    for column in _PLACE_IDENT_COLUMNS:
        first: dict[str, int] = {}
        for row, key in enumerate(df[column].astype(str).str.upper().tolist()):
            first.setdefault(key, row)
        index.append(first)
    return df, index


def places_in(
    south: float,
    west: float,
    north: float,
    east: float,
    limit: int = 300,
    cache_path: Path = DEFAULT_CACHE_PATH,
    only: set | None = None,
    first: set | None = None,
) -> list[dict]:
    """The landing fields inside a box, the biggest first, at most
    `limit` of them -- what the map lays its tap targets over, so a tap
    on an airport printed on the chart opens its card. Zoomed out the
    box holds thousands, and the small ones are what the limit drops.
    `only`, OurAirports idents, keeps those alone before the limit: the
    fields that report their weather, along a whole route. `first` puts
    those ahead of the rest before the limit: the fields that report,
    so a busy box's limit drops small fields with no weather to show,
    never a small field's weather chip."""
    df = _us_airports(cache_path)
    inside = _landing(df)
    # A box past -180 or 180 read as its two halves (geo_boxes).
    box = (south, west, north, east)
    inside = inside[geo_boxes.in_box(box, inside["latitude_deg"].to_numpy(dtype=float), inside["longitude_deg"].to_numpy(dtype=float))]
    if only is not None:
        inside = inside[_among(inside["ident"], only)]
    rank = inside["type"].map({kind: i for i, kind in enumerate(_FIELD_KINDS)})
    behind = ~_among(inside["ident"], first) if first else False
    # One per ident: OurAirports lists a few fields twice under the same
    # local code (an old record and its successor), and the map keys its
    # targets on it.
    ordered = inside.assign(_behind=behind, _rank=rank).sort_values(["_behind", "_rank", "_display_ident"])
    chosen = ordered.drop_duplicates("_display_ident").head(limit)
    return _places_of(chosen)


#: Where the nearest fields are looked for, nm: a radius of a few minutes'
#: flight, doubled while fewer than the limit lie within it. A box holding
#: `limit` fields does not hold the `limit` nearest (a degree box at 61 N
#: missed Valdez, 37 nm east, for a field 41 nm off), so the radius decides
#: and geo.box_around is its first cut. At the cap, the fields within it
#: alone, fewer than asked: 640 nm is past any glide or fuel stop. Abroad,
#: fields only name where a followed flight began or ended.
_NEAREST_FIRST_NM, _NEAREST_CAP_NM, _ABROAD_CAP_NM = 40.0, 640.0, 40.0


def _nearest_in(fields: pd.DataFrame, lat: float, lon: float, limit: int, cap_nm: float) -> list[dict]:
    """`nearest`'s list from `fields`: a radius is taken once its limit-th
    field lies within it, as every nearer one then does, so in its box."""
    radius = min(_NEAREST_FIRST_NM, cap_nm)
    while True:
        south, west, north, east = geo.box_around(lat, lon, radius)
        east_of = (fields["longitude_deg"] - lon + 180) % 360 - 180  # across 180 too, for the Aleutians
        box = fields[fields["latitude_deg"].between(south, north) & east_of.between(west - lon, east - lon)]
        lats, lons = box["latitude_deg"].to_numpy(dtype=float), box["longitude_deg"].to_numpy(dtype=float)
        box = box.assign(_d=geo.distance_nm(lat, lon, lats, lons), _b=geo.bearing_deg(lat, lon, lats, lons))
        found = box[box["_d"] <= radius].sort_values("_d", kind="stable").drop_duplicates("_display_ident").head(limit)
        if len(found) >= limit or radius >= cap_nm:
            break
        radius = min(radius * 2, cap_nm)
    return [
        {**_place_of(r), "distance_nm": round(float(r["_d"]), 1), "bearing_deg": round(float(r["_b"])) % 360} for _, r in found.iterrows()
    ]


def nearest(lat: float, lon: float, limit: int = 10, cache_path: Path = DEFAULT_CACHE_PATH) -> list[dict]:
    """The landing fields nearest a position, the nearest first: each a
    place (as find_place's) with `distance_nm` and `bearing_deg`, true,
    from the position to it -- what a pilot with an engine running rough
    looks for (wingtip.emergency.fields_near), within _NEAREST_CAP_NM."""
    return _nearest_in(_landing(_us_airports(cache_path)), lat, lon, limit, _NEAREST_CAP_NM)


@once(maxsize=2)
def _abroad_of(path: str, _mtime: float) -> pd.DataFrame:
    """The landing fields outside the US, for naming where a tracked
    airplane flew from and to abroad (wingtip.traffic.history) -- never for
    planning, which is the US's alone (`_us_airports_of`). Its ident the
    ICAO code where it has one, else OurAirports' own."""
    df = _read_table(path, _mtime)
    abroad = df[~countries_of(df).isin(FAA_COUNTRIES) & df["type"].isin(list(_FIELD_KINDS))].copy()
    has_icao = abroad["icao_code"].notna() & (abroad["icao_code"] != "")
    abroad["_display_ident"] = abroad["icao_code"].where(has_icao, abroad["ident"])
    return abroad


def nearest_abroad(lat: float, lon: float, limit: int = 3, cache_path: Path = DEFAULT_CACHE_PATH) -> list[dict]:
    """As `nearest`, among the fields outside the US within _ABROAD_CAP_NM:
    a European airline's flight, followed on the map, named by its own
    airports (LEBL, EGKK) rather than none."""
    path = _ensure_cached(OURAIRPORTS_URL, cache_path)
    return _nearest_in(_abroad_of(str(path), path.stat().st_mtime), lat, lon, limit, _ABROAD_CAP_NM)
