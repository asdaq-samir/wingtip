"""The Aviation Weather Center's icing and turbulence for the map's flow
layer: the grids its GFA Icing and Turbulence maps draw over the lower 48
(aviationweather.gov/gfa/help, "Icing", "Turbulence", read 2026-11-12),
from the NWS's Diagnostic Aviation Forecast System on NOMADS, where AWC's
own site publishes no grid of them (its Data API has none).

- In-Flight Icing (IFI, the FAA and NCAR's Forecast Icing Product run
  operationally), dafs.tHHz.ifi.3km.conus.fFFF.grib2: the icing severity
  (GRIB2 discipline 0, category 19, parameter 37) every 500 ft MSL from
  500 to 30,000 ft, a category, 0 none to 4 heavy (the engine's
  icing_severity). About 100 KB a level.
- Graphical Turbulence Guidance (GTG), dafs.tHHz.gtg.3km.conus.fFFF.grib2:
  EDP, the eddy dissipation rate, (m^2/s^3)^1/3, every 1,000 ft MSL to
  FL500, and MXEDPRM, its most at any level. About 1.2 MB a level, which
  is why the map has few of its levels (the engine's flow_levels).

Both on the HRRR's 3 km Lambert grid over the lower 48, a cycle every
hour, forecast hours 0 to 18 (the GFA's turbulence "only ... out to
forecast hour 16" since March 2026, AWC says, the last hours repeated).
Each file's .idx lists its records' byte offsets, so only the levels the
map draws are downloaded (HTTP Range), not the 31 MB and 150 MB files.

Each cell of the output grid keeps the worst of the 3 km points in it
(flow_grid.WORST): icing or turbulence somewhere in a 25 km cell is
shown, not averaged away. The levels' heights are MSL (the files' own
"m above mean sea level"), as AWC's maps give them.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta

import gribberish
import numpy as np
import requests
from wingtip.config import REQUEST_HEADERS as HEADERS
from wingtip.units import M_PER_FT

from . import flow_grid

log = logging.getLogger(__name__)

BASE = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/dafs/prod"
#: The record each product's level is read from, as the .idx names it.
ICING_VAR = "var discipline=0 master_table=2 parmcat=19 parm=37"
TURBULENCE_VAR = "EDPARM"
TURBULENCE_MAX = ("MXEDPRM", "entire atmosphere")
LAST_STEP = 18
CYCLES_TRIED = 3
#: (product, cycle, step) -> when its .idx was last missing: not asked
#: again for NOT_UP_RETRY_S.
_NOT_UP: dict = {}
NOT_UP_RETRY_S = 300


class DafsUnavailable(RuntimeError):
    """NOMADS did not answer as it does."""


def _url(product: str, cycle: datetime, step: int) -> str:
    return f"{BASE}/dafs.{cycle:%Y%m%d}/dafs.t{cycle:%H}z.{product}.3km.conus.f{step:03d}.grib2"


def _index(product: str, cycle: datetime, step: int) -> list[tuple[int, int | None, str, str]] | None:
    """A file's records, (start, end or None for the last, variable,
    level); None where it is not posted yet."""
    key = (product, cycle, step)
    if time.time() - _NOT_UP.get(key, 0) < NOT_UP_RETRY_S:
        return None
    try:
        resp = requests.get(_url(product, cycle, step) + ".idx", headers=HEADERS, timeout=30)
    except requests.RequestException as err:
        raise DafsUnavailable(f"NOMADS did not answer: {err}") from err
    if resp.status_code == 404:
        _NOT_UP[key] = time.time()
        return None
    if not resp.ok:
        raise DafsUnavailable(f"NOMADS answered {resp.status_code}")
    return parse_index(resp.text)


def parse_index(text: str) -> list[tuple[int, int | None, str, str]]:
    """An .idx's lines ("n:offset:d=...:VAR:LEVEL:FCST:") as records."""
    rows = [line.split(":") for line in text.splitlines() if line.count(":") >= 5]
    out = []
    for i, row in enumerate(rows):
        start = int(row[1])
        end = int(rows[i + 1][1]) - 1 if i + 1 < len(rows) else None
        out.append((start, end, row[3], row[4]))
    return out


