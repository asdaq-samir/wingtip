"""A failed corridor read is logged with its traceback (app.chart_reader,
the 2026-11-14 audit's CODE-29), where app.detection, which is not
edited, keeps only its "Type: message" for the pages that follow it."""

import logging

from wingtip import charts, chartvision

from app import chart_reader, detection

C81, KDLH = (42.3172, -88.0905), (46.8421, -92.1936)


def test_a_failed_read_is_logged_with_its_traceback(tmp_path, monkeypatch, caplog):
    monkeypatch.setattr(detection, "CHART_TILE_CACHE_DIR", tmp_path)
    monkeypatch.setattr(charts, "serving_cycle", lambda: "2026-09-03")
    monkeypatch.setattr(charts, "tiles_revision", lambda cycle: 0)

    def broken(start, end, half_width_nm):
        yield from ()
        raise ValueError("no tiles")

    monkeypatch.setattr(chartvision, "iter_landmarks_along_route", chart_reader._logged(broken))
    detection._DETECT_JOBS.clear()
    with caplog.at_level(logging.ERROR, logger="app.chart_reader"):
        job = detection.detect_job(("C81-KDLH", 4.0), C81, KDLH, 4.0)
        with job["cond"]:
            job["cond"].wait_for(lambda: job["done"], timeout=10)
    assert job["error"] == "ValueError: no tiles"
    (record,) = [r for r in caplog.records if r.name == "app.chart_reader"]
    assert record.exc_info and record.exc_info[0] is ValueError


def test_the_reader_is_wrapped_once():
    assert chartvision.iter_landmarks_along_route.logs_failures
