"""Digital ATIS, as the tower's Terminal Data Link System sends it: STDDS's
TDES DATISData messages (topic "TDES/all/false/DD/<airport>/<TRACON>"),
143 in 90 s of the owner's queue on 2026-11-09. Each is one airport's
broadcast: its letter (atisCode), the time (DATISTime, ddhhmm Z), and its
words (dataBody, "MSP ARR INFO I 0353Z. VRB03KT 10SM SCT250 07/03 A3006
... ADVS YOU HAVE INFO I."), the arrival and departure ATIS apart where
the airport has two (ARR INFO, DEP INFO; AIM 4-1-13 orders what an ATIS
says).

Kept in wingtip.live_reports (kind "datis"), one report an airport and
broadcast (arrival, departure or both), until KEEP_S after it was heard:
a new letter writes over the last. The words are read into figures by
the engine (read_datis, into the figures read_atis gives the app's
microphone ATIS), when a pilot asks, so the reading is always the
engine's of now.
"""

from __future__ import annotations

import json
import re
import time
import xml.etree.ElementTree as ET

import wingtip_native

from . import live_reports

KIND = "datis"
#: How long a broadcast is given after it was heard, s: an ATIS is made
#: again at least each hour with the weather (AIM 4-1-13), so one two
#: hours old is no longer the airport's.
KEEP_S = 2 * 3600
#: Which broadcast it is, from its first words ("MSP ARR INFO I").
_WHICH = re.compile(r"\b(ARR|DEP)\s+INFO\b")


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def broadcast(xml: str) -> dict | None:
    """One DATISData message as {"airport", "which" (arrival, departure or
    None for one broadcast), "letter", "issued" (ddhhmm Z), "text"}; None
    where it is not one."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return None
    fields = {_local(e.tag): (e.text or "").strip() for e in root.iter()}
    airport, text = fields.get("airportID", "").upper(), " ".join(fields.get("dataBody", "").split())
    if not airport or not text:
        return None
    which = _WHICH.search(text[:60])
    return {
        "airport": airport,
        "which": {"ARR": "arrival", "DEP": "departure"}[which[1]] if which else None,
        "letter": fields.get("atisCode") or None,
        "issued": fields.get("DATISTime") or None,
        "text": text,
    }


def heard(xml: str | bytes, now: float | None = None) -> int:
    """One D-ATIS message kept as its airport's broadcast. ingest's handler."""
    if isinstance(xml, (bytes, bytearray)):
        xml = xml.decode("utf-8", "replace")
    found = broadcast(xml)
    if found is None:
        return 0
    now = time.time() if now is None else now
    live_reports.put(
        KIND,
        f"{live_reports.ident(found['airport'])}:{found['which'] or 'both'}",
        found,
        place=found["airport"],
        ends=now + KEEP_S,
        now=now,
    )
    return 1


def read(text: str) -> dict:
    """A broadcast's words read into figures by the engine (read_datis:
    its METAR groups as a METAR, the rest as a spoken ATIS is read)."""
    return json.loads(wingtip_native.call("read_datis", json.dumps({"text": text})))


def at_airport(airport: str, now: float | None = None) -> list[dict]:
    """An airport's D-ATIS broadcasts heard in the last KEEP_S, each with
    the engine's reading of it ("reading") and when it was heard."""
    return [{**b, "reading": read(b["text"])} for b in live_reports.at(KIND, [airport], now=now)]
