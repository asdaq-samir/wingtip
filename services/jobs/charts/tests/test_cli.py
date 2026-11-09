"""The charts job's commands (charts.cli): the runs that write a cycle's
tiles keep to the refresh lock (wingtip.charts.refresh_lock) another
process holds, and `run` builds the overlays before the cycle."""

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest

from charts import cli
from wingtip import charts

_HOLD = """
import sys, time
from pathlib import Path
from wingtip import charts
charts.CHART_TILE_CACHE_DIR = Path(sys.argv[1])
with charts.refresh_lock() as got:
    print("held" if got else "busy", flush=True)
    time.sleep(float(sys.argv[2]))
"""


def _hold_in_another_process(tiles, seconds):
    env = {**os.environ, "PYTHONPATH": str(Path(charts.__file__).resolve().parents[1])}
    child = subprocess.Popen([sys.executable, "-c", _HOLD, str(tiles), str(seconds)], stdout=subprocess.PIPE, text=True, env=env)
    assert child.stdout.readline().strip() == "held"
    return child


def test_a_refresh_or_pyramid_finding_the_lock_held_leaves_it_to_the_running_one(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(charts, "refresh", lambda **kw: pytest.fail("refreshed beside a running one"))
    monkeypatch.setattr(charts, "render_pyramid", lambda *a, **kw: pytest.fail("rendered beside a running one"))
    child = _hold_in_another_process(tmp_path / "tiles", 30)
    try:
        assert cli.main(["refresh", "--bucket", ""]) == 0
        assert cli.main(["pyramid", "--kind", "sec"]) == 1
    finally:
        child.kill()
        child.wait()


def test_unmask_waits_for_a_running_refresh(tmp_path, monkeypatch):
    """It re-renders tiles and bumps the revision: interleaved with a
    pyramid run, the pyramid could write the old pixels back after it."""
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    ran = []
    monkeypatch.setattr(charts, "unmask_prepared", lambda cycle, workers, again: ran.append(time.monotonic()) or {})
    child = _hold_in_another_process(tmp_path / "tiles", 1.5)
    started = time.monotonic()
    assert cli.main(["unmask", "--cycle", "09-03-2026"]) == 0
    child.wait()
    assert ran and ran[0] - started >= 1.0


def test_publish_waits_for_a_running_refresh(tmp_path, monkeypatch):
    """Beside an unmask, a publish that read the ledger first wrote it
    back after the unmask had struck its re-rendered tiles off, and they
    were never uploaded again."""
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    ran = []
    monkeypatch.setattr(charts, "publish", lambda cycle, bucket: ran.append(time.monotonic()) or 0)
    child = _hold_in_another_process(tmp_path / "tiles", 1.5)
    started = time.monotonic()
    assert cli.main(["publish", "--cycle", "09-03-2026", "--bucket", "charts-bucket"]) == 0
    child.wait()
    assert ran and ran[0] - started >= 1.0


def test_run_builds_the_overlays_then_refreshes_the_cycle(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    done = []
    monkeypatch.setattr(cli.overlays, "ensure", lambda cache_dir: done.append("overlays"))
    monkeypatch.setattr(charts, "refresh", lambda workers, publish_bucket: done.append(("refresh", workers)) or "09-03-2026")
    monkeypatch.setattr(charts, "serving_cycle", lambda: "09-03-2026")
    assert cli.main(["run", "--workers", "1", "--bucket", ""]) == 0
    assert done == ["overlays", ("refresh", 1)]


def test_run_still_refreshes_the_cycle_when_the_overlays_fail(tmp_path, monkeypatch):
    """The overlays a minute, the cycle hours: one failing is no reason to
    leave the other undone, and the run says it failed."""
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    refreshed = []

    def no_tippecanoe(cache_dir):
        raise RuntimeError("No tippecanoe on the PATH")

    monkeypatch.setattr(cli.overlays, "ensure", no_tippecanoe)
    monkeypatch.setattr(charts, "refresh", lambda workers, publish_bucket: refreshed.append(workers) or "09-03-2026")
    monkeypatch.setattr(charts, "serving_cycle", lambda: "09-03-2026")
    assert cli.main(["run", "--bucket", ""]) == 1
    assert refreshed == [2]
