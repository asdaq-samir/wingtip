"""A field's own figures as the FAA's NASR files them, for every field NASR
lists: where it is and how high (APT_BASE.csv's ARP, LAT_DECIMAL and
LONG_DECIMAL, and ELEV, feet MSL), and its runways (APT_RWY.csv's length,
width, surface and edge lights, APT_RWY_END.csv's ends, their true
alignment and surveyed position, and APT_RMK.csv's closures). The
aviation-check skill names NASR as the source for airports and runways;
OurAirports, community data, stays only for a field NASR does not list.

OurAirports' local codes have been reused for other fields: its 32TX is
Hinson Airport at Kenney, TX, 365 ft, with a 1,866 ft runway 12/30, where
NASR's 32TX is Rockpile Ranch 300 nm west, 5,386 ft, one turf runway 05/23
of 3,931 ft (the aviation audit's AV-1, 2026-11-14). An OurAirports row more
than MATCH_NM from NASR's ARP for the same ident is another field: it lends
the field nothing -- no elevation, runways, frequencies or photo.

The files are those beside the table asked about (`beside`, any file in
data/raw: faa_nasr/ next to it, as wingtip.airports keys its tables), read
once per file version; never fetched from here, as a test's own table has
no FAA file beside it.
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

from . import faa_data, geo
from .engine import ask as engine
from .single_flight import once

#: How far OurAirports' position for an ident may be from NASR's ARP for it
#: and still be the same field, nm. Of the 18,976 US rows whose local code
#: NASR lists (the 2026-10-29 cycle), 18,574 are within 3 nm and 252 more
#: than 5; past 3 the elevations part (106 of the 252 by 200 ft or more).
MATCH_NM = 3.0

#: The idents an OurAirports row goes by, the FAA's own first: NASR's
#: record is the first of them NASR lists (as wingtip.field_status reads
#: the status by).
_IDENT_COLUMNS = ("local_code", "ident", "icao_code", "gps_code")

#: APT_RWY's RWY_LGT_CODE, the runway edge lights' intensity, that are
#: lights (the NASR APT layout): high, medium, low, non-standard,
#: perimeter, strobe and flood. NONE and blank are none; any other code is
#: not taken for lights, the safer answer at night.
_LIGHTS = frozenset({"HIGH", "MED", "LOW", "NSTD", "PERI", "STRB", "FLD"})

#: A remark that closes a whole runway, as APT_RMK files it: "RWY 09/27
#: CLSD INDEFLY.", "RWY 06/24 CLSD PERMLY.", "RWY 13/31 CLSD." -- the
#: whole remark, so "RWY 08/26 CLSD TO NIGHT OPNS ..." is not one.
_CLOSED = re.compile(r"^RWY (\S+) CLSD(?: INDEFLY| PERMLY)?\.?$")


def _faa_file(beside, name: str) -> tuple[str, float]:
    """NASR's file `name` beside `beside` and when it was written, or ("", 0.0)."""
    path = Path(beside).parent / "faa_nasr" / name
    try:
        return str(path), path.stat().st_mtime
    except OSError:
        return "", 0.0


def _number(text) -> float | None:
    try:
        value = float(text)
    except (TypeError, ValueError):
        return None
    return value if value == value else None


@once(maxsize=2)
def _base_of(path: str, _mtime: float) -> dict[str, dict]:
    """Every field NASR lists, by its FAA identifier and then its ICAO one:
    its FAA identifier, ARP, elevation (feet MSL), town and state."""
    df = faa_data._read_apt_base_cached(path, _mtime)
    table = df.reindex(columns=["ARPT_ID", "ICAO_ID", "LAT_DECIMAL", "LONG_DECIMAL", "ELEV", "CITY", "STATE_CODE"]).astype(object)
    by_faa: dict[str, dict] = {}
    by_icao: dict[str, dict] = {}
    for faa_id, icao, lat, lon, elev, city, state in table.itertuples(index=False):
        if not isinstance(faa_id, str) or not faa_id.strip():
            continue
        record = {
            "faa_id": faa_id.strip().upper(),
            "lat": _number(lat),
            "lon": _number(lon),
            "elevation_ft": _number(elev),
            "city": city.strip() if isinstance(city, str) else "",
            "state": state.strip().upper() if isinstance(state, str) else "",
        }
        by_faa.setdefault(record["faa_id"], record)
        if isinstance(icao, str) and icao.strip():
            by_icao.setdefault(icao.strip().upper(), record)
    # An FAA identifier first, where another field's ICAO one is the same.
    by_ident = {**by_icao, **by_faa}
    return by_ident


