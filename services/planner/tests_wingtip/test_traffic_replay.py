"""A past flight's points made ready by the engine's replay_track
(wingtip.traffic.replay; round 7's R7-1): a held pressure altitude and an
airborne report with no height carried at the last good one, never 0 ft;
the engine's own cases are engine/crates/route/src/motion/replay_tests.rs."""

from wingtip.traffic import replay_ready


def _at(t, alt, **more):
    return {"t": t, "lat": 46.8 + t * 1e-4, "lon": -92.2, "alt_ft": alt, "gs_kt": 100.0, "track_deg": 90.0, "vrate_fpm": None, **more}


def test_n722bds_held_pressure_altitude_carries_the_last_good_height():
    # Its pressure altitude held at 8,750 ft while its GNSS height fell
    # from 9,475 to 325 (the Studio's audit, 2026-11-27).
    climb = [_at(i, 8000 + i * 25, alt_baro_ft=8000 + i * 25) for i in range(20)]
    held = [_at(20 + k * 0.54, 9475 - k * 9150 / 18, alt_baro_ft=8750, alt_geom_ft=9475 - k * 9150 / 18) for k in range(19)]
    out = replay_ready(climb + held)
    assert out[21]["alt_held"] is True
    assert all(p["alt_ft"] is not None and p["alt_ft"] <= 8750 for p in out[21:])


def test_an_airborne_report_with_no_height_keeps_the_last_and_the_ground_keeps_none():
    out = replay_ready([_at(0, 3000.0, vrate_fpm=500.0), _at(5, None), _at(10, None, ground=True)])
    assert (out[1]["alt_ft"], out[1]["alt_held"]) == (3000.0, True)
    assert out[2]["alt_ft"] is None and out[2]["ground"] is True
    # The rate sent kept for the track log.
    assert out[0]["vrate_fpm"] == 500.0
