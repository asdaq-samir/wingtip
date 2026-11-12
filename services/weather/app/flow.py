"""The weather under the map's flow layer (the owner, 2026-11-11: "Can
we overlay weather and wind like this?", Windy's and Apple Weather's wind
map), from the Aviation Weather Center wherever it publishes the field
(the owner, 2026-11-12), for a timeline of hours -- the last hour, now,
and every second hour on to twelve ahead -- each hour a small PNG per
field and level in the weather store and one record ("flow") listing
them, which the planner serves (wingtip.weather_flow).

Each frame is made of parts, each its source's, fetched again only when
its source has something newer:

- "awc" (app.flow_awc): AWC's GFA wind at the map's levels and its gusts,
  its cloud cover and cloud tops; about 1.4 MB an hour.
- "dafs" (app.flow_dafs): AWC's icing (IFI) and turbulence (GTG) by
  level over the lower 48, from NOMADS; about 5.6 MB an hour, the
  turbulence nearly all of it.
- "nomads" (app.flow_nomads): what AWC publishes no grid of -- precipitation,
  ceiling, temperature, visibility, CAPE and the freezing level -- from
  NOAA's HRRR where it covers and the GFS beyond it, NOMADS' grib filter
  (flow_grid.FILTER_GROUPS): the GFS 0.25 degree (filter_gfs_0p25.pl,
  gfs.tHHz.pgrb2.0p25.fFFF; 00, 06, 12, 18Z, hourly to 120 h), boxed,
  about 1.9 MB an hour; the HRRR CONUS (filter_hrrr_2d.pl,
  hrrr.tHHz.wrfsfcfFF.grib2, hourly runs to 18 h), its whole grid as the
  filter cannot box a Lambert grid, about 4.6 MB an hour, only for the
  hours up to WEATHER_FLOW_HRRR_AHEAD_H ahead (now and the last hour by
  default). (Before AWC's wind and cloud, 2.6 and 10.8 MB; measured
  2026-11-12.)
- "aloft" (app.flow_aloft): the GFS's temperature at the wind's levels
  (about 2 MB) and its world wind (0.16 MB).

When AWC's GFA part of a frame is older than AWC_MARGIN (its hourly
cadence and two hours more), the frame falls back to NOMADS for what it
also has -- the surface wind, gusts and cloud (the HRRR and GFS) and the
wind at the levels (the GFS) -- and says which source each picture is
from (the frame's "sources"), so the legend names it. AWC's cloud tops,
icing and turbulence have no NOMADS twin: the last good copy is served,
and the legend shows its time in the caution colour once past its own
margin (wingtip.weather_flow). A source that fails is backed off and its
part held (app.flow_parts), so the timeline is never emptied while any
good copy is held.

The ground's height under each model's points, which the ceiling is
measured above, is the same every hour: fetched once a model (0.3 MB the
GFS's, 2.2 MB the HRRR's) and kept in the store (_terrain).

AWC's GFA and the IFI and GTG run a cycle every hour: a frame's part from
them is kept until a cycle REFRESH_H newer has it, so an hour's fetch
downloads about a third of the timeline's. The GFS's and HRRR's parts are
kept while their runs are the newest (the timeline's forecast hours fall
on even hours, FRAMES, so the next hour's timeline shares most of them).

The record is served while its newest frame is within an hour of now:
the feed's health, as GLMP's is, not an aviation rule.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

from wingtip import weather_store
from wingtip.engine import ask

from . import flow_aloft, flow_awc, flow_grid, flow_nomads, flow_parts

log = logging.getLogger(__name__)

#: The timeline: the hour before, now, then each even UTC hour to twelve ahead.
AHEAD_H = 12
#: How old AWC's GFA part may be before NOMADS takes its place: its hourly
#: cycle and two hours more, as a late cycle is not an outage.
AWC_MARGIN = timedelta(hours=3)


class FlowUnavailable(RuntimeError):
    """No source gave any of the timeline."""


def frame_times(now: datetime) -> list[datetime]:
    """The timeline's hours, oldest first: the last hour, the current one,
    and every even UTC hour after it to AHEAD_H, which the next hour's
    timeline shares."""
    hour = now.replace(minute=0, second=0, microsecond=0)
    ahead = [hour + timedelta(hours=h) for h in range(1, AHEAD_H + 1) if (hour.hour + h) % 2 == 0]
    return [hour - timedelta(hours=1), hour, *ahead]


def awc_fresh(part: dict | None, now: datetime) -> bool:
    """Whether a frame's AWC part is within AWC_MARGIN of now."""
    cycle = flow_parts.cycle_of((part or {}).get("key"))
    return cycle is not None and now - cycle <= AWC_MARGIN


