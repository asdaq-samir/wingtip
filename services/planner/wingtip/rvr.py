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
RVR_FRESH_S after it was heard: a reading ten minutes old is not RVR now.
What a reading means against a minimum is the engine's (rvr_check).
"""
from __future__ import annotations

import time
import xml.etree.ElementTree as ET

from . import live_reports

KIND = "rvr"
#: How long a runway's reading is given after it was heard, s.
RVR_FRESH_S = 600
#: The most an RVR system reports, ft (AIM 7-1-13).
MOST_FT = 6000


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child(element, name: str) -> str:
    for child in element.iter():
        if _local(child.tag) == name:
            return child.text or ""
    return ""


def reading_ft(text: str) -> int | None:
    """A reading in feet ("35" is 3,500); None for no reading ("00",
    "FF", blanks)."""
    text = (text or "").strip()
    if len(text) != 2 or not text.isdigit() or text == "00":
        return None
    return int(text) * 100


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
    found = []
    for data in (e for e in root.iter() if _local(e.tag) == "runwayData"):
        runway = _child(data, "numericRunwayID").strip() + _child(data, "runwaySubID").strip()
        if not runway:
            continue
        end = {"runway": runway}
        for part in ("touchdown", "midpoint", "rollout"):
            feet = reading_ft(_child(data, f"{part}VisualRange"))
            end[f"{part}_ft"] = feet
            end[f"{part}_more"] = feet == MOST_FT
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
        live_reports.put(KIND, f"{live_reports.ident(airport)}:{end['runway']}", {"airport": airport, **end},
                         place=airport, ends=now + RVR_FRESH_S, now=now)
    return len(ends)


def at_airport(airport: str, now: float | None = None) -> list[dict]:
    """An airport's runway ends' latest readings, each with when it was
    heard; none where it has no RVR or none heard in RVR_FRESH_S."""
    return live_reports.at(KIND, [airport], now=now)
