"""The live feeds watched: wingtip.feed_health's lines checked each minute
on the planner's scheduler (app.main, wingtip.schedule), a feed stale for FEED_ALERT_AFTER_MIN turned
into an alert, and the alert said -- the log (a warning, and an info line
when it ends), FEED_ALERT_WEBHOOK where one is set (a JSON POST), and any
hook in HOOKS.

The mail is the gateway's (Spring holds the accounts and the mail, and
the planner has none): its UptimeWatch reads GET /api/status/feeds each
minute and mails an alert as a feed's `alerting` begins and ends. The
developer console shows each feed's line too, and the pilot's Status page
the ones a pilot reads by (app.feeds.status_rows, through /api/map/ages).
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from datetime import datetime, timezone

import requests

from wingtip import feed_health

from ..settings import get_settings

log = logging.getLogger(__name__)

#: How often the feeds are looked at, s.
CHECK_EVERY_S = 60
AFTER_MIN = get_settings().feed_alert_after_min
WEBHOOK = get_settings().feed_alert_webhook
WEATHER_URL = get_settings().weather_url

#: Called with {"event": "stale" | "back", "feed", "kind", "detail",
#: "stale_since", "at"} as an alert begins and ends: the hook point for
#: anything else in this process that tells a person. A hook that raises
#: is logged and the others still run.
HOOKS: list[Callable[[dict], None]] = []

_watch = feed_health.Watch(after_s=AFTER_MIN * 60)
_lock = threading.Lock()
_last: dict = {"at": 0.0, "lines": None}


def _iso(unix) -> str | None:
    return datetime.fromtimestamp(float(unix), tz=timezone.utc).isoformat() if unix else None


def _event(kind: str, line: dict, now: float) -> dict:
    return {
        "event": kind,
        "feed": line["name"],
        "kind": line["kind"],
        "detail": line.get("detail"),
        "stale_since": _iso(line.get("stale_since")),
        "at": _iso(now),
    }


def _post(event: dict) -> None:
    if not WEBHOOK:
        return
    try:
        requests.post(WEBHOOK, json=event, timeout=10)
    except requests.RequestException as err:
        log.warning("feed alert not posted to FEED_ALERT_WEBHOOK: %s", err)


def _say(event: dict) -> None:
    if event["event"] == "stale":
        log.warning("feed %s stale for %d min or more: %s", event["feed"], AFTER_MIN, event["detail"])
    else:
        log.info("feed %s is back: %s", event["feed"], event["detail"])
    _post(event)
    for hook in list(HOOKS):
        try:
            hook(event)
        except Exception:  # noqa: BLE001 -- one hook failing must not keep the others from hearing
            log.warning("feed alert hook %r failed", hook, exc_info=True)


def check(now: float | None = None) -> list[dict]:
    """The feeds looked at now, the watch moved on, and any alert begun
    or ended said. The lines, with "stale_since" and "alerting"."""
    now = time.time() if now is None else now
    lines = feed_health.check(WEATHER_URL, now)
    with _lock:
        seen, began, ended = _watch.see(lines, now)
        _last.update(at=now, lines=seen)
    for line in began:
        _say(_event("stale", {**line, "stale_since": _watch.since.get(f"{line['kind']}:{line['name']}")}, now))
    for line in ended:
        _say(_event("back", line, now))
    return seen


def snapshot() -> dict:
    """What the console and GET /api/status/feeds show: the last check's
    lines (a check now when there has been none for two minutes), with
    times as ISO strings."""
    with _lock:
        lines, at = _last["lines"], _last["at"]
    if lines is None or time.time() - at > 2 * CHECK_EVERY_S:
        lines, at = check(), time.time()
    return {
        "checked_at": _iso(at),
        "alert_after_min": AFTER_MIN,
        "webhook": bool(WEBHOOK),
        "feeds": [{**line, "last_at": _iso(line.get("last_at")), "stale_since": _iso(line.get("stale_since"))} for line in lines],
    }


def last_lines() -> list[dict]:
    """The last check's lines as they are, UNIX times and all, with no
    check made now: for a pilot's request, which must not wait on the
    weather service's answer. None checked yet is none."""
    with _lock:
        return list(_last["lines"] or [])


def snapshot_or_none() -> dict | None:
    """snapshot() for /api/status: None, and logged, where it fails, as the
    rest of that snapshot is still worth having."""
    try:
        return snapshot()
    except Exception:  # noqa: BLE001 -- the rest of the status is still worth having
        log.warning("live feeds not read", exc_info=True)
        return None
