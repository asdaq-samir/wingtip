"""wingtip.pack_airports and the cycle pack's airports table: each field's
longest hard runway (HARD_FT) written beside NASR's columns by its FAA
ident, so the engine's field_mark_rank ranks a phone's marks offline as
the overlay tiles rank them; a pack or a phone index of older tables is
built again."""

import json

from wingtip import cycle_pack, faa_data, field_marks, pack_airports


def _rwy(tmp_path):
    rwy = tmp_path / "APT_RWY.csv"
    rwy.write_text(
        "ARPT_ID,RWY_ID,RWY_LEN,SURFACE_TYPE_CODE\n"
        "IGQ,09/27,4002,ASPH\nIGQ,18/36,4500,TURF\nIGQ,H1,9000,CONC\n"  # turf and a helipad are not hard runways
        "ORD,10L/28R,13000,CONC\nORD,04L/22R,7500,ASPH\n"
        "LL22,18/36,2813,ASPH-TURF\n"  # part turf: not hard
    )
    return rwy


def test_the_hard_runways_are_the_longest_hard_one_by_faa_ident(tmp_path, monkeypatch):
    rwy = _rwy(tmp_path)
    monkeypatch.setattr(faa_data, "ensure_nasr_file", lambda name, cache_dir: rwy)
    assert field_marks.hard_runways(tmp_path) == {"IGQ": "4002", "ORD": "13000"}


def test_no_runway_file_writes_none(tmp_path, monkeypatch):
    def missing(name, cache_dir):
        raise FileNotFoundError(name)

    monkeypatch.setattr(faa_data, "ensure_nasr_file", missing)
    assert field_marks.hard_runways(tmp_path) == {}


def test_the_airports_table_carries_hard_ft_by_either_ident(tmp_path):
    apt = tmp_path / "APT_BASE.csv"
    apt.write_text("ARPT_ID,ICAO_ID,SITE_TYPE_CODE\nORD,KORD,A\nIGQ,KIGQ,A\nLL22,,A\n")
    table = json.loads(
        cycle_pack._table(
            apt, ("ARPT_ID", "ICAO_ID", "SITE_TYPE_CODE"), {"SIZE": {"KORD": "large"}, "HARD_FT": {"ORD": "13000", "IGQ": "4002"}}
        )
    )
    assert table["columns"] == ["ARPT_ID", "ICAO_ID", "SITE_TYPE_CODE", "SIZE", "HARD_FT"]
    assert table["rows"] == [["ORD", "KORD", "A", "large", "13000"], ["IGQ", "KIGQ", "A", "", "4002"], ["LL22", "", "A", "", ""]]


def test_the_columns_are_the_size_and_the_hard_runway(monkeypatch):
    monkeypatch.setattr(pack_airports, "airport_sizes", lambda: {"KORD": "large"})
    monkeypatch.setattr(field_marks, "hard_runways", lambda cache_dir: {"ORD": "13000"})
    assert pack_airports.columns("x") == {"SIZE": {"KORD": "large"}, "HARD_FT": {"ORD": "13000"}}


def test_older_tables_are_built_again(tmp_path, monkeypatch):
    """A phone index of tables before HARD_FT is not the one wanted, so
    ensure_phone writes the packs again and each region's crc32 changes."""

    class Pack:
        cycle = "2026-10-29"
        meta = {"sources": {}}

    monkeypatch.setattr(cycle_pack, "current", lambda pack_dir=None: Pack())
    monkeypatch.setattr(cycle_pack, "ground_grid_version", lambda: None)
    written = []
    monkeypatch.setattr(cycle_pack, "write_phone", lambda pack, out, veil: written.append(out) or {"regions": []})
    old = {
        "cycle": "2026-10-29",
        "tolerance_deg": cycle_pack.PHONE_TOLERANCE_DEG,
        "terrain_pool": cycle_pack.TERRAIN_POOL,
        "ground_grid": None,
        "sources": {},
    }
    monkeypatch.setattr(cycle_pack, "phone_index", lambda pack_dir=None: old)
    from wingtip import airspace_at

    monkeypatch.setattr(airspace_at, "mode_c_airports", lambda: [])
    assert cycle_pack.ensure_phone(tmp_path) is not None and written
    written.clear()
    monkeypatch.setattr(cycle_pack, "phone_index", lambda pack_dir=None: {**old, "tables": cycle_pack.TABLES})
    assert cycle_pack.ensure_phone(tmp_path) is None and not written
