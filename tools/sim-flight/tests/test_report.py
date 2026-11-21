"""The report: the engine's reading of the stream held to the simulator's
own state, the measures a fix, and whether the flight passed."""

import json

from sim_flight import report


def state(utc, lat=43.0, alt_ft=3000.0, gs_kt=100.0, track=90.0, traffic=(), done=False, phase="enroute"):
    return {
        "utc": utc,
        "t": utc,
        "sim": "xplane",
        "phase": phase,
        "done": done,
        "own": {"lat": lat, "lon": -89.0, "alt_ft": alt_ft, "gs_kt": gs_kt, "track_deg": track},
        "traffic": [{"callsign": c} for c in traffic],
    }


def read(utc, lat=43.0, alt_ft=3000.0, gs_kt=100.0, track=90.0, targets=()):
    return {
        "at": utc,
        "own": {"lat": lat, "lon": -89.0, "geometric_ft": alt_ft, "speed_kt": gs_kt, "track_deg": track},
        "targets": [{"callsign": c} for c in targets],
    }


def test_percentiles_by_nearest_rank():
    assert report.percentile([5, 1, 3, 2, 4], 50) == 3
    assert report.percentile(list(range(1, 101)), 95) == 95
    assert report.percentile([], 95) is None


def test_a_stream_read_back_as_it_was_sent_passes():
    states = [state(1, traffic=["N4SIM"]), state(2, traffic=["N4SIM"])]
    checks = report.readback_checks(states, [read(1, targets=["N4SIM"]), read(2, lat=43.00005, alt_ft=3010)])
    assert [c["ok"] for c in checks] == [True, True]


def test_a_position_read_back_off_fails():
    checks = report.readback_checks([state(1)], [read(1, lat=43.01)])
    assert checks[0]["ok"] is False
    assert checks[1]["ok"] is None  # no traffic was scripted


def test_the_track_counts_only_while_the_airplane_moves():
    checks = report.readback_checks([state(1, gs_kt=0, track=10)], [read(1, gs_kt=0, track=200)])
    assert checks[0]["ok"] is True


def test_the_report_says_a_failed_check_and_an_unfinished_flight(tmp_path):
    (tmp_path / "states.jsonl").write_text("\n".join(json.dumps(s) for s in [state(1, phase="takeoff"), state(2)]))
    results = {
        "name": "KMSN to KOSH",
        "fixes": 2,
        "checks": [{"name": "nav log", "ok": True, "detail": ""}],
        "perFix": {"engine": [10, 20], "mutations": [100, 300], "byRule": {"in_flight": 4}},
        "nextNames": ["WIGIH"],
    }
    (tmp_path / "results.json").write_text(json.dumps(results))
    assert report.write(tmp_path) is False
    text = (tmp_path / "report.md").read_text()
    assert "the simulator flew the script to its end | FAIL" in text
    assert "| in_flight | 4 | 2.00 |" in text
    assert "takeoff, enroute" in text


def test_a_finished_flight_with_every_check_passed_passes(tmp_path):
    (tmp_path / "states.jsonl").write_text(json.dumps(state(1, done=True)))
    (tmp_path / "results.json").write_text(json.dumps({"checks": [{"name": "a", "ok": True}]}))
    assert report.write(tmp_path) is True
