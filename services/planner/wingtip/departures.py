"""Tower departure events, as the tower's Terminal Data Link System sends
them through STDDS's TDES (TowerDepartureEventMessage, topic
"TDES/all/false/DE/<airport>/<TRACON>"): a flight's ident (aircraftID,
the call sign or registration it filed under), its type, its beacon code,
its departure and destination airports, its gate, and the event's times.

What the feed was seen to send (the owner's queue, 2026-11-09 04:48-04:58Z,
three events in 100 s at night): the clearance delivery event, when the
tower's data link gave the flight its departure clearance
(clearanceDeliveryTime, eventTime the same). No takeoff time came in those
samples, so none is claimed: each time the message gives is kept by its
own element's name ("clearanceDeliveryTime" as clearance_delivery, any
other "...Time" likewise), and the app says which it shows. The
airplane's takeoff stays what its track says (wingtip.traffic.flights).

Kept in wingtip.live_reports (kind "departure"), one report a flight
(its TDES flight ID) under its ident, KEEP_S, so a followed airplane's
card can say when it was cleared, from where, to where and from which
gate.
"""

from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime

from . import live_reports

KIND = "departure"
#: How long an event is kept, s: a day and a half, a flight's day either side.
KEEP_S = 36 * 3600
#: An element's name in snake case: clearanceDeliveryTime, clearance_delivery_time.
_CAMEL = re.compile(r"(?<!^)(?=[A-Z])")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _when(text: str) -> float | None:
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def event(xml: str) -> dict | None:
    """One departure event as {"ident", "flight_id", "type", "beacon",
    "departure", "destination", "gate", "times": {name: s}}; None where it
    has no ident."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return None
    fields = {_local(e.tag): (e.text or "").strip() for e in root.iter() if (e.text or "").strip()}
    ident = fields.get("aircraftID", "").upper()
    if not ident:
        return None
    times = {}
    for name, text in fields.items():
        if name.endswith("Time") and name != "eventTime":
            at = _when(text)
            if at is not None:
                times[_CAMEL.sub("_", name[:-4]).lower()] = at
    return {
        "ident": ident,
        "flight_id": fields.get("flightID"),
        "type": fields.get("aircraftType"),
        "beacon": fields.get("beaconCode"),
        "departure": fields.get("departureAirport"),
        "destination": fields.get("destinationAirport"),
        "gate": fields.get("parkingGate"),
        "event_at": _when(fields.get("eventTime", "")),
        "times": times,
    }


def heard(xml: str | bytes, now: float | None = None) -> int:
    """One departure event kept under its ident. ingest's handler."""
    if isinstance(xml, (bytes, bytearray)):
        xml = xml.decode("utf-8", "replace")
    found = event(xml)
    if found is None:
        return 0
    now = time.time() if now is None else now
    key = f"{found['ident']}:{found['flight_id'] or found['departure']}"
    live_reports.put(KIND, key, found, place=found["ident"], ends=now + KEEP_S, now=now)
    return 1


def of(ident: str, now: float | None = None) -> list[dict]:
    """The departure events of an airplane or flight by its ident (a
    registration, "N719AL", or a call sign, "ASA316"), latest first."""
    found = live_reports.at(KIND, [ident.strip().upper()], now=now)
    return sorted(found, key=lambda e: e.get("event_at") or 0, reverse=True)
