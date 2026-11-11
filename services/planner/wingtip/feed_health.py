"""Whether each live feed is still coming in: the FAA's SWIM feeds, which
ingest (services/ingest) reads and beats about into the live store
(wingtip.traffic.store's `beats`), and the weather products the weather
service (services/weather) fetches into the weather store.

A feed that stops reads as nothing at all -- no traffic near the field, no
NOTAM, no wind shear alert -- which a pilot cannot tell from a quiet sky.
So each is held to what it normally does:

- STDDS (the terminal radar), TFMS (flight data) and FNS (NOTAMs) send all
  day: 2,727 radar and 1,426 status messages in ten seconds of STDDS, 528
  of TFMS in twenty (2026-11-09), NOTAMs every minute or two. Silence past
  SILENCE_S is stale, as is a dropped connection.
- ITWS (terminal weather alerts) and SFDPS (special activity airspace
  status) are quiet by nature: an alert comes with a storm, an airspace's
  status when it changes, and a calm night sends nothing for hours. Only
  a connection that is down makes them stale.
- Every feed is stale when ingest itself has not beaten for BEAT_STALE_S
  (its own health check's HEALTHY_WITHIN_S): its word of each feed is then
  as old as that.
- The weather products by the weather service's own answer (its GET /),
  which holds each to three of its idle turns and its product's validity:
  the METARs and TAFs, the AIRMETs, SIGMETs and PIREPs, the winds aloft,
  GLMP, the TFRs and the NEXRAD and GOES frames' times.
- The FAA's data sets by their cycles (wingtip.data_cycles): the charts,
  NASR, the CIFP, the DOF and the offline packs, stale once past theirs.

The planner (app.feeds.watch) reads this each minute, shows it in the
developer console, and raises an alert for a feed stale longer than
FEED_ALERT_AFTER_MIN, which the gateway mails (UptimeWatch).
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import requests

from . import weather
from .traffic import store

log = logging.getLogger(__name__)

#: The SWIM feeds ingest may read, in its order (ingest.swim.FEEDS).
SWIM_FEEDS = ("STDDS", "FNS", "TFMS", "ITWS", "SFDPS")


@dataclass(frozen=True)
class Rule:
    #: How long without a message is stale; None for a feed quiet by nature.
    silence_s: float | None
    what: str


RULES = {
    "STDDS": Rule(120, "terminal radar, RVR, D-ATIS"),
    "TFMS": Rule(300, "flight plans and flow programs"),
    # NOTAMs come every minute or two by day; at night, gaps of ten
    # minutes and more have been seen, so half an hour.
    "FNS": Rule(1800, "NOTAMs"),
    "ITWS": Rule(None, "terminal weather alerts"),
    "SFDPS": Rule(None, "special activity airspace status"),
}
#: ingest's beat older than this and every feed's state is that old
#: (ingest/settings.py HEALTHY_WITHIN_S).
BEAT_STALE_S = 60.0
#: How long the weather service's answer is waited for.
WEATHER_TIMEOUT_S = 3.0

OK, STALE, OFF = "ok", "stale", "off"


def _span(seconds: float) -> str:
    seconds = max(0, int(seconds))
    return f"{seconds} s" if seconds < 120 else f"{seconds // 60} min" if seconds < 7200 else f"{seconds // 3600} h"


def _age(now: float, at) -> str:
    return _span(now - float(at))


def swim(beats: dict, now: float) -> list[dict]:
    """Each SWIM feed's line from the live store's beats: {"name", "kind",
    "state", "last_at" (the last message, UNIX s), "detail"}."""
    ingest = beats.get("ingest")
    configured = set((ingest or {}).get("feeds") or [])
    out = []
    for name in SWIM_FEEDS:
        rule = RULES[name]
        beat = beats.get(name) or {}
        last_at = beat.get("last_at")
        line = {"name": name, "kind": "swim", "what": rule.what, "last_at": last_at, "messages": beat.get("messages")}
        if ingest is None:
            out.append({**line, "state": STALE, "detail": "ingest has written no beat: is it running?"})
            continue
        if name not in configured:
            out.append({**line, "state": OFF, "detail": "not set up (no SWIM queue in ingest's settings)"})
            continue
        beat_age = now - float(ingest.get("at") or 0)
        if beat_age > BEAT_STALE_S:
            out.append({**line, "state": STALE, "detail": f"ingest's last beat {_age(now, ingest.get('at') or 0)} ago"})
            continue
        if not beat.get("connected"):
            error = beat.get("error")
            out.append({**line, "state": STALE, "detail": f"not connected{f': {error}' if error else ''}"})
            continue
        if rule.silence_s is not None and (last_at is None or now - float(last_at) > rule.silence_s):
            said = f"no message for {_age(now, last_at)}" if last_at else "connected, no message yet"
            out.append({**line, "state": STALE, "detail": f"{said} (stale after {_span(rule.silence_s)})"})
            continue
        quiet = rule.silence_s is None
        detail = f"connected; last message {_age(now, last_at)} ago" if last_at else "connected, nothing sent yet"
        out.append({**line, "state": OK, "detail": detail + (" (quiet by nature: stale only when down)" if quiet else "")})
    return out


def weather_feeds(url: str | None, now: float, get=requests.get) -> list[dict]:
    """Each weather product's line, from the weather service's own answer
    (stale by its schedule); where it does not answer, one stale line
    saying so and each product's fetch time from the store, unjudged."""
    if url:
        try:
            resp = get(f"{url}/", timeout=WEATHER_TIMEOUT_S)
            products = resp.json().get("products") if resp.ok else None
        except (requests.RequestException, ValueError):
            products = None
        if isinstance(products, dict):
            out = []
            for name, p in products.items():
                fetched = p.get("fetched_at")
                if p.get("stale"):
                    detail = (
                        f"fetch failing: {p.get('error')}"
                        if p.get("failing")
                        else f"last fetched {_age(now, fetched)} ago"
                        if fetched
                        else "never fetched"
                    )
                else:
                    detail = f"fetched {_age(now, fetched)} ago" if fetched else "fetched"
                out.append(
                    {
                        "name": name,
                        "kind": "weather",
                        "what": "weather",
                        "last_at": fetched,
                        "state": STALE if p.get("stale") else OK,
                        "detail": detail,
                    }
                )
            return out
    out = [
        {
            "name": "weather service",
            "kind": "weather",
            "what": "weather",
            "last_at": None,
            "state": STALE,
            "detail": "not answering; its products' fetch times below are from the store, unjudged" if url else "no WEATHER_URL to ask",
        }
    ]
    for name, fetched in weather.dataset_status().items():
        out.append(
            {
                "name": name,
                "kind": "weather",
                "what": "weather",
                "last_at": fetched,
                "state": OK,
                "detail": f"fetched {_age(now, fetched)} ago" if fetched else "never fetched",
            }
        )
    return out


