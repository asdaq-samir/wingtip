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

The addresses as the FAA had them on 2026-11-23, when the Instrument
Flying, Aviation Weather and Risk Management Handbooks' pages had moved
(404s) and the circulars' pages still linked cancelled editions on
rgl.faa.gov, a host that no longer resolves: the handbooks' index
(regulations_policies/handbooks_manuals/aviation) names each book's
current page or file, and a circular's "document.current" page lists its
current edition first, its cancelled ones after (wingtip.library's
current_link takes the first there).

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
    #: faa: the page lists the current edition's link first and the
    #: cancelled ones after it (a circular's page), so the first match is
    #: taken, not the shortest name.
    current_first: bool = False


def _cfr(title: str, part: str, name: str) -> Document:
    return Document(f"cfr-{title}-{part}", name, "Regulations", "ecfr", title_number=title, part=part)


def _handbook(id_: str, name: str, page: str, number: str, link: str = "", designation: str = "") -> Document:
    # "faa-h-8083-25c.pdf", "FAA-H-8083-15B.pdf": the whole book's file,
    # not a chapter's, which the FAA names by the chapter. `page` is a
    # path under the handbooks' index ("" the index itself, which links
    # some books' files directly), or a whole address where the FAA has
    # moved a book's page out from under it.
    link = link or rf"faa-h-{number}([a-z]?)(?:_[^/\"']*)?\.pdf"
    address = page if page.startswith("https://") else f"{HANDBOOKS}/{page}".rstrip("/")
    return Document(id_, name, "Handbooks", "faa", page=address, link=link, designation=designation or f"FAA-H-{number}")


def _circular(number: str, name: str) -> Document:
    # "/documentLibrary/media/Advisory_Circular/AC_61-65K.pdf", "AC%2091-73B.pdf",
    # "AC_90-100A_CHG_2.pdf": the edition's letter and any change to it.
    escaped = re.escape(number)
    link = rf"ac(?:_|%20| )?{escaped}([a-z]{{0,2}}(?:_chg_\d+)?)(?:_[^/\"']*)?\.pdf"
    return Document(
        f"ac-{number}",
        name,
        "Advisory Circulars",
        "faa",
        page=f"{AC_PAGE}/{number}",
        link=link,
        designation=f"AC {number}",
        current_first=True,
    )


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
    # FAA-H-8083-3C (2021): its page links the whole book as "00_afh_full.pdf",
    # with no edition in the name, so the edition is the index's.
    _handbook("afh", "Airplane Flying Handbook", "airplane_handbook", "8083-3", r"afh_full\.pdf", "FAA-H-8083-3C"),
    # FAA-H-8083-15B (2012), linked from the index itself: its own page is gone.
    _handbook("ifh", "Instrument Flying Handbook", "", "8083-15"),
    _handbook("iph", "Instrument Procedures Handbook", "instrument_procedures_handbook", "8083-16"),
    # FAA-H-8083-28B (2026), whose page moved to the FAA's new paths
    # ("/sites/faa.gov/files/FAA-H-8083-28B.pdf").
    _handbook(
        "awh",
        "Aviation Weather Handbook",
        f"{FAA}/regulationspolicies/handbooksmanuals/aviation/faa-h-8083-28-aviation-weather-handbook",
        "8083-28",
    ),
    # FAA-H-8083-2A (2022), moved likewise, its file "risk_management_handbook_2A.pdf".
    _handbook(
        "rmh",
        "Risk Management Handbook",
        f"{FAA}/regulationspolicies/handbooksmanuals/risk-management-handbook-faa-h-8083-2a",
        "8083-2",
        r"risk_management_handbook_\d*([a-z]?)\.pdf",
    ),
    Document(
        "chart-users-guide",
        "Aeronautical Chart Users' Guide",
        "Charts",
        "faa",
        page=f"{FAA}/air_traffic/flight_info/aeronav/digital_products/aero_guide/",
        link=r"(?:aero_guide|chart_users_guide)[^/\"']*\.pdf",
        designation="Chart Users' Guide",
    ),
    # The current editions on 2026-11-23, by each circular's FAA page (the
    # library fetches whichever is current then, and names it):
    # AC 61-65K (2025-11-14), the endorsements' text (the engine's endorsement_kinds).
    _circular("61-65", "Certification: Pilots and Flight and Ground Instructors"),
    # AC 61-98E (2024-10-30).
    _circular("61-98", "Currency Requirements and Guidance for the Flight Review and Instrument Proficiency Check"),
    # AC 60-22 (1991-12-13), never revised.
    _circular("60-22", "Aeronautical Decision Making"),
    # AC 90-23H (2026-01-13), retitled from "Aircraft Wake Turbulence".
    _circular("90-23", "Aircraft Wake Vortex Encounter Risk Mitigation"),
    # AC 90-48E (2022-10-20).
    _circular("90-48", "Pilots' Role in Collision Avoidance"),
    # AC 90-66C (2023-06-06).
    _circular("90-66", "Non-Towered Airport Flight Operations"),
    # AC 90-100A with its Change 2.
    _circular("90-100", "U.S. Terminal and En Route Area Navigation (RNAV) Operations"),
    # AC 91-63D.
    _circular("91-63", "Temporary Flight Restrictions and Flight Limitations"),
    # AC 91-73B (2012-07-30), with its editorial update.
    _circular("91-73", "Parts 91 and 135 Single Pilot, Flight School Procedures During Taxi Operations"),
    # AC 91-74B (2015-10-08).
    _circular("91-74", "Pilot Guide: Flight in Icing Conditions"),
    # AC 91-92 (2021-03-15), with its editorial update of 2025-03-19.
    _circular("91-92", "Pilot's Guide to a Preflight Briefing"),
    # AC 00-54 (1988-11-25).
    _circular("00-54", "Pilot Windshear Guide"),
)

BY_ID = {d.id: d for d in SHELF}
