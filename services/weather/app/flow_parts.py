"""The flow layer's hourly-cycle parts (app.flow): AWC's GFA wind and
cloud (app.flow_awc), AWC's icing and turbulence (app.flow_dafs), and the
GFS's temperatures aloft and world wind (app.flow_aloft); each fetched
again only when its source has a newer run, each source backed off after
a failure, and the part held served meanwhile.

Cadences (each source's own, read 2026-11-12): the GFA, the IFI and the
GTG a cycle every hour, about 20 to 55 minutes after it; the GFS every
six hours, about four hours after. A frame's GFA, IFI or GTG part is
fetched again once a cycle REFRESH_H newer has it, so each hour's fetch
downloads about a third of the timeline's; a GFS part when a newer run is
posted.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta

import numpy as np
from wingtip import weather_store

from . import flow_aloft, flow_awc, flow_dafs, flow_grid, flow_nomads, flow_store

log = logging.getLogger(__name__)

#: Hours a newer AWC, IFI or GTG cycle must be past a frame's held one for
#: the frame's part to be fetched again.
REFRESH_H = 3
#: A source that failed is not asked again for BACKOFF_S, doubling with
#: each failure in a row to BACKOFF_MOST_S.
BACKOFF_S = 300
BACKOFF_MOST_S = 3600
_failed: dict[str, tuple[int, float]] = {}


def backed_off(source: str, now: float | None = None) -> bool:
    """Whether `source` failed lately and waits out its backoff."""
    count, until = _failed.get(source, (0, 0.0))
    return count > 0 and (time.time() if now is None else now) < until


def _note(source: str, ok: bool) -> None:
    if ok:
        _failed.pop(source, None)
        return
    count = _failed.get(source, (0, 0.0))[0] + 1
    _failed[source] = (count, time.time() + min(BACKOFF_S * 2 ** (count - 1), BACKOFF_MOST_S))


def guarded(source: str, make, held: dict | None) -> dict | None:
    """A part made by `make`, or the part held where its source is backed
    off or fails now (and is then backed off)."""
    if backed_off(source):
        return held
    try:
        made = make()
    except (flow_awc.AwcUnavailable, flow_dafs.DafsUnavailable, flow_nomads.NomadsUnavailable, ValueError, RuntimeError) as err:
        log.warning("the flow layer's %s could not be had: %s", source, err)
        _note(source, False)
        return held
    _note(source, True)
    return made


def cycle_of(key: dict | None) -> datetime | None:
    if not key or not key.get("cycle"):
        return None
    return datetime.fromisoformat(key["cycle"].replace("Z", "+00:00"))


def _keeps(held: dict | None, newest: datetime, numbers: bool = False) -> bool:
    """Whether a held hourly-cycle part stays: stored whole (with its
    numbers, where it has them to give), and each of its cycles less than
    REFRESH_H behind the newest now."""
    if not held or not flow_store.stored(held) or (numbers and not held.get("numbers")):
        return False
    keys = held.get("key") or {}
    had = [cycle_of(keys)] if "cycle" in keys else [cycle_of(k) for k in keys.values()]
    if not had or any(c is None for c in had):
        return False
    return newest - min(had) < timedelta(hours=REFRESH_H)


def _stored_part(valid: datetime, key: dict, bodies: dict[str, bytes], made_by: str, numbers: dict | None = None) -> dict:
    part = {"key": key, "tag": made_by, "files": {name: flow_store.store(valid, name, made_by, body) for name, body in bodies.items()}}
    if numbers is not None:
        part["numbers"] = numbers
    return part


def awc(valid: datetime, latest: datetime | None, levels: dict, held: dict | None) -> dict | None:
    """AWC's GFA part of a frame, from the latest cycle that has it."""
    if latest is None:
        return held
    picked = flow_awc.cycle_for(valid, latest)
    if picked is None or _keeps(held, picked[0], numbers=True):
        return held

    def make():
        made = flow_awc.frame(valid, latest, levels["wind"])
        if made is None:
            return held
        key, bodies, winds = made
        tag = flow_store.tag(key["cycle"], key["forecast_hour"])
        numbers = None
        if winds["levels"]:
            numbers = flow_store.store_numbers(valid, "awc", tag, winds["levels"], {"u": winds["u"], "v": winds["v"]})
        return _stored_part(valid, key, bodies, tag, numbers)

    return guarded("awc", make, held)


