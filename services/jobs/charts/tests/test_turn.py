"""charts.turn: the next cycle's render takes a turn through
scripts/dev/one-at-a-time.sh's lock directories, says "container" where
the script writes a pid, gives it back however the block ends, waits
behind a run in the script's line, and gives up after its wait; and the
`next` command runs wingtip.chart_next under the refresh lock."""
import subprocess
from pathlib import Path

import pytest

from charts import cli, next_cycle, turn
from wingtip import chart_next, charts

SCRIPT = Path(__file__).resolve().parents[4] / "scripts" / "dev" / "one-at-a-time.sh"


def test_no_lock_named_is_a_turn_always():
    with turn.turn("x", lock="") as got:
        assert got


def test_a_turn_is_taken_named_and_given_back(tmp_path):
    lock = tmp_path / "heavy.lock"
    with turn.turn("charts job", lock=str(lock), slots=2) as got:
        assert got
        assert (lock / "owner").read_text().startswith("container charts job (since ")
    assert not lock.exists()


def test_the_second_turn_when_the_first_is_held(tmp_path):
    lock = tmp_path / "heavy.lock"
    lock.mkdir()
    (lock / "owner").write_text("123 a suite (since 10:00)\n")
    with turn.turn("charts job", lock=str(lock), slots=2) as got:
        assert got and (tmp_path / "heavy.lock.2" / "owner").exists()
    assert lock.exists() and not (tmp_path / "heavy.lock.2").exists()


def test_it_gives_up_when_every_turn_stays_held(tmp_path):
    lock = tmp_path / "heavy.lock"
    lock.mkdir()
    (tmp_path / "heavy.lock.2").mkdir()
    ticks = iter(range(0, 10_000, 1000))
    with turn.turn("x", lock=str(lock), slots=2, wait_s=2500, sleep=lambda s: None, clock=lambda: next(ticks)) as got:
        assert not got


def test_it_waits_behind_someone_in_the_scripts_line(tmp_path):
    lock = tmp_path / "heavy.lock"
    line = tmp_path / "heavy.lock.line"
    line.mkdir()
    (line / "1762600000123.4567").write_text("")
    slept = []

    def sleep(seconds):
        slept.append(seconds)
        for ticket in line.iterdir():
            ticket.unlink()

    with turn.turn("x", lock=str(lock), slots=2, sleep=sleep) as got:
        assert got and slept == [turn.LOOK_EVERY_S]


def test_the_turn_is_given_back_on_an_error(tmp_path):
    lock = tmp_path / "heavy.lock"
    with pytest.raises(RuntimeError):
        with turn.turn("x", lock=str(lock), slots=1):
            raise RuntimeError("killed")
    assert not lock.exists()


@pytest.mark.skipif(not SCRIPT.exists(), reason="the script is outside this image")
def test_the_script_keeps_a_touched_container_turn_and_takes_back_a_stale_one(tmp_path):
    """The script's own reclaim, run for real: a container's turn touched
    within five minutes holds; one older is taken back."""
    lock = tmp_path / "heavy.lock"
    lock.mkdir()
    (lock / "owner").write_text("container charts job (since 01:00)\n")
    env = {"ONE_AT_A_TIME_LOCK": str(lock), "ONE_AT_A_TIME_SLOTS": "1", "ONE_AT_A_TIME_WAIT": "0",
           "ONE_AT_A_TIME_FREE_MIN": "0", "ONE_AT_A_TIME_SWAP_MAX_MB": "0", "PATH": "/usr/bin:/bin"}
    held = subprocess.run(["bash", str(SCRIPT), "a suite", "true"], env=env, capture_output=True, text=True)
    assert held.returncode == 75 and lock.exists()
    subprocess.run(["touch", "-t", "202001010000", str(lock / "owner")], check=True)
    taken = subprocess.run(["bash", str(SCRIPT), "a suite", "true"], env=env, capture_output=True, text=True)
    assert taken.returncode == 0, taken.stderr
    assert "untouched for five minutes" in taken.stderr


def test_next_runs_the_staging_under_the_refresh_lock(tmp_path, monkeypatch):
    monkeypatch.setattr(charts, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    seen = []

    def run(workers, lead_days, turn):
        seen.append((workers, lead_days, charts.refresh_running()))
        return chart_next.STAGED

    monkeypatch.setattr(next_cycle, "run", run)
    assert cli.main(["next", "--lead-days", "9"]) == 0
    assert seen == [(None, 9, True)]
    monkeypatch.setattr(next_cycle, "run", lambda **kw: chart_next.FAILED)
    assert cli.main(["next"]) == 1
