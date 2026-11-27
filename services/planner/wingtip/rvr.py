"""Runway visual range, runway by runway, as the airport's RVR system
reports it now: STDDS's Airport Data (APDS) RVRDataUpdateMessage
(topic "APDS/all/false/RR/<airport>/<TRACON>"), 130 airports heard in 100
s of the owner's queue on 2026-11-09.

Each runway end ("13R": numericRunwayID and runwaySubID) has a touchdown,
midpoint and rollout reading, each two characters in hundreds of feet
("60" is 6,000 ft, "05" is 500) with a trend, and the edge and
centerline light settings the readings were computed for (AIM 7-1-13:
RVR "updated approximately once every minute", displayed "in 500 foot
increments from 3,000 feet to a maximum value of 6,000 feet", lower in
100 and 200 foot steps). A reading of 6,000 is the system's most: the
visual range is that or more ("P6000"). "00", "FF" and blanks are no
reading: the feed sent "00" on every reading of runways whose airport's
other runways read 6,000 (KDFW 17R/35L, KMIA 12/30) and "FF" on single
sensors (KOMA), which a visual range of nothing would not be; so they
are kept as not reported, never as a value, and a pilot then takes the
visibility (14 CFR 91.175(h)(1)).

Kept in wingtip.live_reports (kind "rvr"), a report a runway end, until
the engine's rvr_ends (ten minutes after it was heard, AIM 7-1-13's
minute updates): a reading that old is not RVR now.
How a reading is read and whether it is the system's most is the
engine's (rvr_readings), and what a reading means against a minimum is
the engine's too (rvr_check).
"""

from __future__ import annotations

import time
import xml.etree.ElementTree as ET

from . import live_reports
from .engine import ask as engine

KIND = "rvr"
#: The parts of a runway each reading is of, as the message names them.
PARTS = ("touchdown", "midpoint", "rollout")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child(element, name: str) -> str:
    for child in element.iter():
        if _local(child.tag) == name:
            return child.text or ""
    return ""


def readings(texts: list[str]) -> list[dict]:
    """Readings as sent, each {"ft", "more"} (the engine's rvr_readings):
    "35" is 3,500 ft, "00", "FF" and blanks None, and `more` where it is
    the system's most (6,000 ft or more, AIM 7-1-13)."""
    return engine("rvr_readings", readings=texts)["readings"] if texts else []


def runways(xml: str) -> tuple[str, list[dict]]:
    """One message's airport and its runway ends' readings, each
    {"runway", "touchdown_ft", "midpoint_ft", "rollout_ft", ...}: a reading
    None where it is not reported, and `*_more` where it is the system's
    most (6,000 ft or more)."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return "", []
    airport = _child(root, "airport").strip().upper()
    ends = []
    for data in (e for e in root.iter() if _local(e.tag) == "runwayData"):
        runway = _child(data, "numericRunwayID").strip() + _child(data, "runwaySubID").strip()
        if runway:
            ends.append((runway, data))
    # Every end's readings read at once, three an end.
    read = iter(readings([_child(data, f"{part}VisualRange") for _, data in ends for part in PARTS]))
    found = []
    for runway, data in ends:
        end = {"runway": runway}
        for part in PARTS:
            reading = next(read)
            end[f"{part}_ft"] = reading["ft"]
            end[f"{part}_more"] = reading["more"]
            end[f"{part}_trend"] = _child(data, f"{part}Trend").strip() or None
        end["edge_lights"] = _child(data, "runwayEdgeLightSetting").strip() or None
        found.append(end)
    return airport, found


def heard(xml: str | bytes, now: float | None = None) -> int:
    """One RVR message kept, a report a runway end. ingest's handler."""
    if isinstance(xml, (bytes, bytearray)):
        xml = xml.decode("utf-8", "replace")
    airport, ends = runways(xml)
    if not airport:
        return 0
    now = time.time() if now is None else now
    for end in ends:
        live_reports.put(
            KIND,
            f"{live_reports.ident(airport)}:{end['runway']}",
            {"airport": airport, **end},
            place=airport,
            ends=engine("rvr_ends", heard=now)["ends"],
            now=now,
        )
    return len(ends)


def at_airport(airport: str, now: float | None = None) -> list[dict]:
    """An airport's runway ends' latest readings, each with when it was
    heard; none where it has no RVR or none heard within the engine's rvr_ends."""
    return live_reports.at(KIND, [airport], now=now)