def cycles(entries: list[dict]) -> list[dict]:
    """Each FAA data set's line from its edition (wingtip.data_cycles, the
    engine's data_cycle): the charts on their 56-day cycle, NASR, the CIFP
    and the offline packs on the 28-day AIRAC, the DOF on its own. An
    edition past its cycle is stale: 14 CFR 91.103 asks for the current
    one, and with the refresh off nothing else fetches the next."""
    out = []
    for e in entries:
        expired = e.get("state") == "expired"
        detail = (
            f"edition {e.get('edition')} ended {e.get('expires')}, {e.get('behind')} cycle(s) behind"
            if expired
            else f"edition {e.get('edition')}, in force until {e.get('expires')}"
        )
        out.append(
            {"name": e["key"], "kind": "cycle", "what": e["name"], "last_at": None, "state": STALE if expired else OK, "detail": detail}
        )
    return out


def _held_cycles() -> list[dict]:
    """The FAA data sets' lines, from the editions on disk (never the
    network); none, and logged, where they cannot be read."""
    from . import data_cycles

    try:
        return cycles(data_cycles.held())
    except Exception:  # noqa: BLE001 -- the feeds' lines are still worth having
        log.warning("FAA data editions not read", exc_info=True)
        return []


def check(weather_url: str | None, now: float | None = None) -> list[dict]:
    """Every feed's line: SWIM first, then the weather, then the FAA's
    data cycles."""
    now = time.time() if now is None else now
    try:
        beats = store.beats()
    except Exception as err:  # noqa: BLE001 -- the store unreadable is itself the news
        log.warning("live store's beats not read", exc_info=True)
        beats = None
        lines = [
            {
                "name": name,
                "kind": "swim",
                "what": RULES[name].what,
                "last_at": None,
                "state": STALE,
                "detail": f"live store not readable: {err}",
            }
            for name in SWIM_FEEDS
        ]
    if beats is not None:
        lines = swim(beats, now)
    return lines + weather_feeds(weather_url, now) + _held_cycles()


class Watch:
    """When each feed went stale, as seen by successive checks, and which
    have been stale for `after_s` -- the alert. A feed back to ok is
    forgotten, and its alert ended; `changes` says which alerts began and
    ended at this check, once each."""

    def __init__(self, after_s: float):
        self.after_s = after_s
        self.since: dict[str, float] = {}
        self.alerting: set[str] = set()

    def see(self, lines: list[dict], now: float) -> tuple[list[dict], list[dict], list[dict]]:
        """The lines with "stale_since" and "alerting" added, and the alerts
        begun and ended now."""
        began, ended, out = [], [], []
        seen = set()
        for line in lines:
            key = f"{line['kind']}:{line['name']}"
            seen.add(key)
            if line["state"] == STALE:
                since = self.since.setdefault(key, now)
                alerting = now - since >= self.after_s
                if alerting and key not in self.alerting:
                    self.alerting.add(key)
                    began.append(line)
            else:
                since, alerting = None, False
                self.since.pop(key, None)
                if key in self.alerting:
                    self.alerting.discard(key)
                    ended.append(line)
            out.append({**line, "stale_since": since, "alerting": alerting})
        for key in set(self.since) - seen:
            self.since.pop(key, None)
            self.alerting.discard(key)
        return out, began, ended
