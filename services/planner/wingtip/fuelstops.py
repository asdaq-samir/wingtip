"""Where a flight too long for its tanks can land for fuel, as an electric
car's planner offers its chargers on the way: the fields that sell the
airplane's fuel near the course, the one that makes the trip quickest
put in for the pilot, and others to choose from.

Which fields, in what order, and what each lands with are the engine's
(engine/crates/route/src/route/options/fuel.rs: `fuel_stops`, and
`fields_along` for the map's Stops; #482 phase 5), from the flight's own
burn and minutes per mile and the reserve it is held to (14 CFR 91.151(a),
91.167(a)(3)), which the plan's nav log works out. This reads the fields:
NASR's APT_BASE for those that sell FUEL and are open to the public, and
OurAirports' runways for each one's longest open paved runway.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from . import airports, faa_data, field_status
from .engine import ask as engine
from .terrain import DEFAULT_FAA_CACHE_DIR
from .single_flight import once

#: The fuel looked for: avgas, which every piston profile here burns. A
#: field's FUEL_TYPES lists what it sells (the FAA's NASR APT_BASE).
FUEL = "100LL"


@dataclass(frozen=True)
class FuelStop:
    ident: str
    name: str
    city: str
    lat: float
    lon: float
    #: Miles from the flight's departure to it, and the miles it adds to
    #: the flight's straight line.
    from_nm: float
    added_nm: float
    #: The fuel left on landing there, gallons, and the minutes flown to
    #: it from the flight's departure.
    lands_with_gal: float
    minutes: float
    fuel_types: str
    runway_ft: int
    elevation_ft: float | None

    def as_dict(self) -> dict:
        return asdict(self)


@once(maxsize=4)
def _fields_of(path: str, _mtime: float, fuel_only: bool = True) -> pd.DataFrame:
    """The public airports that sell FUEL, from APT_BASE -- or, not
    `fuel_only`, every public airport: ident (the ICAO one where there is
    one, as the route spells it), name, city, where, elevation and what
    fuel."""
    df = faa_data._read_apt_base_cached(path, _mtime)
    sells = df["FUEL_TYPES"].fillna("").str.split(",").apply(lambda types: FUEL in [t.strip() for t in types])
    open_public = (df["FACILITY_USE_CODE"] == "PU") & (df["SITE_TYPE_CODE"] == "A") & field_status.open_mask(df["ARPT_STATUS"].fillna(""))
    df = df[(sells | (not fuel_only)) & open_public]
    icao = df["ICAO_ID"].fillna("").str.strip()
    return pd.DataFrame(
        {
            "ident": np.where(icao != "", icao, df["ARPT_ID"].str.strip()),
            "faa_ident": df["ARPT_ID"].str.strip(),
            "name": df["ARPT_NAME"].fillna("").str.strip(),
            "city": df["CITY"].fillna("").str.strip(),
            "lat": df["LAT_DECIMAL"].astype(float),
            "lon": df["LONG_DECIMAL"].astype(float),
            "elevation_ft": pd.to_numeric(df["ELEV"], errors="coerce"),
            "fuel_types": df["FUEL_TYPES"].fillna("").str.strip(),
        }
    ).reset_index(drop=True)


def fields_with_fuel(cache_dir=DEFAULT_FAA_CACHE_DIR) -> pd.DataFrame:
    path = faa_data.ensure_nasr_file("APT_BASE.csv", cache_dir)
    return _fields_of(str(path), Path(path).stat().st_mtime)


def public_fields(cache_dir=DEFAULT_FAA_CACHE_DIR) -> pd.DataFrame:
    """Every open public airport, fuel or not: a meal or a bed needs none."""
    path = faa_data.ensure_nasr_file("APT_BASE.csv", cache_dir)
    return _fields_of(str(path), Path(path).stat().st_mtime, False)


@once(maxsize=2)
def _paved_runways_of(path: str, _mtime: float) -> dict[str, int]:
    """Each field's longest open paved runway, feet, by ident (OurAirports'
    runways table: "ASPH", "CONC", "ASPH-G" and the like are paved)."""
    df = airports._read_table(path, _mtime)
    surface = df["surface"].fillna("").str.upper()
    paved = surface.str.contains("ASP|CON|PEM|BIT", regex=True) & (df["closed"].fillna(0).astype(int) == 0)
    df = df[paved & df["length_ft"].notna()]
    return df.groupby(df["airport_ident"].str.upper())["length_ft"].max().astype(int).to_dict()


def paved_runways() -> dict[str, int]:
    """Every field's longest open paved runway, feet, by ident."""
    path = airports._ensure_cached(airports.RUNWAYS_URL, airports.RUNWAYS_CACHE_PATH)
    return _paved_runways_of(str(path), Path(path).stat().st_mtime)


