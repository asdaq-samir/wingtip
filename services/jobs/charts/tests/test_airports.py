"""The airports layer's order, size and ring (charts.airports): the field a
Class B is named for sorts first and is drawn largest, then a Class C's,
then each tier by its longest hard runway, from rows of NASR's APT_BASE and
APT_RWY as the FAA writes them (the 2026-10-29 cycle) and the airspace
file's IDENT and CLASS; each field's ring is the class of airspace at its
surface, from the Chicago cut of the FAA's airspace file the other tests
read."""

import gzip
import json
import shutil
from pathlib import Path

from charts import airports

FIXTURES = Path(__file__).resolve().parents[3] / "planner" / "tests_wingtip" / "fixtures" / "native"

COLUMNS = ["SITE_NO", "SITE_TYPE_CODE", "ARPT_ID", "ICAO_ID", "ARPT_NAME", "ARPT_STATUS", "LAT_DECIMAL", "LONG_DECIMAL"]
COLUMNS += ["FACILITY_USE_CODE", "TWR_TYPE_CODE"]
FIELDS = [
    ["1", "A", "ORD", "KORD", "CHICAGO O'HARE INTL", "O", "41.97694027", "-87.90814972", "PU", "ATCT-TRACON"],
    ["2", "A", "MDW", "KMDW", "CHICAGO MIDWAY INTL", "O", "41.78597", "-87.75242", "PU", "ATCT"],
    ["3", "A", "PWK", "KPWK", "CHICAGO EXECUTIVE", "O", "42.11418", "-87.90148", "PU", "ATCT"],
    ["4", "A", "IGQ", "KIGQ", "LANSING MUNI", "O", "41.53491", "-87.52950", "PU", "NON-ATCT"],
    ["5", "A", "LL22", "", "BROOKERIDGE AIR PARK", "O", "41.73253", "-87.99979", "PR", "NON-ATCT"],
]
RUNWAYS = [["1", "10L/28R", "13000", "ASPH-CONC"], ["2", "13C/31C", "6522", "CONC"], ["3", "16/34", "5001", "ASPH"]]
RUNWAYS += [["4", "09/27", "4002", "ASPH"], ["5", "09/27", "2813", "ASPH"]]


class _Pack:
    """The cycle pack's airspace attributes, as charts.overlays reads them."""

    def attrs(self, layer):
        assert layer == "airspace"
        return [
            {"IDENT": "ORD", "CLASS": "B"},
            {"IDENT": "MDW", "CLASS": "C"},
            {"IDENT": "MDW", "CLASS": "D"},
            {"IDENT": "PWK", "CLASS": "D"},
        ]


def _csv(path: Path, columns: list[str], rows: list[list[str]]) -> Path:
    path.write_text("\n".join(",".join(f'"{v}"' for v in r) for r in [columns, *rows]) + "\n")
    return path


def test_the_class_b_field_comes_first_and_largest(tmp_path):
    named = airports.primaries(_Pack())
    assert named == {"ORD": "B", "MDW": "C"}
    apt = _csv(tmp_path / "APT_BASE.csv", COLUMNS, FIELDS)
    rwy = _csv(tmp_path / "APT_RWY.csv", ["SITE_NO", "RWY_ID", "RWY_LEN", "SURFACE_TYPE_CODE"], RUNWAYS)
    found = [json.loads(line)["properties"] for line in airports.airport_features(apt, rwy, None, primary=named)]
    by_rank = [p["faa_id"] for p in sorted(found, key=lambda p: p["rank"])]
    assert by_rank == ["ORD", "MDW", "PWK", "IGQ", "LL22"]
    assert {p["faa_id"]: p["size"] for p in found} == {
        "ORD": "largest",
        "MDW": "larger",
        "PWK": "regular",
        "IGQ": "regular",
        "LL22": "small",
    }
    assert next(p for p in found if p["faa_id"] == "ORD")["rank"] == 99_999 - 13_000


def test_each_field_carries_the_class_at_its_surface(tmp_path):
    # The Chicago cut holds the Class B and C round O'Hare and Midway and
    # Chicago Executive's Class D; Lansing and Brookeridge are under the
    # Class B's shelves, which do not reach the ground there, in Class G.
    shp = tmp_path / "chicago_airspace.shp"
    for part in ("shp", "dbf"):
        shp.with_suffix(f".{part}").write_bytes(gzip.decompress((FIXTURES / f"chicago_airspace.{part}.gz").read_bytes()))
    shutil.copy(FIXTURES / "chicago_airspace.shx", shp.with_suffix(".shx"))
    apt = _csv(tmp_path / "APT_BASE.csv", COLUMNS, FIELDS)
    lines = airports.airport_features(apt, None, None, shp_path=shp)
    found = {p["faa_id"]: p.get("airspace") for p in (json.loads(line)["properties"] for line in lines)}
    assert found["ORD"] == "B" and found["MDW"] == "C" and found["PWK"] == "D"
    assert found["IGQ"] == "G" and found["LL22"] == "G"
