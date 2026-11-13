"""Forecast icing along an IFR route (#216, item 6): each leg's vertical
cross-section of the Aviation Weather Center's icing severity, for the
hour the airplane is on that leg, handed to the engine, whose rule says
what it means for the flight (wingtip_brief::icing_forecast,
`icing_forecast_route`).

The sections are the ones the AWC's Graphical Forecasts for Aviation page
draws under its route box (AIM 7-1-4; aviationweather.gov/gfa, "Cross
section", Icing): the icing severity the AWC makes from its Current and
Forecast Icing Products (CIP, FIP), 300 columns along the path given by
39 levels up. The address is the one that page reads,
`/data/cross/section/<issued YYYYMMDD/HH>/<forecast hour>/icing/<lat,lon,...>`,
not one of the AWC's documented Data API's: a change to it reads as the
forecast unchecked, never as no icing. Its answer, measured 2026-11-08:
`{"width": 300, "data_levels": 39, "param": "icing_severity", "values",
"sfc_hgt"}`, values level-fastest, and forecast hours 0 to 12 answered
(15 and later came back empty).
"""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests

from . import outside
from .config import REQUEST_HEADERS
from .engine import ask as engine

URL = "https://aviationweather.gov/data/cross/section/{issued}/{hour:02d}/icing/{path}"

#: The section's levels, ft MSL, as the AWC's page plots them (its cross
#: section's `alts`): every 1,000 ft to 25,000 over 500 ft, then every
#: 2,000 to 50,000.
LEVELS_FT = [500, *range(1000, 25001, 1000), *range(26000, 50001, 2000)]

#: The furthest forecast hour the sections answer for (measured 2026-11-08:
#: 0 to 12, the FIP's reach). A leg flown later is unchecked.
LAST_HOUR = 12

#: How long a section is kept: the AWC issues its icing hourly, and a
#: route asked again within the quarter-hour (the Brief reopened, the
#: altitude changed back) is not fetched twice.
HELD_S = 15 * 60

#: Most legs asked at once, and the most a route asks for: a long route's
#: legs past it are unchecked rather than asking the AWC for dozens.
WORKERS = 6
MOST_LEGS = 30

TIMEOUT_S = 20

_HELD: dict = {}
_LOCK = threading.Lock()


class IcingForecastUnavailable(RuntimeError):
    """The AWC answered for none of the route's legs."""


def _issued(now: float) -> datetime:
    """The hour the AWC's latest sections are issued for: this one."""
    return datetime.fromtimestamp(now - now % 3600, timezone.utc)


def _section(a: tuple, b: tuple, hour: int, issued: datetime) -> dict | None:
    """One leg's section from (lat, lon) a to b, `hour` hours after
    `issued`; None where the AWC had none (an empty answer, a shape not
    the one measured). A failed request raises requests' error."""
    path = ",".join(f"{x:.2f}" for x in (*a, *b))
    key = (issued.timestamp(), hour, path)
    with _LOCK:
        held = _HELD.get(key)
        if held and time.time() - held[0] < HELD_S:
            return held[1]
    resp = outside.get(URL.format(issued=issued.strftime("%Y%m%d/%H"), hour=hour, path=path), headers=REQUEST_HEADERS, timeout=TIMEOUT_S)
    resp.raise_for_status()
    body = resp.json()
    values = body.get("values") if isinstance(body, dict) else None
    shaped = (
        isinstance(values, list)
        and values
        and body.get("data_levels") == len(LEVELS_FT)
        and isinstance(body.get("width"), int)
        and len(values) == body["width"] * len(LEVELS_FT)
    )
    found = {k: body[k] for k in ("width", "data_levels", "values", "sfc_hgt") if k in body} if shaped else None
    with _LOCK:
        if len(_HELD) > 2000:
            _HELD.clear()
        _HELD[key] = (time.time(), found)
    return found


def _leg_section(a: tuple, b: tuple, valid_s: float, now: float) -> tuple[dict | None, bool]:
    """A leg's section for the hour nearest `valid_s`, and whether the AWC
    could be asked: from this hour's issue, else the last hour's, which
    may not be posted yet just past the hour."""
    issued = _issued(now)
    for back in (0, 1):
        issue = datetime.fromtimestamp(issued.timestamp() - back * 3600, timezone.utc)
        hour = max(0, round((valid_s - issue.timestamp()) / 3600))
        if hour > LAST_HOUR:
            return None, True
        try:
            found = _section(a, b, hour, issue)
        except (requests.RequestException, ValueError):
            return None, False
        if found is not None:
            return found, True
    return None, True


def along(
    fixes: list[tuple[float, float]],
    altitudes_ft: list[float],
    leg_minutes: list[float],
    ground_minutes: list[float] | None,
    start: float,
    now: float | None = None,
) -> dict:
    """The engine's reading of the forecast icing on each leg, from the
    nav log's fixes (one more than its legs), each leg's altitude, its
    ETE and its minutes on the ground after it, the flight leaving at
    `start` (UNIX seconds): each leg's section for the hour of its middle.
    IcingForecastUnavailable where the AWC answered for no leg at all."""
    legs = len(altitudes_ft)
    if len(fixes) != legs + 1 or len(leg_minutes) != legs:
        raise ValueError("one more fix than legs, and a time for each leg")
    ground = ground_minutes if ground_minutes and len(ground_minutes) == legs else [0.0] * legs
    now = time.time() if now is None else now
    middles, t = [], start
    for minutes, after in zip(leg_minutes, ground):
        middles.append(t + minutes * 30)
        t += (minutes + after) * 60
    asked = range(min(legs, MOST_LEGS))
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        got = list(pool.map(lambda i: _leg_section(fixes[i], fixes[i + 1], middles[i], now), asked))
    if got and not any(reached for _, reached in got):
        raise IcingForecastUnavailable("aviationweather.gov did not answer for the forecast icing")
    sections = [s for s, _ in got] + [None] * (legs - len(got))
    answer = engine(
        "icing_forecast_route",
        levels_ft=LEVELS_FT,
        legs=[{"altitude_ft": alt, "section": sections[i], "valid_s": middles[i]} for i, alt in enumerate(altitudes_ft)],
    )
    return {**answer, "issued": _issued(now).isoformat().replace("+00:00", "Z")}