def _table(fields: pd.DataFrame) -> list[dict]:
    """The fields as the engine reads them, each with its longest open
    paved runway (the ICAO ident's or the FAA's), looked up as a column: a
    row at a time, it was most of a repeated Seattle to Miami plan's
    second (2026-10-23)."""
    if fields.empty:
        return []
    longest = paved_runways()

    def runway_of(idents: pd.Series) -> np.ndarray:
        return idents.astype(str).fillna("").str.strip().str.upper().map(longest).fillna(0).astype(int).to_numpy()

    faa = fields["faa_ident"] if "faa_ident" in fields else fields["ident"]
    runway = np.maximum(runway_of(fields["ident"]), runway_of(faa))
    elevation = pd.to_numeric(fields["elevation_ft"], errors="coerce") if "elevation_ft" in fields else pd.Series([np.nan] * len(fields))
    return [
        {
            "ident": str(i),
            "faa_ident": str(f),
            "name": str(n),
            "city": str(c),
            "lat": float(la),
            "lon": float(lo),
            "elevation_ft": None if pd.isna(e) else float(e),
            "fuel_types": str(t or ""),
            "runway_ft": int(r),
        }
        for i, f, n, c, la, lo, e, t, r in zip(
            fields["ident"],
            faa,
            fields["name"],
            fields.get("city", fields["name"]),
            fields["lat"],
            fields["lon"],
            elevation,
            fields["fuel_types"],
            runway,
        )
    ]


def suggest(
    start: tuple,
    end: tuple,
    *,
    fuel_per_nm: float,
    min_per_nm: float,
    usable_gal: float,
    taxi_gal: float,
    reserve_gal: float,
    ground_min: float = 30.0,
    skip: set | None = None,
    fields: pd.DataFrame | None = None,
) -> tuple[list[FuelStop], list[FuelStop]]:
    """The stops that take a flight from `start` to `end` (lat, lon) with
    the reserve left on every landing -- the tanks filled at each -- and
    other fields the first could be: ([], []) where none is needed or no
    fields reach. The engine's choice (fuel_stops): the quickest trip, the
    first stop nearest the line among those as quick, then the one whose
    landings keep the most fuel."""
    fields = fields_with_fuel() if fields is None else fields
    found = engine(
        "fuel_stops",
        start=list(start),
        end=list(end),
        fuel_per_nm=fuel_per_nm,
        min_per_nm=min_per_nm,
        usable_gal=usable_gal,
        taxi_gal=taxi_gal,
        reserve_gal=reserve_gal,
        ground_min=ground_min,
        skip=sorted(skip or ()),
        fields=_table(fields),
    )
    return [FuelStop(**s) for s in found["stops"]], [FuelStop(**c) for c in found["choices"]]


def along(flights: list[tuple[str, tuple, tuple]], skip: set | None = None, fields: pd.DataFrame | None = None) -> list[dict]:
    """The public fields on a long enough paved runway no more than
    30 nm off each flight's straight line ((departure ident, start,
    end) for each), at the owner's ask for the food, fuel and rest stops
    along the route to pick from (2026-10-23, the map's Stops): each
    with the flight it is on (`flight`, its index, and `departure`), its
    miles from that flight's departure and the miles it adds, in route
    order. A field near two flights is listed on the first; the forty
    nearest the line kept (the engine's fields_along)."""
    fields = public_fields() if fields is None else fields
    return engine(
        "fields_along",
        flights=[{"departure": d, "start": list(a), "end": list(b)} for d, a, b in flights],
        skip=sorted(skip or ()),
        fields=_table(fields),
    )
