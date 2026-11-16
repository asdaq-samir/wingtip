"""The FAA aircraft registry's codes in words, and its text as the app
writes it, for wingtip.registry and wingtip.registry_history.

Every code and its words are the FAA's own, from its readme of the
download, "ardata.pdf" (registry.faa.gov/database/ardata.pdf, dated
5/8/2025): the Aircraft Registration Master File (MASTER.txt), the
Aircraft Reference File (ACFTREF.txt), the Engine Reference File
(ENGINE.txt), the Aircraft Document Index File (DOCINDEX.txt), the Reserve
N-Number File (RESERVED.txt) and the Aircraft Deregistered File
(DEREG.txt). Each file is comma-delimited with a header row; the positions
the readme gives are the fixed-width record's.
"""

from __future__ import annotations

import re

#: MASTER's and DEREG's Type Registrant.
REGISTRANT = {
    "1": "Individual",
    "2": "Partnership",
    "3": "Corporation",
    "4": "Co-owned",
    "5": "Government",
    "7": "LLC",
    "8": "Non-citizen corporation",
    "9": "Non-citizen co-owned",
}
#: Type Aircraft (MASTER, ACFTREF).
AIRCRAFT = {
    "1": "Glider",
    "2": "Balloon",
    "3": "Blimp or dirigible",
    "4": "Fixed wing single engine",
    "5": "Fixed wing multi engine",
    "6": "Rotorcraft",
    "7": "Weight-shift-control",
    "8": "Powered parachute",
    "9": "Gyroplane",
    "H": "Hybrid lift",
    "O": "Other",
}
#: Type Engine (MASTER, ACFTREF, ENGINE).
ENGINE = {
    "0": "None",
    "1": "Reciprocating",
    "2": "Turbo-prop",
    "3": "Turbo-shaft",
    "4": "Turbo-jet",
    "5": "Turbo-fan",
    "6": "Ramjet",
    "7": "2 cycle",
    "8": "4 cycle",
    "9": "Unknown",
    "10": "Electric",
    "11": "Rotary",
}
#: ACFTREF's Aircraft Category Code (position 66).
CATEGORY = {"1": "Land", "2": "Sea", "3": "Amphibian"}
#: ACFTREF's Builder Certification Code (position 68).
BUILDER = {"0": "Type certificated", "1": "Not type certificated", "2": "Light sport"}
#: ACFTREF's Aircraft Weight (positions 77-83): the class of the maximum
#: gross takeoff weight, in pounds.
WEIGHT = {"CLASS 1": "Up to 12,499 lb", "CLASS 2": "12,500 to 19,999 lb", "CLASS 3": "20,000 lb and over", "CLASS 4": "UAV up to 55 lb"}
#: MASTER's Registrant's Region (position 211): the FAA region of the address.
REGION = {
    "1": "Eastern",
    "2": "Southwestern",
    "3": "Central",
    "4": "Western-Pacific",
    "5": "Alaskan",
    "7": "Southern",
    "8": "European",
    "C": "Great Lakes",
    "E": "New England",
    "S": "Northwest Mountain",
}
#: The airworthiness certificate's class (Certification, position 238),
#: and the operations each is approved for (positions 239-247).
CLASS = {
    "1": "Standard",
    "2": "Limited",
    "3": "Restricted",
    "4": "Experimental",
    "5": "Provisional",
    "6": "Multiple",
    "7": "Primary",
    "8": "Special flight permit",
    "9": "Light sport",
}
STANDARD = {"N": "normal", "U": "utility", "A": "acrobatic", "T": "transport", "G": "glider", "B": "balloon", "C": "commuter", "O": "other"}
RESTRICTED = {
    "0": "other",
    "1": "agriculture and pest control",
    "2": "aerial surveying",
    "3": "aerial advertising",
    "4": "forest",
    "5": "patrolling",
    "6": "weather control",
    "7": "carriage of cargo",
}
EXPERIMENTAL = {
    "0": "to show compliance with the FARs",
    "1": "research and development",
    "2": "amateur built",
    "3": "exhibition",
    "4": "racing",
    "5": "crew training",
    "6": "market survey",
    "7": "operating kit built aircraft",
    "8A": "registered before 01/31/08",
    "8B": "operating light-sport kit-built",
    "8C": "operating light-sport previously certificated under 21.190",
    "9A": "unmanned, research and development",
    "9B": "unmanned, market survey",
    "9C": "unmanned, crew training",
    "9D": "unmanned, exhibition",
    "9E": "unmanned, compliance with the CFR",
}
PROVISIONAL = {"1": "class I", "2": "class II"}
MULTIPLE = {"1": "standard", "2": "limited", "3": "restricted"}
SPECIAL_PERMIT = {
    "1": "ferry flight for repairs, alterations, maintenance or storage",
    "2": "evacuation from an area of impending danger",
    "3": "operation in excess of maximum certificated weight",
    "4": "delivery or export",
    "5": "production flight testing",
    "6": "customer demonstration",
}
LIGHT_SPORT = {"A": "airplane", "G": "glider", "L": "lighter than air", "P": "powered parachute", "W": "weight-shift-control"}
#: The registration's status (Status Code), in the FAA's words.
STATUS = {
    "A": "Triennial registration form mailed, not returned",
    "D": "Expired dealer",
    "E": "Certificate of registration revoked by enforcement action",
    "M": "Valid: assigned to the manufacturer under its dealer certificate",
    "N": "Non-citizen corporation that has not returned its flight hour reports",
    "R": "Registration pending",
    "S": "Second triennial registration form mailed, not returned",
    "T": "Valid: a trainee's registration",
    "V": "Valid",
    "W": "Certificate of registration deemed ineffective or invalid",
    "X": "Enforcement letter",
    "Z": "Permanently reserved",
    "1": "Triennial registration form returned as undeliverable",
    "2": "N-number assigned, not yet registered",
    "3": "N-number assigned to a non-type-certificated aircraft, not yet registered",
    "4": "N-number assigned to an import, not yet registered",
    "5": "Reserved N-number",
    "6": "Administratively canceled",
    "7": "Sale reported",
    "8": "Second triennial registration form mailed, no response",
    "9": "Certificate of registration revoked",
    "10": "N-number assigned, not registered, pending cancellation",
    "11": "N-number assigned to a non-type-certificated (amateur) aircraft, not registered, pending cancellation",
    "12": "N-number assigned to an import, not registered, pending cancellation",
    "13": "Registration expired",
    "14": "First notice for re-registration or renewal",
    "15": "Second notice for re-registration or renewal",
    "16": "Registration expired, pending cancellation",
    "17": "Sale reported, pending cancellation",
    "18": "Sale reported, canceled",
    "19": "Registration pending, pending cancellation",
    "20": "Registration pending, canceled",
    "21": "Revoked, pending cancellation",
    "22": "Revoked, canceled",
    "23": "Expired dealer, pending cancellation",
    "24": "Third notice for re-registration or renewal",
    "25": "First notice for registration renewal",
    "26": "Second notice for registration renewal",
    "27": "Registration expired",
    "28": "Third notice for registration renewal",
    "29": "Registration expired, pending cancellation",
}
#: The codes the FAA calls valid, and those of a registration not in
#: effect -- expired, revoked, canceled, ineffective, or an N-number never
#: registered; the rest (a form not returned, a sale reported, a renewal
#: notice) are said as they are.
VALID = frozenset("VMT")
LAPSED = frozenset(
    {"D", "E", "W", "Z", "2", "3", "4", "5", "6", "9", "10", "11", "12", "13", "16", "18", "20", "21", "22", "23", "27", "29"}
)
#: DOCINDEX's Doc Type (positions 165-167).
DOCUMENT = {
    "BOS": "Evidence of ownership",
    "S/A": "Security conveyance or lien",
    "REL": "Lien release",
    "REP": "Repossession",
    "CSC": "Evidence of ownership with lien",
    "DIS": "Disclaimer",
    "CRT": "Court documents",
}
#: RESERVED's Type Reservation (positions 168-169).
RESERVATION = {
    "AA": "Reserved, no fee",
    "A": "Fee paid, notice for expiration sent",
    "HD": "Two-year hold for a canceled N-number",
    "FN": "Fee paid, notice for expiration sent",
    "FP": "Fee paid",
    "MF": "Reserved to a manufacturer, no fee, no expiration date",
    "MT": "Reserved to a manufacturer, temporary number",
    "NC": "N-number change in process",
    "NN": "N-number change in process, expiration notice sent",
    "CN": "N-number change, expiration notice sent",
    "CE": "N-number change expired",
}

