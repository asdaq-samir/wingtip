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


def read(notams: list[dict], card: dict) -> list[dict]:
    """Each ranked NOTAM with its `reading`, `card`, `subject` and
    `affects` beside it; a TFR's reading stays its tfr_read on the web,
    from its facts."""
    idents = card["idents"]
    out = []
    for n in notams:
        text, tfr = n["raw"], n.get("kind") == "tfr"
        read_card = ask("notam_card", text=text, idents=idents, ends=n.get("ends"))
        out.append(
            {
                **n,
                "reading": ask("notam_read", text=text, idents=idents),
                "card": read_card,
                "subject": ask("notam_subject", **card, text=text, tfr=tfr),
                # Every role it could reach in a plan, in the engine's order:
                # the card keeps those its field plays, the first its chip.
                "affects": ask("notam_affects", text=text, idents=idents, roles=_ROLES)["affects"],
            }
        )
    return out
