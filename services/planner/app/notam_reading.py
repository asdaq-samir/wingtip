"""A field's NOTAMs read for its card here, where they are ranked, rather
than by the web's engine module: each NOTAM's reading (the engine's
notam_read: its heading, its words written out, its window), its card
(notam_card: what happened, its category, its effect, the procedures it
takes away), what it addresses on the field's card (notam_subject: JO
7930.2's keywords matched to the card's runways, lights, approaches and
frequencies, as badges) and which roles in a plan it reaches
(notam_affects, asked for every role). The NOTAM reader is some 40 KB of the web's
WebAssembly, asked only after the planner has sent the NOTAMs, so the
planner sends it with them (round 6, the wasm budget) and the web reads
what comes.

The card's lists are the ones /api/airport/{ident} sends, in its order, so
a badge's `index` is the web's: the open runways (wingtip.airports), the
lights from the FAA's remarks (wingtip.remarks), the approach charts of
this cycle's d-TPP (wingtip.publications, kind IAP) and the frequencies
(wingtip.airports)."""

from __future__ import annotations

import json
import threading
from collections import OrderedDict

from wingtip import airports, publications, remarks
from wingtip.engine import ask


def _lights(ident: str) -> list[dict]:
    """The field's lighting systems from the FAA's remarks, by its FAA
    identifier as the card reads them (KRFD's are RFD's); none where the
    remarks file cannot be had."""
    for faa_id in [ident[1:], ident] if len(ident) == 4 and ident[0] in "KP" else [ident]:
        try:
            notes = remarks.airport_notes(faa_id)
        except (OSError, RuntimeError):
            return []
        if notes["lighting"] or notes["radio"]:
            return notes["lights"]
    return []


def field_card(place: dict) -> dict:
    """What notam_subject matches a NOTAM against: the field's names
    (field_names, FAA JO 7350.9GG 4-1) and the card's own lists."""
    ident, source = place["ident"], place.get("source_ident") or place["ident"]
    return {
        "idents": ask("field_names", ident=ident),
        "runways": [r.get("ends") or "" for r in airports.get_runways(source) if not r["closed"]],
        "lights": [{"code": li.get("code"), "name": li.get("name"), "runways": li.get("runways")} for li in _lights(ident)],
        "approaches": [c["name"] for c in publications.terminal_charts(ident) if c.get("kind") == "IAP"],
        "frequencies": [{"type": f.get("type"), "mhz": f.get("frequency_mhz")} for f in airports.get_frequencies(source)],
    }


#: The roles a field plays in a planned flight (notam_affects).
_ROLES = ["departure", "stop", "arrival", "alternate"]


#: Each NOTAM's reading kept, by what it is read from (its text and ends, the field's names, whether a TFR, and the
#: card's lists: the engine's answers are a function of exactly these): the four engine calls of a NOTAM are
#: asked once, not on every open of a busy field's card (KORD's or KDEN's 100 to 200 NOTAMs; round 7's audit, C7).
#: A new NOTAM or a changed card is a new key; the least recently used go past _KEEP.
_KEEP = 2048
_READINGS: OrderedDict[str, dict] = OrderedDict()
_LOCK = threading.Lock()


def _reading(text: str, tfr: bool, ends, card: dict, card_key: str) -> dict:
    key = json.dumps([text, tfr, ends, card_key])
    with _LOCK:
        if key in _READINGS:
            _READINGS.move_to_end(key)
            return _READINGS[key]
    idents = card["idents"]
    got = {
        "reading": ask("notam_read", text=text, idents=idents),
        "card": ask("notam_card", text=text, idents=idents, ends=ends),
        "subject": ask("notam_subject", **card, text=text, tfr=tfr),
        # Every role it could reach in a plan, in the engine's order:
        # the card keeps those its field plays, the first its chip.
        "affects": ask("notam_affects", text=text, idents=idents, roles=_ROLES)["affects"],
    }
    with _LOCK:
        _READINGS[key] = got
        while len(_READINGS) > _KEEP:
            _READINGS.popitem(last=False)
    return got


def read(notams: list[dict], card: dict) -> list[dict]:
    """Each ranked NOTAM with its `reading`, `card`, `subject` and
    `affects` beside it; a TFR's reading stays its tfr_read on the web,
    from its facts."""
    card_key = json.dumps(card, sort_keys=True)
    return [{**n, **_reading(n["raw"], n.get("kind") == "tfr", n.get("ends"), card, card_key)} for n in notams]
