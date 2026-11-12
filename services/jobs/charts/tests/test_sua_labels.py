"""The special-use areas' tabs (charts.sua_labels), from the areas near
Brady, TX as the FAA's special use airspace feature service (ADDS) gives
them, read 2026-11-12, against what the FAA's CIFP (cycle 2610) writes for
the same areas and ForeFlight's tabs over them (the owner's screenshot,
2026-11-12): "M-BRADY NOR*: 3600-17999", "M-BRADY LOW: 500AGL-5999"."""

import json

import pytest
from shapely.geometry import Polygon

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


@pytest.mark.parametrize(
    ("name", "type_code", "label"),
    [
        ("BRADY NORTH MOA", "MOA", "M-BRADY NOR*"),
        ("BRADY LOW MOA", "MOA", "M-BRADY LOW"),
        # The four Brownwood MOAs stay apart when cut.
        ("BROWNWOOD 2 WEST MOA", "MOA", "M-BROWN 2 W*"),
        ("BROWNWOOD 2 EAST MOA", "MOA", "M-BROWN 2 E*"),
        ("BROWNWOOD 1 WEST MOA", "MOA", "M-BROWN 1 W*"),
        # A designator carries its letter already.
        ("R-2602", "R", "R-2602"),
        ("A-220", "A", "A-220"),
        ("W-291W", "W", "W-291W"),
        ("P-56A", "P", "P-56A"),
    ],
)
def test_the_tabs_name_is_the_types_letter_and_the_name_cut_as_foreflight_cuts_it(name, type_code, label):
    assert sua_labels.label_name(name, type_code) == label


@pytest.mark.parametrize(
    ("row", "upper", "expected"),
    [
        # FL180 TNI: 17,999 ft MSL, CIFP's "17999M" (Class A from 18,000 MSL, 14 CFR 71.33).
        (("180", "FL", "STD", "TNI"), True, (17999.0, "MSL")),
        # FL180 included: the flight level.
        (("180", "FL", "STD", "TI"), True, (18000.0, "FL")),
        (("230", "FL", "STD", "TI"), True, (23000.0, "FL")),
        # 6,000 MSL TNI: CIFP's "05999M"; included, the figure.
        (("6000", "FT", "MSL", "TNI"), True, (5999.0, "MSL")),
        (("6000", "FT", "MSL", "TI"), True, (6000.0, "MSL")),
        # A ceiling above the ground.
        (("700", "FT", "SFC", "TI"), True, (700.0, "AGL")),
        (("-9998", None, "UNLTD", None), True, (None, "UNL")),
        # The surface, and a floor 500 ft above it: CIFP's "00500A".
        (("0", "FT", "SFC", None), False, (0.0, "SFC")),
        (("500", "FT", "SFC", None), False, (500.0, "AGL")),
        # Above but not including 1,500 AGL: CIFP's "01501A".
        (("1500", "FT", "SFC", "ANI"), False, (1501.0, "AGL")),
        (("3600", "FT", "MSL", None), False, (3600.0, "MSL")),
        (("180", "FL", "STD", None), False, (18000.0, "FL")),
        (("", "FT", "MSL", None), False, (None, None)),
    ],
)
def test_a_limit_is_written_as_the_faas_cifp_writes_it(row, upper, expected):
    assert sua_labels.limit(*row, upper=upper) == expected


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
    lon, _ = tab["geometry"]["coordinates"]
    # Read top to bottom, the text's top faces east: the area is above it
    # on its west side, below it on its east.
    assert props["side"] == (-1 if lon == pytest.approx(-99.0) else 1)
