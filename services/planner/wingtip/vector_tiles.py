"""The map's FAA overlays as vector tiles, as the planner serves them: one
PMTiles archive a cycle of the Class B, C, D and E airspace, the
special-use areas, the airports, the navaids, the fixes and the runways,
for a MapLibre map (the web's, Android's, iOS's) to draw, read whole by
HTTP range requests (/api/overlay-tiles).

The charts job builds the archive (services/jobs/charts, its overlays
module: which FAA field each layer's features carry, their zooms and how
true the lines stay) from the cycle pack the planner writes
(wingtip.cycle_pack), into TILES_DIR with its index. This is what the
planner and the job share: where the archive lives, what it is called,
which layers it holds, and reading it back.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from . import cycle_pack

#: Where the archives live: beside the cycle packs, not committed.
TILES_DIR = cycle_pack.PACK_DIR / "tiles"
INDEX = "overlays.json"
#: What the tiles hold and how, as a number: a change to a layer's
#: attributes, zooms or tolerances (the charts job's overlays module)
#: bumps it, and the archive is built again under a new name (its address
#: is kept a cycle by every cache).
VERSION = 7

LAYERS = ("airspace", "airspace_labels", "special_use", "special_use_labels", "airports", "navaids", "fixes", "runways")


def archive_name(pack) -> str:
    """The archive's name: its cycle, VERSION and the pack's own CRC, so a
    pack rebuilt inside a cycle (a new airspace file, the special-use
    areas fetched again) gets an address no cache holds yet."""
    return f"{pack.cycle}-v{VERSION}-{pack.crc32:08x}"


def tiles_index(out_dir=None) -> dict | None:
    """The archive on disk, as its index says; None where there is none."""
    folder = Path(out_dir or TILES_DIR)
    try:
        index = json.loads((folder / INDEX).read_text())
    except (OSError, ValueError):
        return None
    return index if (folder / f"{index.get('name')}.pmtiles").is_file() else None


def tiles_path(name: str, out_dir=None) -> Path | None:
    """An archive on disk by its name (archive_name); None where there is
    none, or the name is not one."""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}-v\d+-[0-9a-f]{8}", name):
        return None
    path = Path(out_dir or TILES_DIR) / f"{name}.pmtiles"
    return path if path.is_file() else None
