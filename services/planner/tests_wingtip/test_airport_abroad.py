"""An ident is a US field's or nothing the planner plans to: KORD-KIGN was
planned 7,191 nm to Indagen, Papua New Guinea (local code IGN) through
get_airport's K-form fallback (2026-11-17). Rows shaped like OurAirports'
own, Indagen's as its table has it."""

import pandas as pd
import pytest

from wingtip.airport_lookup import OutsideCharts
from wingtip.airports import get_airport

INDAGEN = {
    "ident": "AYID",
    "local_code": "IGN",
    "name": "Indagen Airport",
    "latitude_deg": -6.22663,
    "longitude_deg": 147.244,
    "elevation_ft": 5788,
    "municipality": "Indagen",
    "iso_country": "PG",
    "iso_region": "PG-MPL",
}
LAMONI = {
    "ident": "LWD",
    "local_code": "LWD",
    "name": "Lamoni Municipal",
    "latitude_deg": 40.63,
    "longitude_deg": -93.90,
    "elevation_ft": 1131,
    "municipality": "Lamoni",
    "iso_country": "US",
    "iso_region": "US-IA",
}


def _table(tmp_path, *rows):
    path = tmp_path / "airports.csv"
    pd.DataFrame(list(rows)).to_csv(path, index=False)
    return path


def test_the_k_form_never_reaches_a_field_abroad(tmp_path):
    path = _table(tmp_path, INDAGEN, LAMONI)
    with pytest.raises(ValueError, match="No airport goes by 'KIGN'") as err:
        get_airport("KIGN", cache_path=path)
    assert not isinstance(err.value, OutsideCharts)
    # The K-form of a US field's local code still finds it.
    assert get_airport("KLWD", cache_path=path)["name"] == "Lamoni Municipal"


def test_a_field_abroad_is_said_to_be_outside_the_charts_not_planned(tmp_path):
    path = _table(tmp_path, INDAGEN, LAMONI)
    for ident in ("IGN", "AYID"):
        with pytest.raises(OutsideCharts, match=f"'{ident}' is outside the US charts: Indagen Airport, PG"):
            get_airport(ident, cache_path=path)


def test_a_us_field_wins_a_code_it_shares_with_one_abroad(tmp_path):
    # The field abroad first in the table, as OurAirports' order may have it.
    abroad = {**INDAGEN, "local_code": "LWD"}
    path = _table(tmp_path, abroad, LAMONI)
    assert get_airport("LWD", cache_path=path)["name"] == "Lamoni Municipal"


def test_a_table_without_iso_country_reads_the_region(tmp_path):
    row = {k: v for k, v in INDAGEN.items() if k != "iso_country"}
    path = _table(tmp_path, row, {k: v for k, v in LAMONI.items() if k != "iso_country"})
    with pytest.raises(OutsideCharts):
        get_airport("IGN", cache_path=path)
    assert get_airport("KLWD", cache_path=path)["ident"] == "LWD"
