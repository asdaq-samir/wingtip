"""An airport's rows of one of OurAirports' tables (runways.csv,
airport-frequencies.csv), found by an index of the table's rows by
airport made once a table, rather than by comparing the ident asked
with each of some 47,000 runways or 30,000 frequencies at every ask
(wingtip.airports' get_runways and get_frequencies), and a runways.csv row
as get_runways gives a runway."""

from __future__ import annotations

import numpy as np
import pandas as pd

# id(table) -> (table, {upper-cased ident: its rows' positions, in order}).
# A table is read once a file (airports._read_table_of), so this holds one
# a table and edition; the table itself is held so its id is never reused.
_INDEX: dict[int, tuple[pd.DataFrame, dict]] = {}
_KEPT = 8
_NONE = np.empty(0, dtype=np.intp)


def rows(table: pd.DataFrame, ident: str) -> pd.DataFrame:
    """The rows whose airport_ident is `ident` (upper-cased, as the table's
    are compared), in the table's order, with its index: what
    table[table["airport_ident"].str.upper() == ident] gives."""
    held = _INDEX.get(id(table))
    if held is None or held[0] is not table:
        if len(_INDEX) >= _KEPT:
            _INDEX.clear()
        held = _INDEX[id(table)] = (table, table.groupby(table["airport_ident"].str.upper()).indices)
    return table.iloc[held[1].get(ident, _NONE)]


def runways(rows: pd.DataFrame) -> list[dict]:
    """An airport's rows of OurAirports' runways.csv as wingtip.airports'
    get_runways gives a runway: for a field NASR does not list."""
    out = []
    for _, row in rows.iterrows():
        le, he = row.get("le_ident"), row.get("he_ident")
        ends = "/".join(str(e) for e in (le, he) if pd.notna(e)) or None
        length, width = row.get("length_ft"), row.get("width_ft")
        out.append(
            {
                "ends": ends,
                "end_headings": [
                    (str(end), float(row.get(f"{side}_heading_degT")) if pd.notna(row.get(f"{side}_heading_degT")) else None)
                    for side, end in (("le", le), ("he", he))
                    if pd.notna(end)
                ],
                # Where each end is, where the table has it (four runways in ten
                # at a small US field): wingtip.pattern's fallback to NASR's own.
                "end_positions": {
                    str(end): (float(row.get(f"{side}_latitude_deg")), float(row.get(f"{side}_longitude_deg")))
                    for side, end in (("le", le), ("he", he))
                    if pd.notna(end) and pd.notna(row.get(f"{side}_latitude_deg")) and pd.notna(row.get(f"{side}_longitude_deg"))
                },
                "length_ft": int(length) if pd.notna(length) else None,
                "width_ft": int(width) if pd.notna(width) else None,
                "surface": row.get("surface") if pd.notna(row.get("surface")) else None,
                "lighted": bool(row.get("lighted")),
                "closed": bool(row.get("closed")),
            }
        )
    return out