def _base(beside) -> dict[str, dict]:
    path, mtime = _faa_file(beside, "APT_BASE.csv")
    return _base_of(path, mtime) if path else {}


def of_ident(ident: str, beside) -> dict | None:
    """NASR's record of the field that goes by `ident` (its FAA or ICAO
    identifier), None where NASR lists none or its file is not there."""
    return _base(beside).get((ident or "").strip().upper())


def of_row(row, beside) -> dict | None:
    """NASR's record of an OurAirports row's field: the first of its idents
    NASR lists."""
    base = _base(beside)
    for column in _IDENT_COLUMNS:
        value = row.get(column)
        if isinstance(value, str) and (found := base.get(value.strip().upper())):
            return found
    return None


def far(lat, lon, record: dict | None) -> bool:
    """Whether a position is more than MATCH_NM from NASR's ARP in `record`:
    an OurAirports row there is another field. False with no record or no
    position to compare."""
    if record is None or record["lat"] is None or record["lon"] is None or _number(lat) is None or _number(lon) is None:
        return False
    return float(geo.distance_nm(float(lat), float(lon), record["lat"], record["lon"])) > MATCH_NM


def overlay(us: pd.DataFrame, faa_path: str, faa_mtime: float) -> pd.DataFrame:
    """OurAirports' US table with NASR's ARP and elevation for each field
    NASR lists (`_far` True where OurAirports' own row stood more than
    MATCH_NM off, another field: its town and state NASR's too, and no
    elevation of its own where NASR gives none). With no FAA file to hand,
    the table as it is, none far."""
    us = us.assign(_far=False)
    if not faa_path:
        return us
    base = _base_of(faa_path, faa_mtime)
    record = pd.Series(None, index=us.index, dtype=object)
    for column in _IDENT_COLUMNS:
        if column in us.columns:
            record = record.fillna(us[column].astype(str).str.strip().str.upper().map(base))
    listed = record.notna()
    pick = lambda key: pd.to_numeric(record.map(lambda r: r[key] if isinstance(r, dict) else None), errors="coerce")  # noqa: E731
    lat, lon, elevation = pick("lat"), pick("lon"), pick("elevation_ft")
    ours_lat = pd.to_numeric(us["latitude_deg"], errors="coerce")
    ours_lon = pd.to_numeric(us["longitude_deg"], errors="coerce")
    apart = np.asarray(geo.distance_nm(ours_lat.to_numpy(float), ours_lon.to_numpy(float), lat.to_numpy(float), lon.to_numpy(float)))
    us["_far"] = listed & pd.Series(np.nan_to_num(apart, nan=0.0) > MATCH_NM, index=us.index)
    ours_elevation = pd.to_numeric(us.get("elevation_ft"), errors="coerce") if "elevation_ft" in us else pd.Series(np.nan, index=us.index)
    # NASR's ELEV where it gives one; OurAirports' only for its own field.
    us["elevation_ft"] = elevation.fillna(ours_elevation.where(~us["_far"]))
    us["latitude_deg"] = lat.fillna(ours_lat)
    us["longitude_deg"] = lon.fillna(ours_lon)
    if us["_far"].any():
        far_records = record[us["_far"]]
        # NASR's town as every app writes a NASR name (the engine's airport_names).
        towns = engine("airport_names", names=[r["city"] for r in far_records])
        us.loc[us["_far"], "municipality"] = towns
        us.loc[us["_far"], "iso_region"] = ["US-" + r["state"] if r["state"] else None for r in far_records]
    return us


def _feet(text) -> int | None:
    value = _number(text)
    return int(value) if value is not None else None


