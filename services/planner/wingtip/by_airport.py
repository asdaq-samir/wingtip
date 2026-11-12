"""An airport's rows of one of OurAirports' tables (runways.csv,
airport-frequencies.csv), found by an index of the table's rows by
airport made once a table, rather than by comparing the ident asked
with each of some 47,000 runways or 30,000 frequencies at every ask
(wingtip.airports' get_runways and get_frequencies)."""

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