def find(records, variable: str, level_ft: float | None) -> tuple[int, int | None] | None:
    """The byte range of `variable` at `level_ft` MSL (its metres to
    within one, as the files write 1828.8 and 1828 for 6,000 ft), or for
    TURBULENCE_MAX its one record; None where the file has none."""
    for start, end, var, level in records:
        if var != variable:
            continue
        if level_ft is None:
            if level == TURBULENCE_MAX[1]:
                return start, end
            continue
        head = level.split(" ")[0]
        try:
            metres = float(head)
        except ValueError:
            continue
        if level.endswith("above mean sea level") and abs(metres - level_ft * M_PER_FT) < 1.0:
            return start, end
    return None


def _range(url: str, span: tuple[int, int | None]) -> bytes:
    start, end = span
    try:
        resp = requests.get(url, headers={**HEADERS, "Range": f"bytes={start}-{'' if end is None else end}"}, timeout=60)
    except requests.RequestException as err:
        raise DafsUnavailable(f"NOMADS did not answer: {err}") from err
    if resp.status_code not in (200, 206) or not resp.content.startswith(b"GRIB"):
        raise DafsUnavailable(f"NOMADS answered {resp.status_code} for a record")
    return resp.content


def _pick(product: str, valid: datetime, now: datetime):
    """The newest cycle with this hour's file posted: (cycle, step, its
    records), or None."""
    hour = now.replace(minute=0, second=0, microsecond=0)
    for back in range(CYCLES_TRIED + 1):
        cycle = min(hour - timedelta(hours=back), valid)
        step = int((valid - cycle).total_seconds() // 3600)
        if not 0 <= step <= LAST_STEP:
            continue
        records = _index(product, cycle, step)
        if records:
            return cycle, step, records
    return None


def _read(bodies: dict[str, bytes]) -> dict[str, np.ndarray]:
    """Each record's values on the output grid, the worst in each cell;
    the records share one grid, so its points are found once."""
    values, where = {}, None
    for name, body in bodies.items():
        message = gribberish.parse_grib_message(body, 0)
        values[name] = np.asarray(message.data(), dtype=np.float32).ravel()
        if where is None:
            where = flow_grid._points(message.metadata)
    return flow_grid.on_grid(values, where, hrrr=True) if where is not None else {}


def frame(valid: datetime, now: datetime, icing_levels: list[str], turbulence_levels: list[str]) -> tuple[dict, dict[str, bytes]] | None:
    """One hour's icing and turbulence: its key ({"icing": {"cycle",
    "forecast_hour"}, "turbulence": ...}) and its PNGs by file name
    ("icing-060", "turb-120", "turb-max"); None where neither is posted."""
    key: dict = {}
    files: dict[str, bytes] = {}
    for product, field, variable, levels in (("ifi", "icing", ICING_VAR, icing_levels), ("gtg", "turb", TURBULENCE_VAR, turbulence_levels)):
        picked = _pick(product, valid, now)
        if picked is None:
            continue
        cycle, step, records = picked
        url = _url(product, cycle, step)
        bodies = {}
        for level in levels:
            if level == "max":
                span = find(records, TURBULENCE_MAX[0], None)
            else:
                span = find(records, variable, float(level) * 100.0)
            if span is not None:
                bodies[f"{field}-{level}"] = _range(url, span)
        for name, grid in _read(bodies).items():
            files[name] = flow_grid.png_values(field, grid)
        if bodies:
            key["icing" if field == "icing" else "turbulence"] = {"cycle": f"{cycle:%Y-%m-%dT%H:%M:%SZ}", "forecast_hour": step}
    return (key, files) if files else None
