"""A turn among the machine's heavy work, as scripts/dev/one-at-a-time.sh
gives them out, for the charts job's `next` run.

On the owner's Mac every test suite, image build and browser run takes a
turn through that script -- two at once, since three swapped the 24 GB
Mac (2026-11-08) -- and the next chart cycle's render is hours of the
heaviest work there is. So it takes a turn too, through the same lock
directories, which the compose service mounts from the Mac's /tmp
(ONE_AT_A_TIME_LOCK names the first turn, as for the script).

The script knows a turn's holder by its pid on the Mac, which a container
has none of. A turn held from here says "container" where the pid goes
and is touched each minute while it is held; the script takes back one
untouched for five minutes, so a container killed mid-render frees its
turn as a shell that has gone does. It does not queue: it takes a turn
only while no one on the Mac is in line, and gives up after
TURN_WAIT_S, for the planner to start it again later -- a render days
ahead of the cycle's date can wait for a quiet hour.

Where ONE_AT_A_TIME_LOCK is unset (production, CI) there is no one to
share with, and every run has its turn.
"""

from __future__ import annotations

import contextlib
import logging
import os
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path

log = logging.getLogger(__name__)

#: How long the run waits for a turn before it gives up for now.
TURN_WAIT_S = 3 * 3600
#: How often a held turn's owner file is touched; the script takes back
#: one untouched for five minutes.
TOUCH_EVERY_S = 60
#: How often a waiting run looks again.
LOOK_EVERY_S = 30


def _slot(lock: Path, i: int) -> Path:
    """The script's turn `i`: the lock's own path for the first, `.i` after."""
    return lock if i == 1 else lock.with_name(f"{lock.name}.{i}")


def someone_in_line(lock: Path) -> bool:
    """Whether a run on the Mac is waiting in the script's line (its
    tickets; the script clears those of runners that have gone)."""
    line = lock.with_name(f"{lock.name}.line")
    try:
        return any(line.iterdir())
    except OSError:
        return False


def try_take(lock: Path, slots: int, label: str) -> Path | None:
    """One free turn, made and named, or None when every one is held."""
    for i in range(1, slots + 1):
        directory = _slot(lock, i)
        try:
            directory.mkdir()
        except FileExistsError:
            continue
        except OSError:
            return None
        (directory / "owner").write_text(f"container {label} (since {datetime.now():%H:%M})\n")
        return directory
    return None


@contextlib.contextmanager
def turn(
    label: str, lock: str | None = None, slots: int | None = None, wait_s: float = TURN_WAIT_S, sleep=time.sleep, clock=time.monotonic
):
    """Yields whether a turn was had, holding it (touched each minute)
    until the block ends however it ends."""
    lock = lock if lock is not None else os.environ.get("ONE_AT_A_TIME_LOCK")
    if not lock:
        yield True
        return
    path = Path(lock)
    if not path.parent.is_dir():
        log.warning("%s is not mounted; rendering without a turn", path.parent)
        yield True
        return
    slots = slots or int(os.environ.get("ONE_AT_A_TIME_SLOTS", "2"))
    deadline = clock() + wait_s
    held = None
    said = False
    while held is None:
        if not someone_in_line(path):
            held = try_take(path, slots, label)
        if held is not None:
            break
        if clock() >= deadline:
            log.info("no turn among the machine's heavy work after %.0f s; leaving it for later", wait_s)
            yield False
            return
        if not said:
            log.info("waiting for a turn among the machine's heavy work (%s)", path)
            said = True
        sleep(LOOK_EVERY_S)
    log.info("took the turn %s", held)
    stop = threading.Event()

    def touch() -> None:
        while not stop.wait(TOUCH_EVERY_S):
            with contextlib.suppress(OSError):
                os.utime(held / "owner")

    toucher = threading.Thread(target=touch, name="turn-touch", daemon=True)
    toucher.start()
    try:
        yield True
    finally:
        stop.set()
        shutil.rmtree(held, ignore_errors=True)
        log.info("gave the turn back")
