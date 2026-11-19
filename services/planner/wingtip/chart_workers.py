"""How many processes a pyramid pass renders with: as many as the memory
left holds, read from the container's cgroup or the kernel.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

from . import chart_grid


# What one render worker holds at its peak, by the largest density it
# draws: a row of tiles read from the sheet and drawn at that size, with
# the interpreter and rasterio beside it. Measured roughly, not exactly: a
# pass of the high-density tiles with 3 workers was killed for memory in a
# 12 GB Docker VM (2026-11-08), so a @2x worker takes well over 3 GB at
# times; the 1x passes ran four workers in 8 GB for weeks. Plus what the
# parent process keeps (the sheets' list, the pool).
WORKER_MEMORY = {1: int(1.5 * 2**30), 2: int(3.5 * 2**30)}
PARENT_MEMORY = 1 * 2**30


def available_memory(root: Path = Path("/")) -> int | None:
    """The bytes this process may still use: the least of its cgroup's
    room (a container's limit less what it holds, cgroup v2 or v1) and the
    kernel's MemAvailable, or the machine's memory where neither can be
    read (macOS). None when nothing says."""
    found = []

    def number(path: Path) -> int | None:
        try:
            text = path.read_text().strip()
        except OSError:
            return None
        return int(text) if text.isdigit() else None  # "max": no limit

    for limit, usage in (
        ("sys/fs/cgroup/memory.max", "sys/fs/cgroup/memory.current"),
        ("sys/fs/cgroup/memory/memory.limit_in_bytes", "sys/fs/cgroup/memory/memory.usage_in_bytes"),
    ):
        cap = number(root / limit)
        # v1 says "no limit" with a number near 2**63.
        if cap is not None and cap < 2**60:
            found.append(cap - (number(root / usage) or 0))
            break
    try:
        meminfo = (root / "proc/meminfo").read_text()
    except OSError:
        meminfo = ""
    m = re.search(r"^MemAvailable:\s+(\d+) kB", meminfo, re.M)
    if m:
        found.append(int(m.group(1)) * 1024)
    if not found and root == Path("/"):
        try:
            found.append(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES"))
        except (ValueError, OSError, AttributeError):
            pass
    return max(min(found), 0) if found else None


def pyramid_workers(scales: tuple, available: int | None, cpus: int | None) -> int:
    """How many processes a pyramid pass renders with when --workers is not
    given: as many as the memory left holds at WORKER_MEMORY for the
    largest density drawn, after the parent's share, and no more than
    there are CPUs; at least one, which the parent's own memory bounds
    anyway. Four where the memory cannot be read, the old default."""
    cpus = max(cpus or 1, 1)
    if available is None:
        return min(4, cpus)
    each = WORKER_MEMORY[max(scales or chart_grid.TILE_SCALES)]
    return max(1, min(cpus, (available - PARENT_MEMORY) // each))
