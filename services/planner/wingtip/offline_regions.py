"""The places a pilot can keep the charts of for flying with no signal:
the FAA's sectional sheets by their coverage ("Chicago", "Twin Cities"),
the states, and a box drawn on the map. Each is a name and the boxes
(west, south, east, north, degrees) its tiles are cut by
(wingtip.offline_charts).

A sheet's box is its raster envelope as the FAA's FGDC metadata gives it
(wingtip.charts.COVERAGE), collar included, so the cut holds every tile
the sheet itself draws. A state's boxes are the bounds of the Census
Bureau's 2024 cartographic boundary file (cb_2024_us_state_20m, read
2026-11-09; offline_states.json), widened by 0.005 degrees and rounded,
with Alaska in two -- either side of the antimeridian -- as the charts'
own coverage is. The 50 states, DC and Puerto Rico.

What is kept is the chart as drawn, not a rule: no figure here is an
aviation one.
"""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from . import charts

Box = tuple[float, float, float, float]

#: A drawn box is snapped outward to this grid (degrees), so boxes a few
#: pixels apart on a phone share one cut on the planner's disk.
BOX_GRID = 0.5
#: The largest drawn box, in square degrees: about Texas (13 by 13). A
#: whole country's sectional at 2x is some 20 GB, more than a phone
#: should be asked to hold in one go; a state or a sheet at a time is
#: what ForeFlight and Garmin Pilot offer too.
BOX_MOST_DEG2 = 200.0

_STATES_FILE = Path(__file__).with_name("offline_states.json")
_BOX_ID = re.compile(r"box_(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)")


@dataclass(frozen=True)
class Region:
    id: str  # what the address takes: "Chicago", "state-WI", "box_-90_41_-87_43"
    name: str  # what the list says: "Chicago", "Wisconsin"
    group: str  # "sheet", "state" or "box"
    boxes: tuple[Box, ...]


@lru_cache(maxsize=1)
def _states() -> dict:
    return json.loads(_STATES_FILE.read_text())


def sheets() -> list[Region]:
    """Every sectional sheet, the two Caribbean VFR charts among them."""
    out = []
    for name, entry in sorted(charts.COVERAGE["sec"].items()):
        boxes = tuple(tuple(b) for b in (entry if isinstance(entry[0], tuple) else (entry,)))
        out.append(Region(name, name.replace("_", " ").replace(" VFR", ""), "sheet", boxes))
    return out


def states() -> list[Region]:
    """The states, DC and Puerto Rico, by name."""
    return sorted(
        (Region(f"state-{code}", entry["name"], "state", tuple(tuple(b) for b in entry["boxes"])) for code, entry in _states().items()),
        key=lambda r: r.name,
    )


def catalog() -> list[Region]:
    """The sheets, then the states: the list a phone picks from."""
    return [*sheets(), *states()]


def box_id(west: float, south: float, east: float, north: float) -> str:
    """A drawn box's id, snapped outward to BOX_GRID."""

    def snap(v: float, up: bool) -> float:
        f = math.ceil if up else math.floor
        return f(v / BOX_GRID) * BOX_GRID

    parts = (snap(west, False), snap(south, False), snap(east, True), snap(north, True))
    return "box_" + "_".join(f"{v:g}" for v in parts)


def _box(match: re.Match) -> Region | None:
    west, south, east, north = (float(g) for g in match.groups())
    if not (-180 <= west < east <= 180 and -85 <= south < north <= 85):
        return None
    if (east - west) * (north - south) > BOX_MOST_DEG2:
        return None
    if box_id(west, south, east, north) != match.group(0):
        return None  # only the snapped form, so one box is one cut
    name = f"{abs(south):g}°{'N' if south >= 0 else 'S'} {abs(west):g}°{'W' if west < 0 else 'E'} box"
    return Region(match.group(0), name, "box", ((west, south, east, north),))


def find(region_id: str) -> Region | None:
    """A region by its id; None where it is none of them."""
    if match := _BOX_ID.fullmatch(region_id):
        return _box(match)
    return next((r for r in catalog() if r.id == region_id), None)
