"""A part of the Code of Federal Regulations as the documents library
reads it, from the eCFR's own API (ecfr.gov, the Office of the Federal
Register's daily edition of the CFR, public domain).

The eCFR's versioner gives each title's latest issue date
(/api/versioner/v1/titles.json: `latest_issue_date`, beside
`latest_amended_on` and `up_to_date_as_of`) and a part's whole text on a
date as XML (/api/versioner/v1/full/{date}/title-{n}.xml?part={p}). In it
the part is a DIV5, a subpart a DIV6, a section a DIV8 whose N is its
number ("91.155") and whose HEAD is its heading ("§ 91.155 Basic VFR
weather minimums."), its text in P elements, a paragraph's letter at its
start ("(a) Except as provided ..."); an appendix or an SFAR is a DIV9.
Read as sections in the part's order, each paragraph a string, so the app
lands a citation on its section by its number (the engine's `citations`).
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET

ECFR = "https://www.ecfr.gov"
TITLES = f"{ECFR}/api/versioner/v1/titles.json"


def part_url(date: str, title: str, part: str) -> str:
    """The part's whole text on `date` ("2026-11-10"), as XML."""
    return f"{ECFR}/api/versioner/v1/full/{date}/title-{title}.xml?part={part}"


def issue_dates(body: bytes) -> dict[str, str]:
    """{title's number: its latest issue date} from titles.json; a title
    reserved, or with no date, is left out."""
    return {
        str(t["number"]): t["latest_issue_date"]
        for t in json.loads(body).get("titles", [])
        if t.get("latest_issue_date") and not t.get("reserved")
    }


def _words(element: ET.Element) -> str:
    """An element's text, every inline element's (I, E, XREF) with it, its
    runs of white space one space."""
    return re.sub(r"\s+", " ", "".join(element.itertext())).strip()


def _section(div: ET.Element) -> dict:
    head = div.find("HEAD")
    return {
        "id": div.get("N", ""),
        "head": _words(head) if head is not None else "",
        "paragraphs": [w for p in div.iter("P") if (w := _words(p))],
    }


def part_text(body: bytes) -> dict:
    """A part's text: its heading and its groups in order (each subpart,
    and the appendices and SFARs as groups of their own), each with its
    sections, each section its number, heading and paragraphs."""
    root = ET.fromstring(body)
    part = root if root.tag == "DIV5" else root.find(".//DIV5")
    if part is None:
        raise ValueError("no part (DIV5) in the eCFR's answer")
    groups: list[dict] = []

    def add(head: str, sections: list[dict]) -> None:
        if sections:
            groups.append({"head": head, "sections": sections})

    loose: list[dict] = []
    for child in part:
        kind = child.tag
        if kind == "DIV8":
            loose.append(_section(child))
        elif kind in ("DIV6", "DIV7"):
            add("", loose)
            loose = []
            head = child.find("HEAD")
            add(_words(head) if head is not None else "", [_section(d) for d in child.iter("DIV8")])
        elif kind == "DIV9":
            add("", loose)
            loose = []
            head = child.find("HEAD")
            words = _words(head) if head is not None else child.get("N", "")
            # An appendix or an SFAR is one section of its own, its N its name.
            add(words, [{"id": child.get("N", ""), "head": words, "paragraphs": [w for p in child.iter("P") if (w := _words(p))]}])
    add("", loose)
    head = part.find("HEAD")
    return {"head": _words(head) if head is not None else "", "groups": groups}
