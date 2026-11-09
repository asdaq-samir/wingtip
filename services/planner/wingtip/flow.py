"""Traffic management at an airport: the ground stops and ground delay
programs the FAA's Command Center runs, and the restrictions a facility
puts on arrivals and departures, from TFMS's flow information (SWIM's
TFMData service, its FlowInformation messages, topic
"TFMSR14Flow/FlowInformation/<facility>/A/sensReason/<type>").

What the feed carries (the owner's queue, 2026-11-09 04:58Z, 20 s): 528
messages, 242 of them flow information: 218 flight lists (TMI_FLIGHT_LIST,
not read), and the rest restrictions (RSTR: "IAD arrivals, 15 miles in
trail, RWY:Construction"), general advisories (GADV: the Command Center's
advisories, "ATCSCC ADVZY 010 AUS/ZHU 11/09/2026 CDM GROUND DELAY PROGRAM
CNX") and flow constrained areas (FXA, not read).

- A general advisory whose title names a GROUND STOP, a GROUND DELAY
  PROGRAM or an AIRSPACE FLOW PROGRAM is kept as that program at its
  control element (the advisory's "CTL ELEMENT: AUS"), with its effective
  period, its delays where it gives them ("AVERAGE DELAY", "MAXIMUM
  DELAY", minutes), the condition it is for ("IMPACTING CONDITION") and
  its words as sent; one whose title says CNX cancels it. The advisory's
  fields are the Command Center's own (FAA ATCSCC advisories; JO 7210.3
  chapter 17 describes ground stops and ground delay programs).
- A restriction (miles in trail, minutes in trail, a stop) is kept at each
  airport it names until its stop time.

Kept in wingtip.live_reports (kind "flow"), one report an airport and
program or restriction, until its end. Words only: what a program means
for a flight is the engine's (the Go / No-Go's flow finding).
"""
from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime

from . import live_reports

KIND = "flow"
#: The programs a title names, the most specific first.
PROGRAMS = (
    ("GROUND DELAY PROGRAM", "ground delay program"),
    ("GROUND STOP", "ground stop"),
    ("AIRSPACE FLOW PROGRAM", "airspace flow program"),
)
#: How long a program with no end given is kept, s.
OPEN_ENDED_S = 6 * 3600
_TITLE = re.compile(r"ADVZY\s+(\d+)\s+([A-Z0-9]+)(?:/([A-Z0-9]+))?\s+(\d\d/\d\d/\d{4})\s+(.*)")
_FIELD = re.compile(r"^\s*([A-Z][A-Z /]+?):\s*(.*?)\s*$", re.M)
_MINUTES = re.compile(r"(\d+)")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _when(text: str | None) -> float | None:
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.strip().replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _find(root, name: str):
    return next((e for e in root.iter() if _local(e.tag) == name), None)


def _text(root, name: str) -> str:
    found = _find(root, name)
    return (found.text or "").strip() if found is not None else ""


def _minutes(text: str | None) -> int | None:
    found = _MINUTES.search(text or "")
    return int(found[1]) if found else None


def advisory(root) -> dict | None:
    """A general advisory that starts, changes or cancels a program, as
    {"program", "airport", "cancelled", "number", "starts", "ends",
    "average_delay_min", "maximum_delay_min", "condition", "title",
    "text"}; None for any other advisory."""
    title = " ".join(_text(root, "advisoryTitle").split())
    head = _TITLE.search(title)
    program = next((name for words, name in PROGRAMS if words in title), None)
    if head is None or program is None:
        return None
    text = _text(root, "advisoryText")
    fields = {k.strip(): v for k, v in _FIELD.findall(text)}
    period = _find(root, "effectivePeriod")
    starts = _when(_text(period, "startTime")) if period is not None else None
    ends = _when(_text(period, "endTime")) if period is not None else None
    return {
        "program": program,
        "airport": (fields.get("CTL ELEMENT") or head[2]).split()[0],
        "cancelled": bool(re.search(r"\b(CNX|CANCEL\w*)\b", head[5])),
        "number": head[1],
        "starts": starts,
        "ends": ends,
        "average_delay_min": _minutes(fields.get("AVERAGE DELAY")),
        "maximum_delay_min": _minutes(fields.get("MAXIMUM DELAY")),
        "condition": fields.get("IMPACTING CONDITION") or None,
        "title": title,
        "text": text,
    }


def restriction(root) -> list[dict]:
    """A restriction at each airport it names, as {"restriction",
    "airport", "kind" (ARRIVAL, DEPARTURE), "category" (MIT, MINIT...),
    "value", "reason", "facility", "starts", "ends", "id"}."""
    airports = _text(root, "airports").split()
    out = []
    for airport in airports:
        out.append({
            "restriction": True,
            "airport": airport,
            "kind": _text(root, "restrictionType") or None,
            "category": _text(root, "restrictionCategory") or None,
            "value": _text(root, "mitValue") or _text(root, "minitValue") or None,
            "element": _text(root, "restrictedNasElements") or None,
            "reason": _text(root, "reasonText") or None,
            "facility": _text(root, "facility") or None,
            "starts": _when(_text(root, "startTime")),
            "ends": _when(_text(root, "stopTime")),
            "id": _text(root, "restrictionId") or None,
        })
    return out


def heard(xml: str | bytes, now: float | None = None) -> int:
    """One TFMS flow message kept: a program started, changed or ended, or
    a restriction. ingest's handler for TFMS's GADV and RSTR messages."""
    if isinstance(xml, (bytes, bytearray)):
        xml = xml.decode("utf-8", "replace")
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return 0
    now = time.time() if now is None else now
    if _find(root, "generalAdvisory") is not None:
        found = advisory(root)
        if found is None:
            return 0
        key = f"{live_reports.ident(found['airport'])}:{found['program']}"
        if found["cancelled"]:
            live_reports.drop(KIND, key)
        else:
            live_reports.put(KIND, key, found, place=found["airport"], starts=found["starts"],
                             ends=found["ends"] or now + OPEN_ENDED_S, now=now)
        return 1
    if _find(root, "restrictionMessage") is not None:
        found = restriction(root)
        for r in found:
            # Its stop time past is its end: a message that ends it early
            # comes with its stop time then (action, as TFMS sends it).
            live_reports.put(KIND, f"{live_reports.ident(r['airport'])}:restriction:{r['id']}", r,
                             place=r["airport"], starts=r["starts"], ends=r["ends"] or now + OPEN_ENDED_S, now=now)
        return len(found)
    return 0


def at_airports(airports: list[str], now: float | None = None) -> list[dict]:
    """The programs and restrictions in force or to come at these airports."""
    return live_reports.at(KIND, airports, now=now)