def _end_id(end: str) -> str:
    """A runway end as APT_RMK and APT_RWY both may write it: "6R" for "06R"."""
    return end.strip().upper().lstrip("0") or "0"


def _rows(path: str) -> pd.DataFrame:
    """A NASR table as text, read once by _runways_of (its own cache: the
    APT_BASE one keeps two files)."""
    return pd.read_csv(path, dtype=str, low_memory=False) if path else pd.DataFrame()


@once(maxsize=2)
def _runways_of(rwy: str, _rwy_mtime: float, ends: str, _ends_mtime: float, remarks: str, _remarks_mtime: float) -> dict:
    """Every field's runways, by its FAA identifier, in APT_RWY's order."""
    closed: set[tuple[str, str]] = set()
    rmk = _rows(remarks)
    if len(rmk) and "REMARK" in rmk:
        for airport, text in zip(rmk["ARPT_ID"], rmk["REMARK"]):
            if isinstance(airport, str) and isinstance(text, str) and (found := _CLOSED.match(text.strip().upper())):
                closed.add((airport.strip().upper(), "/".join(_end_id(e) for e in found.group(1).split("/"))))
    by_runway: dict[tuple[str, str], list] = {}
    end_rows = _rows(ends)
    for row in end_rows.to_dict("records") if len(end_rows) else []:
        key = (str(row.get("ARPT_ID") or "").strip().upper(), str(row.get("RWY_ID") or "").strip().upper())
        by_runway.setdefault(key, []).append(row)
    out: dict[str, list] = {}
    for row in _rows(rwy).to_dict("records"):
        airport, runway = str(row.get("ARPT_ID") or "").strip().upper(), str(row.get("RWY_ID") or "").strip().upper()
        if not airport or not runway:
            continue
        end_list = by_runway.get((airport, runway)) or [{"RWY_END_ID": e} for e in runway.split("/")]
        names = [str(e.get("RWY_END_ID") or "").strip().upper() for e in end_list]
        positions = {n: (_number(e.get("LAT_DECIMAL")), _number(e.get("LONG_DECIMAL"))) for n, e in zip(names, end_list)}
        # Each end's DISPLACED_THR_LEN, "displaced threshold length in feet
        # from runway end", and LNDG_DIST_AVBL, the landing distance
        # available (LDA) in feet, as APT_RWY_END files them; None where NASR
        # gives none. A landing is checked against these, not the runway's
        # whole length (the web audit's WEB-1; wingtip.pattern puts them on
        # each runway end).
        distances = {
            n: {"displaced_threshold_ft": _feet(e.get("DISPLACED_THR_LEN")), "lda_ft": _feet(e.get("LNDG_DIST_AVBL"))}
            for n, e in zip(names, end_list)
            if n
        }
        surface = str(row.get("SURFACE_TYPE_CODE") or "").strip().upper()
        length, width = _number(row.get("RWY_LEN")), _number(row.get("RWY_WIDTH"))
        out.setdefault(airport, []).append(
            {
                "ends": runway,
                # TRUE_ALIGNMENT: each end's true heading, None where NASR has none.
                "end_headings": [(n, _number(e.get("TRUE_ALIGNMENT"))) for n, e in zip(names, end_list) if n],
                "end_positions": {n: p for n, p in positions.items() if n and None not in p},
                "end_distances": distances,
                "length_ft": int(length) if length is not None else None,
                "width_ft": int(width) if width is not None else None,
                "surface": surface or None,
                "lighted": str(row.get("RWY_LGT_CODE") or "").strip().upper() in _LIGHTS,
                "closed": (airport, "/".join(_end_id(e) for e in runway.split("/"))) in closed,
            }
        )
    return out


def runways(faa_id: str, beside) -> list[dict] | None:
    """The field's runways as NASR lists them, as wingtip.airports'
    get_runways gives them; None where APT_RWY.csv is not there."""
    rwy = _faa_file(beside, "APT_RWY.csv")
    if not rwy[0]:
        return None
    table = _runways_of(*rwy, *_faa_file(beside, "APT_RWY_END.csv"), *_faa_file(beside, "APT_RMK.csv"))
    return [dict(r) for r in table.get(faa_id.strip().upper(), [])]
