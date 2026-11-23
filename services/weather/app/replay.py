"""A recorded day of weather, for the browser suite: what the service
would fetch, written once from a recording instead, every time in it moved
to now, so a spec's red never depends on the day's weather (docs/CI.md
rule 9; CI audit 2026-11-23, M2: brief-glance's private-field line and
pass-times' TFRs went red on one night's METARs and TFRs alone).

    python -m app.replay record STORE OUT   a live store's products into OUT
    WEATHER_REPLAY=OUT python -m app.main   the service, OUT's products replayed

`record` keeps each product in RECORDED whole (the planner's records as
the service wrote them, still gzipped), and GLMP's grids cut to the
suite's corridor (CORRIDOR) and gzipped, from 12 MB a grid to some tens of
kilobytes. `seed` writes each into the store with its times -- the
records' fetched_at and until, every ISO or UNIX time in them, and the
day-and-time groups of each report as sent (METAR, TAF, SIGMET, PIREP) --
moved by the whole hours from the recording to now, so the reports are
as old, and the forecasts as far ahead, as they were when recorded. The
service then fetches the rest (the radar's time, the satellite's, the
model layer) and never these.
"""

from __future__ import annotations

import calendar
import gzip
import json
import re
import shutil
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from wingtip import weather_store

#: The products a recording holds: every report, forecast and advisory a
#: plan or a brief reads, GLMP's modelled weather and the TFRs.
RECORDED = (
    "metars",
    "tafs",
    "airsigmets",
    "gairmets",
    "pireps",
    "airmets",
    "recent-winds",
    "winds-06",
    "winds-12",
    "winds-24",
    "glmp",
    "glmp-forecast",
    "spc-outlook",
    "tfrs",
)

#: The suite's corridor, degrees (south, west, north, east): Chicago to
#: Duluth and round them, as apps/web/e2e/fixtures/overlay-tiles is.
#: GLMP's grids are cut to it; a point outside is off the grid, as a
#: point past the NBM's edge is (wingtip.glmp's None).
CORRIDOR = (40.0, -97.0, 49.5, -84.0)

_ISO = re.compile(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d)(:\d\d)?(\.\d+)?(Z|\+00:00)$")
_STAMP = re.compile(r"^20\d{10}$")  # a TFR's "modified", YYYYMMDDHHMM
# Plausible UNIX times: 2017 to 2049, never a height, a distance or a count.
_EPOCH = (1.5e9, 2.5e9)


def _hour_shift(recorded_at: float, now: float) -> int:
    """Whole hours from the recording to now, in seconds: a report's
    minutes past the hour kept, as a station's schedule has them."""
    return round((now - recorded_at) / 3600) * 3600


def _day_hour(day: int, hour: int, minute: int, near: datetime) -> datetime:
    """The day-of-month and time of a report's group, as the date nearest
    `near` (a group carries no month: the recording's, or the one either
    side of it at a month's turn)."""
    tries = []
    for months in (-1, 0, 1):
        month0 = near.month - 1 + months
        year, month = near.year + month0 // 12, month0 % 12 + 1
        if day <= calendar.monthrange(year, month)[1]:
            tries.append(datetime(year, month, day, tzinfo=timezone.utc) + timedelta(hours=hour, minutes=minute))
    return min(tries, key=lambda t: abs(t - near))


def _raw(text: str, shift: timedelta, near: datetime) -> str:
    """A report as sent, its day-and-time groups moved: DDHHMMZ, a TAF's
    DDHH/DDHH and FMDDHHMM, a SIGMET's VALID DDHHMM/DDHHMM, a PIREP's /TM HHMM."""

    def moved(day: str, hour: str, minute: str = "00", width: int = 6) -> str:
        at = _day_hour(int(day), int(hour), int(minute), near) + shift
        return at.strftime("%d%H%M")[:width]

    def each(pattern: str, make) -> None:
        nonlocal text

        def one(m: re.Match) -> str:
            try:
                return make(m)
            except ValueError:  # not a time after all (a day 00, an hour 61): as sent
                return m[0]

        text = re.sub(pattern, one, text)

    each(r"\b(\d\d)(\d\d)(\d\d)/(\d\d)(\d\d)(\d\d)\b", lambda m: f"{moved(*m.group(1, 2, 3))}/{moved(*m.group(4, 5, 6))}")
    each(r"\b(\d\d)(\d\d)/(\d\d)(\d\d)\b", lambda m: f"{moved(*m.group(1, 2), width=4)}/{moved(*m.group(3, 4), width=4)}")
    each(r"\bFM(\d\d)(\d\d)(\d\d)\b", lambda m: "FM" + moved(*m.group(1, 2, 3)))
    each(r"\b(\d\d)(\d\d)(\d\d)Z\b", lambda m: moved(*m.group(1, 2, 3)) + "Z")
    each(r"/TM (\d\d)(\d\d)\b", lambda m: "/TM " + (datetime(2000, 1, 1, int(m[1]), int(m[2])) + shift).strftime("%H%M"))
    return text


