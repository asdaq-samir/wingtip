"""The Rust extension (engine/, wingtip_native) held to references it does not
share code with:

- the airspace at a point against shapely's contains on pyshp's own
  reading of each shape, at random points, and against the volumes the
  pyshp and shapely code gave at real taps round Chicago (O'Hare, KDPA,
  Midway and its shelf, Wheeling under O'Hare's shelf), captured then from
  the NASR Class Airspace shapefile the planner held, cut to the volumes
  there; and the same from the cycle pack (wingtip.cycle_pack) made of that file.

The Chicago taps are shared with the engine's own tests
(engine/facade/tests/fixtures.rs), which hold route options' straight
lines to the two real routes' grids (KMSP-KDEN, KDLH-KSTL) the Python gave
until the whole of route options moved into the engine (#482 phase 5).

The wheel is built into the planner's image; CI builds it for these."""

import gzip
import json
import shutil
from pathlib import Path

import numpy as np
import pytest
import shapefile
from shapely.geometry import Point
from shapely.geometry import shape as shapely_shape

import wingtip_native
from wingtip import airspace_at
from wingtip import cycle_pack

FIXTURES = Path(__file__).parent / "fixtures" / "native"


# --- The airspace at a point -------------------------------------------------


@pytest.fixture(scope="module")
def chicago(tmp_path_factory) -> Path:
    where = tmp_path_factory.mktemp("airspace") / "chicago_airspace.shp"
    for part in ("shp", "dbf"):
        where.with_suffix(f".{part}").write_bytes(gzip.decompress((FIXTURES / f"chicago_airspace.{part}.gz").read_bytes()))
    shutil.copy(FIXTURES / "chicago_airspace.shx", where.with_suffix(".shx"))
    return where


def test_real_taps_find_the_volumes_the_shapely_code_found(chicago):
    taps = json.loads((FIXTURES / "chicago_airspace.json").read_text())
    for name, tap in taps.items():
        assert airspace_at.volumes_at(*tap["at"], chicago) == tap["volumes"], name


def test_a_shape_holds_what_shapely_says_it_holds(chicago):
    """Random points in each volume's box -- Chicago's Class B, C, D and E,
    their shelves and cut-outs -- against shapely."""
    rng = np.random.default_rng(3)
    shp = chicago.read_bytes()
    shx = np.frombuffer(chicago.with_suffix(".shx").read_bytes(), dtype=">i4", offset=100).reshape(-1, 2)
    reader = shapefile.Reader(str(chicago))
    held = 0
    for i, (offset, length) in enumerate(shx):
        shape = reader.shape(i)
        polygon = shapely_shape(shape.__geo_interface__)
        content = shp[int(offset) * 2 + 8 : int(offset) * 2 + 8 + int(length) * 2]
        x0, y0, x1, y1 = shape.bbox
        for x, y in zip(rng.uniform(x0, x1, 300), rng.uniform(y0, y1, 300)):
            inside = polygon.contains(Point(x, y))
            held += inside
            assert wingtip_native.shape_holds(content, float(x), float(y)) == inside, (i, x, y)
    reader.close()
    assert held > 1000


# --- The cycle pack -------------------------------------------------------------


@pytest.fixture()
def chicago_pack(chicago, tmp_path, monkeypatch):
    """A pack of the Chicago cut alone, where wingtip.cycle_pack looks for one."""
    path = cycle_pack.write(tmp_path, "2026-10-29", shp_path=chicago, sua_held=[], sua_at=0.0, urban=[], urban_path=None, tables={})
    monkeypatch.setattr(cycle_pack, "PACK_DIR", tmp_path)
    return path


def test_the_pack_reads_back_as_written(chicago_pack):
    pack = cycle_pack.Pack(chicago_pack)
    assert pack.verify()
    header = wingtip_native.pack_header(pack.mapped)
    assert header["cycle"] == pack.cycle == "2026-10-29"
    assert header["crc32"] == pack.crc32
    assert set(header["sections"]) == set(pack.sections)
    assert wingtip_native.pack_verify(pack.mapped)
    assert cycle_pack.matches(pack, "airspace", chicago_pack.parent.parent / "missing.shp") is False


def test_real_taps_from_the_pack_find_what_the_shapefile_found(chicago, chicago_pack):
    taps = json.loads((FIXTURES / "chicago_airspace.json").read_text())
    assert airspace_at._packed(chicago) is not None
    for name, tap in taps.items():
        assert airspace_at.volumes_at(*tap["at"], chicago) == tap["volumes"], name


def test_the_packs_rings_hold_what_the_shapefiles_hold(chicago, chicago_pack):
    """Random points in each volume's box, the pack's WKB against the
    shapefile's own record."""
    rng = np.random.default_rng(5)
    pack = cycle_pack.Pack(chicago_pack)
    wkbs, boxes = pack.wkb("airspace"), pack.boxes("airspace")
    shp = chicago.read_bytes()
    shx = np.frombuffer(chicago.with_suffix(".shx").read_bytes(), dtype=">i4", offset=100).reshape(-1, 2)
    contents = [shp[int(o) * 2 + 8 : int(o) * 2 + 8 + int(n) * 2] for o, n in shx]
    assert len(wkbs) == len(contents)
    for wkb, content, (x0, y0, x1, y1) in zip(wkbs, contents, boxes):
        for x, y in zip(rng.uniform(x0, x1, 200), rng.uniform(y0, y1, 200)):
            assert wingtip_native.wkb_holds(wkb, float(x), float(y)) == wingtip_native.shape_holds(content, float(x), float(y))


def test_one_way_in_answers_a_rule_by_name_as_its_own_function_does():
    """wingtip_native.call, the engine's one way in that the web app's
    WebAssembly and the phones' `call` share (wingtip_engine::call): a
    rule by name, JSON in and out, the answer the rule's own function
    gives; a name not known or input of the wrong shape a ValueError."""
    asked = json.loads(
        wingtip_native.call(
            "diversion",
            json.dumps(
                {
                    "true_course_deg": 360,
                    "distance_nm": 18,
                    "tas_kt": 110,
                    "fuel_burn_gph": 8.5,
                    "magnetic_variation_deg": -3,
                    "wind": {"wind_dir_true_deg": 270, "wind_speed_kt": 20},
                    "to": "KDPA",
                    "mh": 350,
                }
            ),
        )
    )
    # Due north 18 nm in a 20 kt west wind at 110 kt: a correction left
    # of about 10 degrees, 3 W of variation to add (east is least, west
    # is best), so a magnetic heading of about 353; the 350 typed within
    # the drill's allowance.
    assert asked["problem"] is None
    assert asked["solved"]["mh"] == pytest.approx(352.5, abs=0.5)
    assert json.loads(wingtip_native.call("holding_leg_minutes", '{"altitude_ft": 16000}')) == 1.5
    with pytest.raises(ValueError, match="no rule called"):
        wingtip_native.call("nope", "{}")
    with pytest.raises(ValueError, match='"heading" is missing'):
        wingtip_native.call("holding", '{"inbound": 360}')
