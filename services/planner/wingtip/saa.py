"""Special activity airspace status, from SFDPS's airspace messages (SWIM
Flight Data Publication Service, the owner's SCDS subscription): whether
a restricted area, MOA, warning area or ATCAA is active now, and from
when to when, as the FAA's Special Use Airspace Management System
schedules and releases it. The chart's times of use (wingtip.sua) say
when an area may be active; this says when it is.

The messages are AIXM 5.1 (the FAA's SAA as AIXM 5.1 Airspace features,
FAA SFDPS Airspace / SAA documentation): each an Airspace with time
slices, each slice its designator ("R4401A"), its name and type, and its
activations (AirspaceActivation), each with a status (AIXM 5.1's
CodeStatusAirspaceType: ACTIVE, INTERMITTENT, INACTIVE, ON_REQUEST,
OTHER...) and the time it holds (gml:validTime's TimePeriod, begin and
end). Read by element names, namespace left off, so a message that puts
the activation in an extension still reads.

What the feed sends (the owner's queue, 2026-11-09 05:17Z, topic
"FDPS/AirspaceAIXM/SU_AIXM/..."): a status update a message, an
AIXMBasicMessage holding one Airspace SNAPSHOT slice, its designator
("W136C"), an AirspaceActivation whose status is ACTIVE, an empty
validTime, and SFDPS's own extensions with the altitudes it is active
between (saaManualHighAltitude "3000", the units unstated, so kept as
sent and never shown). Three ZJX warning areas came so in three minutes
of browsing, a quiet night. A status with no times holds until the next
update for that area: kept SNAPSHOT_HOLDS_S at most, so one whose
INACTIVE never came (ingest down) is not active for ever, and given
with when it was heard.

Kept in wingtip.live_reports (kind "saa"), one report an area by its
designator with its punctuation left off ("R-4401A" and "R4401A" are
one), until its last activation ends.
"""

from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime

from . import live_reports

KIND = "saa"
#: Statuses that mean an area is in use (AIXM 5.1 CodeStatusAirspaceType).
ACTIVE = {"ACTIVE", "IN_USE", "INTERMITTENT"}
#: Statuses that mean it is not (cold).
COLD = {"INACTIVE", "NOT_ACTIVE", "DEACTIVATED"}
#: How long a status with no end time is kept, s: a day, longer than an
#: area's activation runs (the chart's times of use give hours), short
#: enough that a status whose end was missed goes.
SNAPSHOT_HOLDS_S = 24 * 3600


def key(designator: str) -> str:
    """An area's designator as kept: upper case, letters and digits only,
    so the chart's "R-4401A" finds SFDPS's "R4401A"."""
    return re.sub(r"[^A-Z0-9]", "", (designator or "").upper())


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _first(element, name: str):
    return next((e for e in element.iter() if _local(e.tag) == name), None)


def _text(element, name: str) -> str:
    found = _first(element, name)
    return (found.text or "").strip() if found is not None and found.text else ""


def _when(text: str) -> float | None:
    """An AIXM time ("2026-11-09T14:00:00Z"), s; None for none or an
    indeterminate one (an open end)."""
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def _period(element) -> tuple[float | None, float | None]:
    period = _first(element, "TimePeriod")
    if period is None:
        return None, None
    return _when(_text(period, "beginPosition")), _when(_text(period, "endPosition"))


def areas(xml: str) -> list[dict]:
    """The areas of one message, each {"designator", "name", "type",
    "activations": [{"status", "active", "starts", "ends"}]}: an area
    whose slice gives no activation is left out (it says nothing of its
    status)."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    found = []
    for airspace in (e for e in root.iter() if _local(e.tag) == "AirspaceTimeSlice"):
        designator = _text(airspace, "designator")
        if not designator:
            continue
        starts, ends = _period(airspace)
        activations = []
        for activation in (e for e in airspace.iter() if _local(e.tag) == "AirspaceActivation"):
            status = _text(activation, "status").upper()
            if not status:
                continue
            a_starts, a_ends = _period(activation)
            activations.append(
                {
                    "status": status,
                    "active": True if status in ACTIVE else False if status in COLD else None,
                    "starts": a_starts if a_starts is not None else starts,
                    "ends": a_ends if a_ends is not None else ends,
                }
            )
        if activations:
            found.append(
                {
                    "designator": designator,
                    "name": _text(airspace, "name") or None,
                    "type": _text(airspace, "type") or None,
                    "activations": activations,
                    # SFDPS's extension, as sent: its units are unstated.
                    "upper_as_sent": _text(airspace, "saaManualHighAltitude") or None,
                    "lower_as_sent": _text(airspace, "saaManualLowAltitude") or None,
                }
            )
    return found


def heard(xml: str | bytes, now: float | None = None) -> int:
    """One SFDPS message kept: each area's activations in the store,
    replacing what it last said. ingest's handler for the feed. How many
    areas it gave."""
    if isinstance(xml, (bytes, bytearray)):
        xml = xml.decode("utf-8", "replace")
    now = time.time() if now is None else now
    found = areas(xml)
    for area in found:
        ends = [a["ends"] for a in area["activations"]]
        # Kept until its last activation ends, or a day on where one has no end.
        last = now + SNAPSHOT_HOLDS_S if any(e is None for e in ends) else max(ends)
        live_reports.put(KIND, key(area["designator"]), area, place=key(area["designator"]), ends=last, now=now)
    return len(found)


def status(designators: list[str], now: float) -> dict[str, dict]:
    """Each area's status at `now`, by the designator asked with: {"active":
    True (in use now), False (cold now) or None (no word of it now),
    "status", "until" (s: when the activation in force now ends),
    "next" (s: when the next active one starts), "heard"}. An area SFDPS
    has said nothing of is left out."""
    asked = {key(d): d for d in designators if key(d)}
    out: dict[str, dict] = {}
    for area in live_reports.at(KIND, list(asked), now=now):
        now_in = [a for a in area["activations"] if (a["starts"] is None or a["starts"] <= now) and (a["ends"] is None or a["ends"] > now)]
        # Active wins where two slices overlap: the safer word (an area
        # said active is avoided or asked about).
        current = next((a for a in now_in if a["active"]), now_in[0] if now_in else None)
        upcoming = sorted(a["starts"] for a in area["activations"] if a["active"] and a["starts"] is not None and a["starts"] > now)
        out[asked[key(area["designator"])]] = {
            "designator": area["designator"],
            "active": current["active"] if current else None,
            "status": current["status"] if current else None,
            "until": current["ends"] if current else None,
            "next": upcoming[0] if upcoming else None,
            "heard": area["heard"],
        }
    return out
