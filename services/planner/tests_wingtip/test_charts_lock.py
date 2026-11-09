"""The chart refresh's lock, held across processes: a refresh reads as
running exactly while another process holds it (wingtip.charts)."""

import contextlib

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


@contextlib.contextmanager
def _held_in_another_process(tiles, seconds):
    """The lock held by a child until the block ends, then killed, reaped and its pipe closed."""
    import os
    import subprocess
    import sys

    from pathlib import Path

    env = {**os.environ, "PYTHONPATH": str(Path(charts.__file__).resolve().parents[1])}
    with subprocess.Popen([sys.executable, "-c", _HOLD, str(tiles), str(seconds)], stdout=subprocess.PIPE, text=True, env=env) as child:
        try:
            assert child.stdout.readline().strip() == "held"
            yield child
        finally:
            child.kill()


def test_a_refresh_is_running_exactly_while_another_process_holds_the_lock(tmp_path, monkeypatch):
    """It used to be a pid written into refresh.lock: the planner never
    reaped its finished child, a zombie answers kill(pid, 0), and one
    refresh read as running until the planner restarted."""
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    with _held_in_another_process(tmp_path / "tiles", 30):
        assert charts.refresh_running()
    assert not charts.refresh_running()  # ended, however it ended: the kernel let go
