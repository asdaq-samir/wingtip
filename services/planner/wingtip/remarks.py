"""What the FAA says about an airport in words: the remarks behind its
Chart Supplement entry (NASR's APT_RMK, the same text) that a pilot acts
on from the cockpit -- the runway lights turned on by keying the mic on
the CTAF, read by the engine into each system and how it is turned on
(lighting_read), and the weather some fields read out on so many clicks
of it, in words (the engine's remarks_read).

3CK, Lake in the Hills, for one: "ACTVT REIL RWY 08 & 26; PAPI RWY 08
& 26; MIRL RWY 08/26 - CTAF." -- the REIL, the PAPI and the MIRL, each
"Key the mic on CTAF" -- and "WX ADZY - CTAF 5 CLICKS OR 815-444-1729.",
here "Weather advisory - CTAF 5 clicks or 815-444-1729."
"""

from __future__ import annotations

import csv
import json
import re
import threading
from pathlib import Path

import wingtip_native

from . import faa_data
from .config import DATA_DIR
from .single_flight import once

FAA_CACHE_DIR = DATA_DIR / "raw" / "faa_nasr"

# Which of an airport's remarks are about its lights -- its lighting
# schedule and its beacon's -- and which about the radio: a click count
# anywhere else.
LIGHTS, BEACON = "LGT_SKED", "BCN_LGT_SKED"
_CLICKS = re.compile(r"\bCLICKS?\b")

_LOCK = threading.Lock()


@once(maxsize=2)
def _remarks_of(path: str, _mtime: float) -> dict:
    """Every airport's remarks, by its FAA identifier: (column, text,
    element) in the file's order, the element what the remark is on -- a
    runway's "06/24", an end's "24", blank for the airport's own."""
    by_airport: dict[str, list[tuple[str, str, str]]] = {}
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.DictReader(f):
            by_airport.setdefault(row["ARPT_ID"].strip().upper(), []).append(
                (row["REF_COL_NAME"], row["REMARK"].strip(), (row.get("ELEMENT") or "").strip().upper())
            )
    return by_airport


def _all_remarks(cache_dir=FAA_CACHE_DIR) -> dict:
    with _LOCK:
        path = faa_data.ensure_nasr_file("APT_RMK.csv", cache_dir)
        return _remarks_of(str(path), Path(path).stat().st_mtime)


def read(texts: list[str]) -> list[str]:
    """Remarks in words, a line each in their order: the engine's
    remarks_read, the Chart Supplement's Abbreviations and JO 7340.2R's
    contractions written out, codes, figures and telephone numbers kept."""
    if not texts:
        return []
    return json.loads(wingtip_native.call("remarks_read", json.dumps({"remarks": texts})))["lines"]


def airport_notes(faa_id: str, cache_dir=FAA_CACHE_DIR) -> dict:
    """What an airport's remarks say about its lights and its radio:
    `lighting`, its lighting remarks and its beacon's as sent; `lights`,
    each system they name, its runways and how it is turned on, and
    `light_notes`, what the engine could not read, said as written
    (lighting_read: the Chart Supplement legend, AIM 2-1); `radio`, every
    other remark that counts mic clicks (the weather read out on the
    CTAF, a radio check) in words (`read`); and `standard_keying`,
    where a light is the pilot's and the remarks give no count of clicks:
    AIM 2-1-8's (Pilot Control of Airport Lighting) 7, 5 and 3 apply."""
    remarks = _all_remarks(cache_dir).get(faa_id.strip().upper(), [])
    lighting = [text for column, text, _ in remarks if column == LIGHTS]
    beacon = [text for column, text, _ in remarks if column == BEACON]
    radio = [text for column, text, _ in remarks if column not in (LIGHTS, BEACON) and _CLICKS.search(text.upper())]
    lit = json.loads(wingtip_native.call("lighting_read", json.dumps({"lighting": lighting, "beacon": beacon})))
    return {
        "lighting": lighting + beacon,
        "lights": lit["systems"],
        "light_notes": lit["notes"],
        "radio": read(radio),
        "standard_keying": lit["standard_keying"],
    }


