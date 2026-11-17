"""One airport by ident: its position, elevation, name and region from
NASR where it lists the field, from OurAirports' row otherwise, and the
field's Wikipedia article."""

from pathlib import Path

import pandas as pd

from . import field_use, nasr_fields
from .airport_tables import DEFAULT_CACHE_PATH, OURAIRPORTS_URL, _airport_rows, _ensure_cached, _faa_key, _read_table


def _ours(ident: str, beside) -> tuple:
    """OurAirports' row for `ident` in the airports table beside `beside`
    (None where it has none, or the table is not there: never fetched from
    here), NASR's record of its field, and whether the row is another
    field than NASR's (nasr_fields.MATCH_NM), which lends it nothing."""
    path = Path(beside).parent / DEFAULT_CACHE_PATH.name
    at = _airport_rows(str(path), path.stat().st_mtime).get(ident.strip().upper()) if path.exists() else None
    row = None if at is None else _read_table(str(path), path.stat().st_mtime).iloc[at]
    field = nasr_fields.of_row(row, beside) if row is not None else nasr_fields.of_ident(ident, beside)
    return row, field, row is not None and nasr_fields.far(row["latitude_deg"], row["longitude_deg"], field)


def wikipedia_link(ident: str, cache_path: Path = DEFAULT_CACHE_PATH) -> str | None:
    """The field's Wikipedia article, as OurAirports links it, or None: its
    ground photo's source (wingtip.airport_photos); none where OurAirports'
    row is another field's."""
    _ensure_cached(OURAIRPORTS_URL, cache_path)
    row, _, lent = _ours(ident, cache_path)
    link = None if row is None or lent else row.get("wikipedia_link")
    return link.strip() if isinstance(link, str) and link.strip() else None


def get_airport(ident: str, cache_path: Path = DEFAULT_CACHE_PATH) -> dict:
    """Look up one airport by FAA local identifier or ICAO ident.

    Raises ValueError if not found.
    """
    ident = ident.strip().upper()
    path = _ensure_cached(OURAIRPORTS_URL, cache_path)
    mtime = path.stat().st_mtime
    rows = _airport_rows(str(path), mtime)
    at = rows.get(ident)
    # A field with no ICAO code of its own in OurAirports (Lamoni, LWD)
    # asked for by the K-form the FAA's NASR file gives it (KLWD), as the
    # fuel stops' table (NASR) names it: a contiguous US field's ICAO
    # identifier is its FAA one with a K before it (FAA Order JO 7350.9,
    # Location Identifiers). The fuel stop the planner offered could not be
    # planned (the owner's video, 2026-10-26).
    if at is None and len(ident) == 4 and ident[0] == "K" and ident[1:].isalnum():
        at = rows.get(ident[1:])
    if at is None:
        # The pilot's words, which the route box shows on the ident's own
        # pill (the FPL audit's A2): what it is, not which file it is not in.
        raise ValueError(f"No airport goes by {ident!r}.")
    row = _read_table(str(path), mtime).iloc[at]
    # NASR's position, elevation and name for a field it lists; OurAirports'
    # elevation only for its own field (wingtip.nasr_fields).
    field = nasr_fields.of_row(row, cache_path)
    lent = nasr_fields.far(row["latitude_deg"], row["longitude_deg"], field)
    named = field_use._records_of(*_faa_key(cache_path)).get(field["faa_id"], {}) if field else {}
    elevation = field["elevation_ft"] if field and field["elevation_ft"] is not None else None if lent else row.get("elevation_ft")
    return {
        "ident": row["ident"],
        "name": named.get("name") or row["name"],
        "lat": float(field["lat"] if field and field["lat"] is not None else row["latitude_deg"]),
        "lon": float(field["lon"] if field and field["lon"] is not None else row["longitude_deg"]),
        "elevation_ft": float(elevation) if pd.notna(elevation) else None,
        "municipality": "" if lent else row.get("municipality", ""),
        "region": f"US-{field['state']}" if lent and field["state"] else row.get("iso_region", ""),
    }
