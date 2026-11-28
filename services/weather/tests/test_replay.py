"""The recorded day the browser suite's weather service replays
(app.replay): every time in it moved by the whole hours to now, and the
products it holds left out of the service's turns."""

import gzip
import json
from datetime import datetime, timezone

import numpy as np
from wingtip import weather_store

from app import main, replay

# 2026-11-23 18:00Z, and the same minute a day and five hours on.
RECORDED = 1795456800.0
NOW = RECORDED + 29 * 3600 + 600
NEAR = datetime.fromtimestamp(RECORDED, timezone.utc)
SHIFT = 29 * 3600


def test_times_move_by_whole_hours_and_nothing_else_does():
    metar = {
        "raw": "METAR KDLH 231755Z 35011G19KT 10SM FEW020 M05/M14 A3035 RMK AO2",
        "observed_at": "2026-11-23T17:55:00.000Z",
        "lat": 46.8435,
        "altimeter_in_hg": 30.35,
        "visibility_sm": 10.0,
    }
    moved = replay.shifted(metar, SHIFT, NEAR)
    assert moved["observed_at"] == "2026-11-24T22:55:00.000Z"
    assert moved["raw"] == "METAR KDLH 242255Z 35011G19KT 10SM FEW020 M05/M14 A3035 RMK AO2"
    assert (moved["lat"], moved["altimeter_in_hg"], moved["visibility_sm"]) == (46.8435, 30.35, 10.0)


def test_a_taf_a_sigmet_a_pirep_and_a_tfr_keep_their_times_together():
    taf = "TAF KDLH 231720Z 2318/2418 35012KT P6SM FEW030 FM240200 32008KT P6SM SKC TEMPO 2320/2324 BKN025"
    assert replay.shifted({"raw": taf}, SHIFT, NEAR)["raw"] == (
        "TAF KDLH 242220Z 2423/2523 35012KT P6SM FEW030 FM250700 32008KT P6SM SKC TEMPO 2501/2505 BKN025"
    )
    sigmet = "WSUS32 KKCI 231655\nSIGMET 1C VALID 231655/232055"
    assert replay.shifted({"raw": sigmet}, SHIFT, NEAR)["raw"].endswith("VALID 242155/250155")
    assert replay.shifted({"raw": "DLH UA /OV DLH/TM 1803/FL050"}, SHIFT, NEAR)["raw"] == "DLH UA /OV DLH/TM 2303/FL050"
    tfr = {"effective": "2026-11-23T12:00:00Z", "expires": None, "modified": "202611230930", "valid_from": 1795436160}
    assert replay.shifted(tfr, SHIFT, NEAR) == {
        "effective": "2026-11-24T17:00:00Z",
        "expires": None,
        "modified": "202611241430",
        "valid_from": 1795436160 + SHIFT,
    }


def test_a_group_that_is_no_time_is_left_as_sent():
    # Day 00 and hour 61 are no day-and-time: a figure of another kind.
    assert replay.shifted({"raw": "X 0012/6100 Y"}, SHIFT, NEAR)["raw"] == "X 0012/6100 Y"


def _write(folder, name, record):
    (folder / f"{name}.json.gz").write_bytes(gzip.compress(json.dumps(record).encode()))


def test_seed_writes_each_product_moved_to_now_and_the_service_fetches_the_rest(tmp_path):
    _write(
        tmp_path, "metars", {"fetched_at": RECORDED, "until": None, "meta": {}, "data": {"KDLH": {"observed_at": "2026-11-23T17:55:00Z"}}}
    )
    _write(tmp_path, "winds-06", {"fetched_at": RECORDED, "until": RECORDED + 3600, "meta": {"run": "2026-11-23T12:00:00Z"}, "data": {}})
    grid = {
        "x0": 0,
        "dx": 1,
        "y0": 0,
        "dy": 1,
        "nx": 2,
        "ny": 1,
        "proj": "+proj=longlat",
        "valid": "2026-11-23T17:00:00Z",
        "array": "glmp-cig-x",
    }
    _write(
        tmp_path,
        "glmp",
        {"fetched_at": RECORDED, "until": RECORDED + 7200, "meta": {}, "data": {"cig": grid, "vis": {**grid, "array": "glmp-vis-x"}}},
    )
    for name in ("glmp-cig-x", "glmp-vis-x"):
        path = tmp_path / f"{name}.npy"
        np.save(path, np.array([[1.0, 2.0]], dtype=np.float32))
        (tmp_path / f"{name}.npy.gz").write_bytes(gzip.compress(path.read_bytes()))
    (tmp_path / "recorded.json").write_text(json.dumps({"recorded_at": RECORDED}))

    assert replay.seed(tmp_path, now=NOW) == {"metars", "winds-06", "glmp"}
    metars = weather_store.read("metars")
    assert metars.fetched_at == RECORDED + SHIFT
    assert metars.data["KDLH"]["observed_at"] == "2026-11-24T22:55:00Z"
    winds = weather_store.read("winds-06")
    assert (winds.until, winds.meta["run"]) == (RECORDED + SHIFT + 3600, "2026-11-24T17:00:00Z")
    assert weather_store.servable(winds, NOW)
    assert weather_store.read_array("glmp-cig-x").tolist() == [[1.0, 2.0]]
    assert weather_store.attempt("metars") == {"attempted": NOW, "error": None, "confirmed": NOW}
    assert not weather_store.failing("metars", metars)
    # And the service's turns are the products not replayed.
    chosen = [p.name for p in main.products() if p.name not in {"metars", "winds-06", "glmp"}]
    assert "metars" not in chosen and "tfrs" in chosen


def test_record_cuts_glmps_grids_to_the_corridor(tmp_path):
    store, out = tmp_path / "store", tmp_path / "out"
    store.mkdir()
    # A degree a cell, the whole of the lower 48: the corridor is a corner of it.
    grid = {"x0": -125.0, "dx": 1.0, "y0": 24.0, "dy": 1.0, "nx": 60, "ny": 26, "proj": "+proj=longlat", "valid": "2026-11-23T17:00:00Z"}
    for field in ("cig", "vis"):
        np.save(store / f"glmp-{field}-x.npy", np.arange(26 * 60, dtype=np.float32).reshape(26, 60))
    for name in replay.RECORDED:
        data = {"cig": {**grid, "array": "glmp-cig-x"}, "vis": {**grid, "array": "glmp-vis-x"}} if name == "glmp" else {}
        _write(store, name, {"fetched_at": RECORDED, "until": None, "meta": {}, "data": data})
    replay.record(store, out)

    cut = json.loads(gzip.decompress((out / "glmp.json.gz").read_bytes()))["data"]["cig"]
    values = np.load(__import__("io").BytesIO(gzip.decompress((out / "glmp-cig-x.npy.gz").read_bytes())))
    assert values.shape == (cut["ny"], cut["nx"]) and cut["nx"] < 60 and cut["ny"] < 26
    # Its first cell the whole grid's at the same place.
    i, j = round(cut["x0"] - grid["x0"]), round(cut["y0"] - grid["y0"])
    assert values[0, 0] == j * 60 + i
    assert cut["x0"] <= replay.CORRIDOR[1] and cut["x0"] + cut["nx"] >= replay.CORRIDOR[3]
    assert json.loads((out / "recorded.json").read_text()) == {"recorded_at": RECORDED}