def shifted(value, shift: int, near: datetime, key: str = ""):
    """`value` with every time in it moved `shift` seconds (_hour_shift)."""
    if isinstance(value, dict):
        return {k: shifted(v, shift, near, k) for k, v in value.items()}
    if isinstance(value, list):
        return [shifted(v, shift, near, key) for v in value]
    if isinstance(value, bool) or value is None:
        return value
    if isinstance(value, (int, float)):
        return value + shift if _EPOCH[0] <= value <= _EPOCH[1] else value
    if not isinstance(value, str):
        return value
    if m := _ISO.match(value):
        at = datetime.fromisoformat(m[1] + (m[2] or "") + "+00:00") + timedelta(seconds=shift)
        fraction = m[3] or ""
        return at.strftime("%Y-%m-%dT%H:%M") + (at.strftime(":%S") if m[2] else "") + fraction + m[4]
    if _STAMP.match(value):
        return (datetime.strptime(value, "%Y%m%d%H%M") + timedelta(seconds=shift)).strftime("%Y%m%d%H%M")
    if key == "raw":
        return _raw(value, timedelta(seconds=shift), near)
    return value


def _arrays(record: dict) -> list[str]:
    """The names of the grids a GLMP record points at."""
    found: list[str] = []

    def walk(node) -> None:
        if isinstance(node, dict):
            if isinstance(node.get("array"), str):
                found.append(node["array"])
            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(record.get("data"))
    return found


def _cut(grid: dict, store: Path, out: Path) -> None:
    """One GLMP grid cut to CORRIDOR, its record's x0, y0, nx and ny made
    the cut's, the values gzipped beside the recording."""
    import io

    import numpy as np
    from pyproj import Proj

    proj = Proj(grid["proj"])
    south, west, north, east = CORRIDOR
    xs, ys = zip(*(proj(lon, lat) for lat in (south, north) for lon in (west, (west + east) / 2, east)))
    x0, dx, y0, dy = (float(grid[k]) for k in ("x0", "dx", "y0", "dy"))
    i0, i1 = max(0, int((min(xs) - x0) / dx)), min(int(grid["nx"]), int((max(xs) - x0) / dx) + 2)
    j0, j1 = max(0, int((min(ys) - y0) / dy)), min(int(grid["ny"]), int((max(ys) - y0) / dy) + 2)
    values = np.load(store / f"{grid['array']}.npy", allow_pickle=False)[j0:j1, i0:i1]
    buffer = io.BytesIO()
    np.save(buffer, np.ascontiguousarray(values), allow_pickle=False)
    (out / f"{grid['array']}.npy.gz").write_bytes(gzip.compress(buffer.getvalue(), compresslevel=9))
    grid.update(x0=x0 + i0 * dx, y0=y0 + j0 * dy, nx=i1 - i0, ny=j1 - j0)


def _grids(node, store: Path, out: Path) -> None:
    if isinstance(node, dict):
        if isinstance(node.get("array"), str):
            _cut(node, store, out)
        for child in node.values():
            _grids(child, store, out)
    elif isinstance(node, list):
        for child in node:
            _grids(child, store, out)


def record(store: Path, out: Path) -> None:
    """RECORDED's products from a live store into `out`, and when."""
    out.mkdir(parents=True, exist_ok=True)
    for old in out.iterdir():
        old.unlink()
    for name in RECORDED:
        raw = json.loads(gzip.decompress((store / f"{name}.json.gz").read_bytes()))
        _grids(raw.get("data"), store, out)
        (out / f"{name}.json.gz").write_bytes(gzip.compress(json.dumps(raw, separators=(",", ":")).encode(), compresslevel=9))
    recorded_at = max(json.loads(gzip.decompress((out / f"{n}.json.gz").read_bytes()))["fetched_at"] for n in ("metars", "tafs"))
    (out / "recorded.json").write_text(json.dumps({"recorded_at": recorded_at}) + "\n")


def seed(recording: Path, now: float | None = None) -> set[str]:
    """Each recorded product written into the store, its times moved to
    now, and a try that confirms it; the names written."""
    now = time.time() if now is None else now
    recorded_at = float(json.loads((recording / "recorded.json").read_text())["recorded_at"])
    shift, near = _hour_shift(recorded_at, now), datetime.fromtimestamp(recorded_at, timezone.utc)
    store = weather_store.store_dir()
    store.mkdir(parents=True, exist_ok=True)
    written = set()
    for path in sorted(recording.glob("*.json.gz")):
        name = path.name.removesuffix(".json.gz")
        raw = json.loads(gzip.decompress(path.read_bytes()))
        for array in _arrays(raw):
            with gzip.open(recording / f"{array}.npy.gz") as source, open(store / f"{array}.npy", "wb") as target:
                shutil.copyfileobj(source, target)
        until = raw.get("until")
        data, meta = shifted(raw.get("data"), shift, near), shifted(raw.get("meta") or {}, shift, near)
        weather_store.write(name, data, float(raw["fetched_at"]) + shift, None if until is None else float(until) + shift, meta)
        weather_store.write_attempt(name, now, None)
        written.add(name)
    return written


if __name__ == "__main__":
    if sys.argv[1:2] == ["record"] and len(sys.argv) == 4:
        record(Path(sys.argv[2]), Path(sys.argv[3]))
    else:
        sys.exit(__doc__)