#: Words of a name kept in capitals: a company's form.
_KEPT = frozenset({"LLC", "LLP", "LP", "PC", "PLLC", "USA", "US", "II", "III", "IV", "FBO", "DBA"})
#: Words of three letters or fewer in a maker's name written as words,
#: not as its initials.
_WORDS = frozenset({"INC", "CO", "LTD", "AND", "THE", "OF", "DE", "LA", "Y", "DEL", "EL", "VAN", "VON"})


def name_case(text: str, maker: bool = False) -> str:
    """A name in the FAA's capitals as a name is written: "ROCA ROJA Y
    CABALLO GRIS DE IDAHO LLC" as "Roca Roja Y Caballo Gris De Idaho LLC",
    "UNITED AIRLINES INC" as "United Airlines Inc"; a company's form and a
    word with figures kept, and in a maker's name (`maker`) its initials
    too ("IAE", "CFM"), which in a person's ("JOE") are a name."""

    def word(w: str) -> str:
        bare = w.strip(".,&")
        if bare in _KEPT or any(c.isdigit() for c in w) or (maker and len(bare) <= 3 and bare.isalpha() and bare not in _WORDS):
            return w
        return w.capitalize()

    return " ".join(word(w) for w in text.split())


def name_or_none(text: str | None, maker: bool = False) -> str | None:
    return name_case(text, maker) if text else None


