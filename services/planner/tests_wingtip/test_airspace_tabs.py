"""wingtip.airspace_tabs: the engine's words for the airspace's tabs, asked
with the fields the tiles and the 3D view's volumes carry. The expected
words are the sectional's (FAA Aeronautical Chart User's Guide, 9 July
2026, VFR Terms and Symbols, Airspace, p. 16): Class B and C the ceiling
over the floor in hundreds of feet MSL, "T" for a Class C ceiling up to
but not including the Class B over it; Class D its ceiling alone, a minus
for "from the surface to, but not including"."""

from wingtip import airspace_tabs


def _volume(klass, floor_ft, floor_ref, ceiling_ft, excluded=False):
    return {"class": klass, "floor_ft": floor_ft, "floor_ref": floor_ref, "ceiling_ft": ceiling_ft, "ceiling_excluded": excluded}


def test_a_class_b_shelf_is_its_ceiling_over_its_floor_in_hundreds():
    assert airspace_tabs.shelf_tab(_volume("B", 3000.0, "MSL", 10000.0)) == "100\n30"
    assert airspace_tabs.shelf_tab(_volume("B", 0.0, "SFC", 10000.0)) == "100\nSFC"


def test_a_class_c_under_class_b_is_t_and_a_class_d_under_it_a_minus():
    assert airspace_tabs.shelf_tab(_volume("C", 0.0, "SFC", 3000.0, excluded=True)) == "T\nSFC"
    assert airspace_tabs.shelf_tab(_volume("D", 0.0, "SFC", 3000.0, excluded=True)) == "-30"
    assert airspace_tabs.shelf_tab(_volume("D", 0.0, "SFC", 2500.0)) == "25"


def test_no_tab_for_class_e_or_no_ceiling():
    assert airspace_tabs.shelf_tab(_volume("E", 0.0, "SFC", 2500.0)) is None
    assert airspace_tabs.shelf_tab(_volume("B", 3000.0, "MSL", None)) is None


def test_a_special_use_area_is_its_name_over_its_limits():
    # Brady North MOA as wingtip.sua reads ADDS: 3,600 MSL to FL180 TNI,
    # 17,999 ft MSL (Class A from 18,000 ft MSL, 14 CFR 71.33).
    area = {
        "name": "BRADY NORTH MOA",
        "type": "MOA",
        "floor_ft": 3600.0,
        "floor_ref": "MSL",
        "ceiling_ft": 18000.0,
        "ceiling_ref": "STD",
        "ceiling_desc": "TNI",
    }
    assert airspace_tabs.special_use_tab(area)["text"] == "M-BRADY NOR*:\n3600-17999"
    assert airspace_tabs.special_use_tab({**area, "excluded": True}) is None