def pattern_notes(faa_id: str, cache_dir=FAA_CACHE_DIR) -> list[str]:
    """Its remarks on its traffic pattern altitude (APT_RMK's TPA column) in
    words (`read`): most often the heights for other aircraft than
    APT_BASE's one TPA gives -- EDN's "800 FT AGL FOR CAT A AND B ACFT,
    1500 FT AGL FOR CAT C ACFT." -- or the TPA where APT_BASE has none."""
    remarks = _all_remarks(cache_dir).get(faa_id.strip().upper(), [])
    return read([text for column, text, _ in remarks if column == "TPA"])


# Which remarks are about the fuel -- the FAA's own on a fuel type, and
# any that names fuel or the FBO that sells it ("FOR FBO HRS OF OPN CTC
# (785) 628-8881. FOR AFT HRS FUEL CTC FBO.") -- and which about a way
# into town: a courtesy car, as 49 fields' remarks offer one.
_FUEL = re.compile(r"\b(FUEL|FUELING|100LL|JET A|SELF[- ]SERVE?|SELF[- ]SVC|FBO)\b")
_CAR = re.compile(r"\b(COURTESY|CRS|CREW)\s+CARS?\b")


def service_notes(faa_id: str, cache_dir=FAA_CACHE_DIR) -> dict:
    """What an airport's remarks say about its services: `fuel`, each about
    its fuel and its FBO's hours, and `ground`, each that offers a courtesy
    car, in words by the engine (remarks_read: the Chart Supplement's
    Abbreviations and JO 7340.2's contractions written out, codes and
    telephone numbers kept); `fuel_as_written`, the fuel's as sent; and
    `courtesy_car`, whether one is offered."""
    remarks = _all_remarks(cache_dir).get(faa_id.strip().upper(), [])
    fuel, ground = [], []
    for column, text, _ in remarks:
        upper = text.upper()
        if _CAR.search(upper):
            ground.append(text)
        elif column == "FUEL_TYPE" or _FUEL.search(upper):
            fuel.append(text)
    lines = read(fuel + ground)
    return {"fuel": lines[: len(fuel)], "fuel_as_written": fuel, "ground": lines[len(fuel) :], "courtesy_car": bool(ground)}


# Which part of a runway is turf, where the remarks say: the Chart
# Supplement's free text on a runway of two surfaces (APT_RWY's
# SURFACE_TYPE_CODE ASPH-TURF and its like) -- C81's 06/24 "SW 1000 FT
# TURF-GRVL." -- in the wordings most of them use, each part of a remark
# split at its commas and semicolons: "SW 1200 FT TURF", "1200 FT TURF ON
# RWY 27 END", "581 FT BY 100 FT TURF ON S END", "FIRST 300 FT RY 33
# LENGTH IS TURF", and "2000 FT ASPH ON RWY 36 END, REMAINDER TURF".
_TURF = r"TURF(?:-(?:GRVL|DIRT))?|GRASS|SOD"
_SURFACE = rf"(?P<surface>{_TURF}|ASPH(?:ALT)?|CONC(?:RETE)?|GRVL|GRAVEL|DIRT)\b"
#: The compass points a remark names an end of a runway by.
_POINTS = {
    "N": 0,
    "NORTH": 0,
    "NE": 45,
    "E": 90,
    "EAST": 90,
    "SE": 135,
    "S": 180,
    "SOUTH": 180,
    "SW": 225,
    "W": 270,
    "WEST": 270,
    "NW": 315,
}
_POINT = "|".join(sorted(_POINTS, key=len, reverse=True))
_LENGTH = r"(?P<length>\d[\d,]*)\s*FT(?:\s*(?:X|BY)\s*\d+\s*FT)?"
_END = rf"(?:(?:RWY|RY)\s+(?P<end>\d{{1,2}}[LRC]?)|(?P<point>{_POINT}))"
_PARTS = (
    re.compile(rf"^(?P<point>{_POINT})\s+{_LENGTH}\s+{_SURFACE}"),
    re.compile(rf"^(?:FIRST|FST)\s+{_LENGTH}\s+(?:OF\s+)?(?:RWY|RY)\s+(?P<end>\d{{1,2}}[LRC]?)\s+(?:LENGTH\s+)?IS\s+{_SURFACE}"),
    re.compile(rf"^{_LENGTH}\s+{_SURFACE}(?:\s+\w+)*?\s+(?:ON\s+)?(?:THE\s+)?{_END}\s+END\b"),
)
_REMAINDER = re.compile(rf"^(?:REMAINDER|RMNDR)\s+(?:IS\s+)?{_SURFACE}")


