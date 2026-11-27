"""The icing the planner reads along an IFR route (wingtip.icing_forecast,
the store's "icing-forecast"): the hour's analysis, the NWS's Current Icing
Product (CIP2, app.icing_cip), and the hours after it, its In-Flight Icing
forecast (IFI, the FAA and NCAR's Forecast Icing Product run
operationally; AIM 7-1-4) from the Diagnostic Aviation Forecast System on
NOMADS, each on the grid of app.icing_grid, so no pilot's Brief waits on
aviationweather.gov's cross-sections (it asked one per leg, up to thirty,
each up to 20 s, until 2026-11-27).

Each IFI forecast hour's file (dafs.tHHz.ifi.3km.conus.fFFF.grib2, about
34 MB, hours 1 to 18: the IFI has no hour 0, NCEP's DAFS product page)
holds the severity in 60 records, one after another at the end of the
file (measured 2026-11-27: 5.7 MB together, beside the probability and
the SLD potential, not read). Its .idx gives their byte offsets, so one
Range request a file takes the severity alone.

An IFI cycle comes every hour and is stored once its LAST_STEP is posted
(about an hour and twenty minutes after its hour): 15 files, about 85 MB,
an int8 array an hour (levels x rows x cols, about 4.4 MB). The CIP comes
every hour, about 25 MB of its file read. Each is fetched only when newer
than the one held, looked for every 15 minutes while a pilot is planning
and every three hours otherwise (app.settings).
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone

from wingtip import utc, weather_store
from wingtip.icing_forecast import STORE_NAME

from . import flow_dafs, icing_cip, icing_grid

log = logging.getLogger(__name__)

#: The cycle's last forecast hour stored: 15, so that a cycle up to three
#: hours old still reaches twelve hours past now, as far as the AWC's
#: sections did (icing_forecast's measure, 2026-11-08). The IFI goes to 18.
LAST_STEP = 15
#: Cycles looked back over for the newest whole one.
CYCLES_TRIED = 4
ARRAY_PREFIX = "icingf-"


class IcingUnavailable(RuntimeError):
    """NOMADS gave neither a whole IFI cycle nor a CIP hour newer than the
    copy held, and that copy may no longer be served."""


def _span(records, levels_ft: list[float]) -> tuple[int, int | None] | None:
    """The bytes from the lowest level kept to the highest, one request."""
    low = flow_dafs.find(records, flow_dafs.ICING_VAR, levels_ft[0])
    high = flow_dafs.find(records, flow_dafs.ICING_VAR, levels_ft[-1])
    return (low[0], high[1]) if low and high else None


def _newest_whole(now: datetime) -> datetime | None:
    """The newest IFI cycle whose LAST_STEP is posted."""
    hour = now.replace(minute=0, second=0, microsecond=0)
    for back in range(CYCLES_TRIED + 1):
        cycle = hour - timedelta(hours=back)
        if flow_dafs._index("ifi", cycle, LAST_STEP):
            return cycle
    return None


def _fetch_cycle(cycle: datetime, levels: list[float]) -> list[dict]:
    """Each of an IFI cycle's hours read and written as an array: [{"valid",
    "array", "source"}]."""
    hours = []
    for step in range(1, LAST_STEP + 1):
        records = flow_dafs._index("ifi", cycle, step)
        span = _span(records, levels) if records else None
        if span is None:
            raise IcingUnavailable(f"the IFI's {cycle:%H}Z hour {step} has no severity")
        try:
            grid = icing_grid.read_levels(flow_dafs._range(flow_dafs._url("ifi", cycle, step), span), levels)
        except (ValueError, RuntimeError, AttributeError) as err:
            raise IcingUnavailable(f"the IFI's {cycle:%H}Z hour {step} could not be read: {err}") from err
        name = f"{ARRAY_PREFIX}{cycle:%Y%m%d%H}-{step:02d}"
        weather_store.write_array(name, grid)
        hours.append({"valid": utc.iso(cycle + timedelta(hours=step)), "array": name, "source": "ifi"})
    return hours


def _forecast(now: datetime, held: dict, levels: list[float]) -> tuple[str | None, list[dict]]:
    """The newest whole IFI cycle's hours, fetched where newer than the one
    held, else the held ones."""
    held_hours = [h for h in held.get("hours", []) if h.get("source") == "ifi"]
    try:
        cycle = _newest_whole(now)
        if cycle is None or utc.iso(cycle) == held.get("cycle"):
            return held.get("cycle"), held_hours
        return utc.iso(cycle), _fetch_cycle(cycle, levels)
    except flow_dafs.DafsUnavailable as err:
        raise IcingUnavailable(str(err)) from err


def _analysis(now: datetime, held: dict, levels: list[float]) -> tuple[str | None, list[dict]]:
    """The newest CIP hour, fetched where newer than the one held, else the
    held one."""
    held_hours = [h for h in held.get("hours", []) if h.get("source") == "cip"]
    stamp = held.get("analysis")
    found = icing_cip.newest(now, utc.parse(stamp) if stamp else None, levels)
    if found is None:
        return stamp, held_hours
    hour, grid = found
    name = f"{ARRAY_PREFIX}cip-{hour:%Y%m%d%H}"
    weather_store.write_array(name, grid)
    return utc.iso(hour), [{"valid": utc.iso(hour), "array": name, "source": "cip"}]


def fetch_latest(now: datetime | None = None) -> bool:
    """The newest IFI cycle and CIP hour fetched and stored, each where
    newer than the one held; True if either was. One failing leaves the
    other's news stored and its own copy held. Raises IcingUnavailable
    where both fail, or nothing may be served."""
    now = now or datetime.now(timezone.utc)
    record = weather_store.read(STORE_NAME)
    held = record.data if record is not None else {}
    levels = icing_grid.levels_kept()
    failures, cycle, analysis, forecast, current = [], held.get("cycle"), held.get("analysis"), [], []
    try:
        cycle, forecast = _forecast(now, held, levels)
    except IcingUnavailable as err:
        failures.append(str(err))
        forecast = [h for h in held.get("hours", []) if h.get("source") == "ifi"]
    try:
        analysis, current = _analysis(now, held, levels)
    except icing_cip.CipUnavailable as err:
        failures.append(str(err))
        current = [h for h in held.get("hours", []) if h.get("source") == "cip"]
    for failure in failures:
        log.warning("icing: %s", failure)
    hours = sorted(current + forecast, key=lambda h: (h["valid"], h["source"]))
    changed = (cycle, analysis) != (held.get("cycle"), held.get("analysis"))
    if not changed:
        if len(failures) == 2 or not weather_store.servable(record, now.timestamp()):
            raise IcingUnavailable("; ".join(failures) or "no IFI cycle or CIP hour newer than the copy held, which is past serving")
        return False
    data = {"cycle": cycle, "analysis": analysis, "levels_ft": levels, "grid": icing_grid.grid_record(), "hours": hours}
    # Served to half an hour past its last hour, the hour a leg is read for.
    until = utc.epoch(hours[-1]["valid"]) + 1800
    weather_store.write(STORE_NAME, data, fetched_at=time.time(), until=until, meta={"cycle": cycle, "analysis": analysis})
    # The copy before stays for a planner that has it mapped; older go.
    keep = {h["array"] for h in hours} | {h["array"] for h in held.get("hours", [])}
    weather_store.remove_arrays(ARRAY_PREFIX, keep)
    return True