def date(text: str | None) -> str | None:
    """The FAA's YYYYMMDD as an ISO date."""
    text = (text or "").strip()
    return f"{text[:4]}-{text[4:6]}-{text[6:8]}" if re.fullmatch(r"\d{8}", text) else None


def number(text: str | None) -> int | None:
    text = (text or "").strip()
    return int(text) if text.isdigit() else None


def airworthiness(code: str | None) -> str | None:
    """The certification field in words: "1NU" as "Standard (normal,
    utility)", "42" as "Experimental (amateur built)", "31" as "Restricted
    (agriculture and pest control)"."""
    code = (code or "").strip()
    if not code or code[0] not in CLASS:
        return None
    kind, rest = CLASS[code[0]], code[1:]
    uses: list[str]
    if code[0] == "1":
        uses = [STANDARD[c] for c in rest if c in STANDARD]
    elif code[0] == "3":
        uses = [RESTRICTED[c] for c in rest if c in RESTRICTED]
    elif code[0] == "4":
        uses = [EXPERIMENTAL[u] for u in re.findall(r"8[ABC]|9[A-E]|[0-7]", rest) if u in EXPERIMENTAL]
    elif code[0] == "5":
        uses = [PROVISIONAL[c] for c in rest[:1] if c in PROVISIONAL]
    elif code[0] == "6":
        # Positions 239-240 the classes, 241-247 the restricted operations.
        uses = [MULTIPLE[c] for c in rest[:2] if c in MULTIPLE] + [RESTRICTED[c] for c in rest[2:] if c in RESTRICTED]
    elif code[0] == "8":
        uses = [SPECIAL_PERMIT[c] for c in rest if c in SPECIAL_PERMIT]
    elif code[0] == "9":
        uses = [LIGHT_SPORT[c] for c in rest[:1] if c in LIGHT_SPORT]
    else:
        uses = []
    return f"{kind} ({', '.join(uses)})" if uses else kind


def standing(code: str) -> str:
    """Whether a status is valid, not in effect ("lapsed") or between ("other")."""
    return "valid" if code in VALID else "lapsed" if code in LAPSED else "other"


def status(code: str) -> str | None:
    return STATUS.get(code) or (f"FAA status {code}" if code else None)