def _end_at(point: str, ends: list[str]) -> str | None:
    """The end of a runway a compass point names: the one whose threshold
    lies that way from the runway's middle -- runway 06's at its south-west
    end, its number's heading turned round -- within 67.5 degrees."""
    best, best_off = None, 67.5
    for end in ends:
        number = re.match(r"\d{1,2}", end)
        if not number:
            continue
        off = abs((int(number.group()) * 10 + 180 - _POINTS[point]) % 360)
        off = min(off, 360 - off)
        if off <= best_off:
            best, best_off = end, off
    return best


def _turf_of(remark: str, ends: list[str]) -> list[dict]:
    """The turf a runway's remark puts at its ends (the module's notes on
    `_TURF`): each part as how far along the runway from which end, its far
    edge None where it runs on to the other end."""
    known = []
    rest = None
    for clause in re.split(r"[;,]", remark.upper()):
        clause = re.sub(r"^\s*(?:RWY|RY)\s+[\dLRC]+/?[\dLRC]*\s+", "", clause.strip()).strip(" .")
        if rest_match := _REMAINDER.match(clause):
            rest = rest_match.group("surface")
            continue
        for pattern in _PARTS:
            found = pattern.match(clause)
            if not found:
                continue
            groups = found.groupdict()
            end = groups.get("end")
            end = next((e for e in ends if e.lstrip("0") == end.lstrip("0")), None) if end else _end_at(groups["point"], ends)
            if end:
                known.append((end, int(groups["length"].replace(",", "")), re.fullmatch(_TURF, groups["surface"]) is not None))
            break
    parts = [{"end": end, "from_ft": 0, "to_ft": length} for end, length, turf in known if turf]
    # The rest turf after a length paved from one end: from there on.
    paved = [(end, length) for end, length, turf in known if not turf]
    if rest and re.fullmatch(_TURF, rest) and len(paved) == 1 and not parts:
        parts.append({"end": paved[0][0], "from_ft": paved[0][1], "to_ft": None})
    return parts


def runway_turf(faa_id: str, cache_dir=FAA_CACHE_DIR) -> dict[str, list[dict]]:
    """Which part of each of an airport's runways is turf where the FAA's
    remarks say (`_turf_of`), by the runway's ends as the remarks name it
    ("06/24"): each part from `from_ft` to `to_ft` feet along it from
    `end`, `to_ft` None to the far end. Only the runways it can be read
    for: a runway of one surface has its own (APT_RWY's), and most remarks
    on two surfaces are in these few wordings."""
    turf: dict[str, list[dict]] = {}
    for _column, text, element in _all_remarks(cache_dir).get(faa_id.strip().upper(), []):
        if "/" not in element:
            continue
        parts = _turf_of(text, element.split("/"))
        if parts:
            turf.setdefault(element, []).extend(parts)
    return turf


def preload(cache_dir=FAA_CACHE_DIR) -> None:
    """Reads the remarks now -- 90,000 rows, half a second -- so the first
    airport card after a start does not wait on them."""
    _all_remarks(cache_dir)