def _frame(valid: datetime, now: datetime, held: dict | None, latest_awc: datetime | None, levels: dict) -> dict | None:
    """One hour's frame, each of its parts new where its source has a
    newer run and held otherwise; NOMADS in AWC's place where AWC's part
    is past its margin. None where it has no part at all."""
    held_parts = (held or {}).get("parts") or {}
    parts = {}
    parts["awc"] = flow_parts.awc(valid, latest_awc, levels, held_parts.get("awc"))
    fallback = not awc_fresh(parts["awc"], now)
    parts["dafs"] = flow_parts.dafs(valid, now, levels, held_parts.get("dafs"))
    parts["nomads"] = flow_parts.guarded(
        "nomads", lambda: flow_nomads.part(valid, now, held_parts.get("nomads"), fallback), held_parts.get("nomads")
    )
    parts["aloft"] = flow_parts.aloft(valid, now, levels, held_parts.get("aloft"), fallback)
    parts = {k: v for k, v in parts.items() if v}
    if not parts:
        return None
    # Later parts' pictures over earlier ones': AWC's last while fresh,
    # first (under NOMADS' fallback) while not.
    order = ("dafs", "nomads", "aloft", "awc") if not fallback else ("awc", "dafs", "nomads", "aloft")
    files, sources = {}, {}
    for name in order:
        for field, blob in (parts.get(name) or {}).get("files", {}).items():
            files[field] = blob
            sources[field] = name
    nomads_key = (parts.get("nomads") or {}).get("key") or {}
    return {
        "valid": flow_nomads.iso(valid),
        "parts": parts,
        "key": nomads_key,
        "files": files,
        "sources": sources,
        "model": "HRRR and GFS" if nomads_key.get("hrrr") else "GFS",
    }


def fetch(now: datetime | None = None) -> None:
    """The timeline's frames fetched where new and stored, with the record
    ("flow") that lists them. Raises FlowUnavailable where not one frame
    could be had, the stored record left in place."""
    now = now or datetime.now(timezone.utc)
    held = weather_store.read("flow")
    held_frames = {f["valid"]: f for f in (held.data or {}).get("frames", [])} if held else {}
    levels = ask("flow_levels")
    latest_awc = None
    if not flow_parts.backed_off("awc"):
        latest_awc = flow_parts.guarded("awc", lambda: flow_awc.latest_cycle(now), None)
    frames = []
    for valid in frame_times(now):
        frame = _frame(valid, now, held_frames.get(flow_nomads.iso(valid)), latest_awc, levels)
        if frame is not None:
            frames.append(frame)
    if not frames:
        raise FlowUnavailable("no source had the timeline")
    names = {name for f in frames for name in f["files"].values()}
    record = {
        "frames": frames,
        "bounds": list(flow_grid.BOUNDS),
        "world_bounds": list(flow_aloft.WORLD_BOUNDS),
        "levels": {k: [lv["id"] for lv in levels[k]] for k in ("wind", "icing", "turbulence")},
        "fields": {k: {"unit": v["unit"], "unscale": list(v["unscale"]), "vector": v["vector"]} for k, v in flow_grid.FIELDS.items()},
    }
    newest = max(datetime.fromisoformat(f["valid"].replace("Z", "+00:00")) for f in frames)
    weather_store.write("flow", record, fetched_at=time.time(), until=(newest + timedelta(hours=1)).timestamp())
    weather_store.remove_blobs("flow-", names, ".png")