def dafs(valid: datetime, now: datetime, levels: dict, held: dict | None) -> dict | None:
    """AWC's icing and turbulence part, from the newest cycle posted."""
    hour = now.replace(minute=0, second=0, microsecond=0)
    if _keeps(held, min(hour - timedelta(hours=1), valid)):
        return held

    def make():
        made = flow_dafs.frame(valid, now, [lv["id"] for lv in levels["icing"]], [lv["id"] for lv in levels["turbulence"]])
        if made is None:
            return held
        key, bodies = made
        first = next(iter(key.values()))
        return _stored_part(valid, key, bodies, flow_store.tag(first["cycle"], first["forecast_hour"]))

    return guarded("dafs", make, held)


def _held_terrain():
    try:
        held = weather_store.read_array("flow-terrain-gfs")
    except (OSError, ValueError):
        return None
    return held if held.size == flow_grid.ROWS * flow_grid.COLS else None


def _under_ground(ft: float | None, terrain, levels: dict):
    """Where a level is under the ground (an altitude MSL under the GFS's
    ground's height there): the GFS's isobaric values there are
    extrapolated, not air a flight is in. None where none is known."""
    if terrain is None or ft is None or ft >= levels["flight_levels_from_ft"]:
        return None
    return ft * flow_aloft.M_PER_FT < terrain.reshape(flow_grid.ROWS, flow_grid.COLS)


def aloft(valid: datetime, now: datetime, levels: dict, held: dict | None, fallback: bool = False) -> dict | None:
    """The GFS's temperatures at the wind's levels -- and with `fallback`
    the wind there, in AWC's place -- and its world wind, from the newest
    GFS run posted; the part held kept while its run is."""
    for run, hourly in flow_nomads.tries(valid, now)["gfs"]:
        step = flow_aloft.nearest_step(hourly)
        key = {"run": flow_nomads.iso(run), "forecast_hour": step, "fallback": fallback}
        if held and held.get("key") == key and flow_store.stored(held) and held.get("numbers"):
            return held
        if time.time() - flow_nomads.NOT_UP.get(("aloft", run, step), 0) < flow_nomads.NOT_UP_RETRY_S:
            continue

        def make(run=run, step=step, key=key):
            body = flow_aloft.column_body(flow_nomads.grouped, run, step, levels["temperature_hpa"], wind=fallback)
            if body is None:
                flow_nomads.NOT_UP[("aloft", run, step)] = time.time()
                return None
            half = flow_aloft.at_levels_half(body, levels["wind"], levels["flight_levels_from_ft"])
            terrain = _held_terrain()
            bodies, numbers, kept = {}, {"temp": [], "u": [], "v": []}, []
            for level in levels["wind"]:
                level_id = level["id"]
                if f"temp-{level_id}" not in half:
                    continue
                below = _under_ground(level.get("ft"), terrain, levels)
                hide = lambda a, below=below: a if below is None else np.where(below, np.nan, a)  # noqa: E731
                # The half-degree grid's points are the output's even rows and columns.
                hide_half = lambda a, below=below: a if below is None else np.where(below[::2, ::2], np.nan, a)  # noqa: E731
                kept.append({"id": level_id, "ft": level["ft"]})
                for field in numbers:
                    numbers[field].append(hide_half(half.get(f"{field}-{level_id}", np.full_like(half[f"temp-{level_id}"], np.nan))))
                bodies[f"temp-{level_id}"] = flow_grid.png_values("temp", hide(flow_grid.upsample(half[f"temp-{level_id}"])))
                if fallback and f"u-{level_id}" in half and f"v-{level_id}" in half:
                    u, v = (hide(flow_grid.upsample(half[f"{c}-{level_id}"])) for c in ("u", "v"))
                    bodies[f"wind-{level_id}"] = flow_grid.png_wind(u, v)
            world = flow_aloft.world_body(flow_nomads.grouped, run, step)
            if world is not None:
                bodies["world"] = flow_grid.png_wind(*flow_aloft.world_wind(world))
            tag = flow_store.tag(key["run"], step)
            if not fallback:
                numbers = {"temp": numbers["temp"]}
            stored = flow_store.store_numbers(valid, "aloft", tag, kept, numbers) if kept else None
            return _stored_part(valid, key, bodies, tag, stored)

        made = guarded("gfs-aloft", make, None)
        if made is not None:
            return made
    return held
