"""The special-use areas' tabs (charts.sua_labels), from the areas near
Brady, TX as the FAA's special use airspace feature service (ADDS) gives
them, read 2026-11-12, against what the FAA's CIFP (cycle 2610) writes for
the same areas and ForeFlight's tabs over them (the owner's screenshot,
2026-11-12): "M-BRADY NOR*: 3600-17999", "M-BRADY LOW: 500AGL-5999".
The words are the engine's special_use_tab (held to every case in
apps/web/src/lib/fixtures/specialUseTab.json by
engine/facade/tests/special_use_tab.rs); here, that the job asks it of
ADDS' rows as wingtip.sua reads them."""

import json

import pytest
from shapely.geometry import Polygon
from wingtip import sua

from charts import sua_labels

#: ADDS' rows, the fields the tabs read, as the service sent them.
BRADY_NORTH = {
    "NAME": "BRADY NORTH MOA",
    "TYPE_CODE": "MOA",
    "UPPER_DESC": "TNI",
    "UPPER_VAL": "180",
    "UPPER_UOM": "FL",
    "UPPER_CODE": "STD",
    "LOWER_VAL": "3600",
    "LOWER_UOM": "FT",
    "LOWER_CODE": "MSL",
    "EXCLUSION": "0",
}
BRADY_LOW = {
    "NAME": "BRADY LOW MOA",
    "TYPE_CODE": "MOA",
    "UPPER_DESC": "TNI",
    "UPPER_VAL": "6000",
    "UPPER_UOM": "FT",
    "UPPER_CODE": "MSL",
    "LOWER_VAL": "500",
    "LOWER_UOM": "FT",
    "LOWER_CODE": "SFC",
    "EXCLUSION": "0",
}
#: One of Brady Low's two pieces cut out below 1,500 ft AGL.
BRADY_LOW_EXCLUDED = {**BRADY_LOW, "LOWER_DESC": "ANI", "LOWER_VAL": "1500", "EXCLUSION": "1"}


def _row(base, **fields):
    return {**base, **fields}


@pytest.mark.parametrize(
    ("row", "expected"),
    [
        # FL180 TNI: 17,999 ft MSL, CIFP's "17999M" (Class A from 18,000 MSL, 14 CFR 71.33).
        (BRADY_NORTH, ("M-BRADY NOR*", 3600.0, "MSL", 17999.0, "MSL")),
        # FL180 included: the flight level.
        (_row(BRADY_NORTH, UPPER_DESC="TI"), ("M-BRADY NOR*", 3600.0, "MSL", 18000.0, "FL")),
        # 500 FT SFC to 6,000 MSL TNI: CIFP's "00500A" to "05999M".
        (BRADY_LOW, ("M-BRADY LOW", 500.0, "AGL", 5999.0, "MSL")),
        # Above but not including 1,500 AGL: CIFP's "01501A".
        (_row(BRADY_LOW, LOWER_DESC="ANI", LOWER_VAL="1500"), ("M-BRADY LOW", 1501.0, "AGL", 5999.0, "MSL")),
        # No ceiling.
        (
            _row(BRADY_LOW, UPPER_VAL="-9998", UPPER_UOM=None, UPPER_CODE="UNLTD", UPPER_DESC=None),
            ("M-BRADY LOW", 500.0, "AGL", None, "UNL"),
        ),
        # A row read before the DESC fields were asked: as coded.
        ({k: v for k, v in BRADY_NORTH.items() if k not in ("UPPER_DESC", "EXCLUSION")}, ("M-BRADY NOR*", 3600.0, "MSL", 18000.0, "FL")),
    ],
)
def test_the_tab_is_the_engines_from_the_faas_row(row, expected):
    tab = sua_labels.tab_words(sua._area(row))
    assert tab["text"].startswith(f"{expected[0]}:\n")
    assert (tab["name"], tab["floor_ft"], tab["floor_ref"], tab["ceiling_ft"], tab["ceiling_ref"]) == expected


def test_a_piece_cut_out_of_its_area_has_no_tab():
    assert sua_labels.tab_words(sua._area(BRADY_LOW_EXCLUDED)) is None


class _Pack:
    """As much of a cycle pack (wingtip.cycle_pack.Pack) as the tabs read:
    the areas' fields and shapes, as the feature service gave them."""

    sections = ("sua.attr",)

    def __init__(self, areas):
        self.areas = areas

    def attrs(self, layer):
        return [props for props, _ in self.areas]

    def geometries(self, layer):
        return [shape for _, shape in self.areas]


def _pack(_tmp_path, areas):
    return _Pack(areas)


def test_each_area_has_one_tab_on_its_longest_side_and_an_excluded_piece_none(tmp_path):
    # Brady North as a box longer east-west than north-south: its tab on
    # the south (or north) side, level; Brady Low's cut-out piece none.
    north = Polygon([(-99.75, 31.25), (-98.75, 31.25), (-98.75, 31.38), (-99.75, 31.38)])
    piece = Polygon([(-99.4, 31.0), (-99.3, 31.0), (-99.3, 31.1), (-99.4, 31.1)])
    pack = _pack(tmp_path, [(BRADY_NORTH, north), (BRADY_LOW_EXCLUDED, piece)])
    [tab] = [json.loads(line) for line in sua_labels.special_use_label_features(pack)]
    props = tab["properties"]
    assert props["tab"] == "M-BRADY NOR*:\n3600-17999"
    assert props["label"] == "M-BRADY NOR*"
    assert (props["floor_ft"], props["floor_ref"], props["ceiling_ft"], props["ceiling_ref"]) == (3600.0, "MSL", 17999.0, "MSL")
    assert props["angle"] == pytest.approx(0, abs=0.5)
    lon, lat = tab["geometry"]["coordinates"]
    assert lon == pytest.approx(-99.25, abs=1e-6) and lat in (pytest.approx(31.25), pytest.approx(31.38))
    # The area is above the text on its south side, below it on its north.
    assert props["side"] == (-1 if lat == pytest.approx(31.25) else 1)


def test_a_tab_on_a_north_south_side_is_turned_to_read_down_it(tmp_path):
    # Tall and narrow, as Brownwood 2 East's west side on the screenshot.
    tall = Polygon([(-99.0, 31.4), (-98.9, 31.4), (-98.9, 32.0), (-99.0, 32.0)])
    pack = _pack(tmp_path, [(BRADY_LOW, tall)])
    [tab] = [json.loads(line) for line in sua_labels.special_use_label_features(pack)]
    props = tab["properties"]
    assert props["angle"] == pytest.approx(90, abs=0.5)
    assert (props["floor_ft"], props["floor_ref"], props["ceiling_ft"]) == (500.0, "AGL", 5999.0)
    assert props["tab"] == "M-BRADY LOW:\n500AGL-5999"
    lon, _ = tab["geometry"]["coordinates"]
    # Read top to bottom, the text's top faces east: the area is above it
    # on its west side, below it on its east.
    assert props["side"] == (-1 if lon == pytest.approx(-99.0) else 1)
