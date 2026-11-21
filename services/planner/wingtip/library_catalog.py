"""The documents library's shelf: the FAA's publications a pilot reads,
each by the name the engine's citations name it (the engine's `citations`,
engine/crates/wording/src/wording/cite.rs: `cfr-<title>-<part>`, `aim`,
`ac-<number>`), and where its current edition is found. All of them are
the United States government's works, in the public domain (17 U.S.C.
105); the app credits the FAA and the eCFR where they are read.

Two kinds of source:

- `ecfr`: a part of the Code of Federal Regulations from the eCFR's own
  API (ecfr.gov, the Office of the Federal Register's daily edition), its
  edition the title's latest issue date in /api/versioner/v1/titles.json,
  read as text by wingtip.ecfr, so a citation lands on its section.
- `faa`: a PDF linked from one of the FAA's pages, its edition read off
  the link: the page names the book's current file, and a new edition is
  a new link. `link` matches the link's address (case aside) and its
  first group, where it has one, is the edition's designation ("C" of
  FAA-H-8083-25C). The pages refuse a client without a browser's
  User-Agent, as registry.faa.gov does (wingtip.config.FAA_HEADERS).

The Chart Supplement is not here: a field's pages are the planner's
already, by the 56-day edition (wingtip.publications), and the library
opens them there.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

FAA = "https://www.faa.gov"
HANDBOOKS = f"{FAA}/regulations_policies/handbooks_manuals/aviation"
#: The FAA's page for an advisory circular's current edition, by number.
AC_PAGE = f"{FAA}/regulations_policies/advisory_circulars/index.cfm/go/document.current/documentNumber"


@dataclass(frozen=True)
class Document:
    """One document of the shelf."""

    id: str
    title: str
    #: The shelf's group: "Regulations", "AIM", "Handbooks", "Advisory Circulars", "Charts".
    group: str
    #: "ecfr" or "faa".
    source: str
    #: ecfr: the title ("14") and part ("91").
    title_number: str = ""
    part: str = ""
    #: faa: the page that links the current file, and the pattern its link matches.
    page: str = ""
    link: str = ""
    #: The FAA's designation, before the edition's letter ("FAA-H-8083-25").
    designation: str = ""


def _cfr(title: str, part: str, name: str) -> Document:
    return Document(f"cfr-{title}-{part}", name, "Regulations", "ecfr", title_number=title, part=part)


def _handbook(id_: str, name: str, page: str, number: str) -> Document:
    # "faa-h-8083-25c.pdf", "FAA-H-8083-3C.pdf": the whole book's file,
    # not a chapter's, which the FAA names by the chapter.
    link = rf"faa-h-{number}([a-z]?)(?:_[^/\"']*)?\.pdf"
    return Document(id_, name, "Handbooks", "faa", page=f"{HANDBOOKS}/{page}", link=link, designation=f"FAA-H-{number}")


def _circular(number: str, name: str) -> Document:
    # "/documentLibrary/media/Advisory_Circular/AC_61-65K.pdf".
    escaped = re.escape(number)
    link = rf"ac_?{escaped}([a-z]{{0,2}})(?:_[^/\"']*)?\.pdf"
    return Document(f"ac-{number}", name, "Advisory Circulars", "faa", page=f"{AC_PAGE}/{number}", link=link, designation=f"AC {number}")


SHELF: tuple[Document, ...] = (
    _cfr("14", "1", "14 CFR Part 1: Definitions and Abbreviations"),
    _cfr("14", "43", "14 CFR Part 43: Maintenance"),
    _cfr("14", "61", "14 CFR Part 61: Certification of Pilots and Instructors"),
    _cfr("14", "68", "14 CFR Part 68: BasicMed"),
    _cfr("14", "91", "14 CFR Part 91: General Operating and Flight Rules"),
    _cfr("14", "97", "14 CFR Part 97: Standard Instrument Procedures"),
    _cfr("14", "99", "14 CFR Part 99: Security Control of Air Traffic"),
    _cfr("14", "135", "14 CFR Part 135: Commuter and On Demand Operations"),
    _cfr("49", "830", "49 CFR Part 830: NTSB Accident and Incident Notification"),
    Document(
        "aim",
        "Aeronautical Information Manual",
        "AIM",
        "faa",
        page=f"{FAA}/air_traffic/publications/atpubs/aim_html/",
        # The basic manual with its changes, one PDF: "AIM_Basic_w_Chg1_dtd_1-22-26.pdf".
        link=r"aim[^/\"']*basic[^/\"']*\.pdf",
        designation="AIM",
    ),
    _handbook("phak", "Pilot's Handbook of Aeronautical Knowledge", "phak", "8083-25"),
    _handbook("afh", "Airplane Flying Handbook", "airplane_handbook", "8083-3"),
    _handbook("ifh", "Instrument Flying Handbook", "instrument_flying_handbook", "8083-15"),
    _handbook("iph", "Instrument Procedures Handbook", "instrument_procedures_handbook", "8083-16"),
    _handbook("awh", "Aviation Weather Handbook", "faa-h-8083-28-aviation-weather-handbook", "8083-28"),
    _handbook("rmh", "Risk Management Handbook", "risk_management_handbook", "8083-2"),
    Document(
        "chart-users-guide",
        "Aeronautical Chart Users' Guide",
        "Charts",
        "faa",
        page=f"{FAA}/air_traffic/flight_info/aeronav/digital_products/aero_guide/",
        link=r"(?:aero_guide|chart_users_guide)[^/\"']*\.pdf",
        designation="Chart Users' Guide",
    ),
    _circular("61-65", "Certification: Pilots and Flight and Ground Instructors"),
    _circular("61-98", "Currency Requirements and Guidance for the Flight Review and Instrument Proficiency Check"),
    _circular("60-22", "Aeronautical Decision Making"),
    _circular("90-23", "Aircraft Wake Turbulence"),
    _circular("90-48", "Pilots' Role in Collision Avoidance"),
    _circular("90-66", "Non-Towered Airport Flight Operations"),
    _circular("90-100", "U.S. Terminal and En Route Area Navigation (RNAV) Operations"),
    _circular("91-63", "Temporary Flight Restrictions and Flight Limitations"),
    _circular("91-73", "Parts 91 and 135 Single Pilot, Flight School Procedures During Taxi Operations"),
    _circular("91-74", "Pilot Guide: Flight in Icing Conditions"),
    _circular("91-92", "Pilot's Guide to a Preflight Briefing"),
    _circular("00-54", "Pilot Windshear Guide"),
)

BY_ID = {d.id: d for d in SHELF}
