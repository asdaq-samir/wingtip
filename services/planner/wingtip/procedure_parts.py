"""The parts a procedure's drawing is made of (wingtip.procedures): what
each kind of coded leg is, a procedure's name as its chart is titled,
which part of it a run of legs is, the engine's arcs, holds and procedure
turns as points, and each fix's roles and limits."""

from __future__ import annotations

import re

from . import geo
from .cifp_records import Leg, altitude_limits
from .engine import ask as engine

#: Legs that end at their fix, and the ones that hold at it (ARINC 424-18
#: 5.21, Attachment 5).
TO_FIX = {"IF", "TF", "CF", "DF", "RF", "AF"}
HOLDS = {"HA", "HF", "HM"}
#: Legs flown from their fix along a course; and on a course or heading
#: from wherever the last one ended, to an altitude, a distance, a radial,
#: an intercept or until vectored: none has a place to end at.
FROM_FIX = {"FA", "FC", "FD", "FM"}
OPEN = {"CA", "CD", "CI", "CR", "VA", "VD", "VI", "VM", "VR"}

#: An approach's kind by its identifier's first letter (ARINC 424-18
#: 5.10, as the FAA codes them: "I08-Y" is the ILS Y to runway 08).
APPROACH_TYPES = {
    "B": "LOC/BC",
    "D": "VOR/DME",
    "G": "IGS",
    "H": "RNAV (RNP)",
    "I": "ILS",
    "J": "GLS",
    "L": "LOC",
    "N": "NDB",
    "P": "GPS",
    "Q": "NDB/DME",
    "R": "RNAV (GPS)",
    "S": "VOR",
    "T": "TACAN",
    "U": "SDF",
    "V": "VOR",
    "X": "LDA",
}
#: A circling approach's, by its first three ("VDM-A" is the VOR/DME-A).
CIRCLING_TYPES = {
    "VOR": "VOR",
    "VDM": "VOR/DME",
    "RNV": "RNAV (GPS)",
    "NDB": "NDB",
    "NDM": "NDB/DME",
    "LOC": "LOC",
    "LBC": "LOC/BC",
    "LDA": "LDA",
    "GPS": "GPS",
    "TAC": "TACAN",
    "SDF": "SDF",
}


def procedure_name(kind: str, ident: str) -> str:
    """A procedure's name as its chart is titled: "I08-Y" is "ILS Y RWY
    08", "VDM-A" "VOR/DME-A"; an arrival or departure is its own
    ("JANNY5")."""
    if kind != "approach":
        return ident
    straight = re.fullmatch(r"([A-Z])(\d\d[LRC]?)-?([A-Z])?", ident)
    if straight and straight.group(1) in APPROACH_TYPES:
        kind_, runway, letter = straight.groups()
        return f"{APPROACH_TYPES[kind_]}{f' {letter}' if letter else ''} RWY {runway}"
    circling = re.fullmatch(r"([A-Z]{3})-?([A-Z])", ident)
    if circling and circling.group(1) in CIRCLING_TYPES:
        return f"{CIRCLING_TYPES[circling.group(1)]}-{circling.group(2)}"
    return ident


def _runway_of(kind: str, ident: str) -> str | None:
    straight = re.fullmatch(r"[A-Z](\d\d[LRC]?)-?[A-Z]?", ident)
    return straight.group(1) if kind == "approach" and straight else None


def _transition_role(kind: str, leg: Leg) -> str:
    """Which part of its procedure a run of legs is: an approach's
    transition (route type "A") or its final; an arrival's or departure's
    runway transition ("RW08", "RW26B", "ALL"), its common route (no
    name), or an enroute transition (the rest)."""
    if kind == "approach":
        return "transition" if leg.route == "A" else "final"
    name = leg.transition
    if not name:
        return "common"
    return "runway" if name.startswith("RW") or name == "ALL" else "transition"


def _points(answer: list) -> list:
    return [(float(lat), float(lon)) for lat, lon in answer]


def _arc(center: tuple[float, float], start: tuple[float, float], end: tuple[float, float], turn: str) -> list:
    """Points along an arc round `center` from `start` to `end`, turning
    right (clockwise) or left: the engine's procedure_arc."""
    return _points(engine("procedure_arc", center=list(center), start=list(start), end=list(end), turn="R" if turn == "R" else "L"))


def _hold(fix: tuple[float, float], inbound: float, turn: str, leg_nm: float) -> list:
    """A holding pattern's racetrack at `fix` (AIM 5-3-8): the engine's
    procedure_hold."""
    return _points(
        engine("procedure_hold", fix=list(fix), inbound_deg=float(inbound), turn="L" if turn == "L" else "R", leg_nm=float(leg_nm))
    )


def _procedure_turn(fix: tuple[float, float], inbound: float, pt_course: float) -> list:
    """A 45°/180° procedure turn at `fix` (AIM 5-4-9): the engine's
    procedure_turn."""
    return _points(engine("procedure_turn", fix=list(fix), inbound_deg=float(inbound), pt_course_deg=float(pt_course)))


def _inbound_at(lines: list, place: tuple[float, float]) -> float | None:
    """The final's true course on from `place`, where a final passes it."""
    for line in lines:
        if line["role"] != "final":
            continue
        pts = line["points"]
        for i, p in enumerate(pts[:-1]):
            if geo.distance_nm(*p, *place) < 0.05:
                return float(geo.bearing_deg(*p, *pts[i + 1]))
    return None


def _course(leg: Leg, variation: float) -> float | None:
    """A leg's course or heading, true."""
    if leg.course is None:
        return None
    return leg.course % 360 if leg.course_true else (leg.course + variation) % 360


def _opposite_end(runway: str) -> str:
    """The far end of a runway, where a departure from it leaves the
    ground: RW08's is RW26, RW17L's RW35R."""
    m = re.fullmatch(r"RW(\d\d)([LRC]?)B?", runway)
    if not m:
        return runway
    number = (int(m.group(1)) + 18 - 1) % 36 + 1
    side = {"L": "R", "R": "L"}.get(m.group(2), m.group(2))
    return f"RW{number:02d}{side}"


def _magnetic(true_deg: float, variation: float) -> float:
    """A true course made magnetic: less an easterly variation, plus a
    westerly one (east positive, as ARINC 424-18 5.39 codes it)."""
    return (true_deg - variation) % 360


def _final_course_between(fixes: dict, variation: float) -> float | None:
    """The final's magnetic course where its missed approach point's leg
    codes none: the bearing from the final approach fix to that point."""
    faf = next((f for f in fixes.values() if "FAF" in f["roles"]), None)
    map_ = next((f for f in fixes.values() if "MAP" in f["roles"]), None)
    if faf is None or map_ is None:
        return None
    return _magnetic(geo.bearing_deg(faf["lat"], faf["lon"], map_["lat"], map_["lon"]), variation)


def _missed_leg(leg: Leg, variation: float) -> dict:
    """A missed approach's leg as its words are made from it: its path and
    terminator (ARINC 424-18 5.21: CA a course to an altitude, VI a
    heading to an intercept, CF a course to a fix, HM a hold), the fix it
    goes to, its course or heading magnetic as the plate gives it, which
    way it turns, and the altitudes it climbs to (altitude_limits)."""
    low, high = altitude_limits(leg)
    course = None
    if leg.course is not None:
        course = round(leg.course if not leg.course_true else _magnetic(leg.course, variation)) % 360 or 360
    return {
        "path": leg.path,
        "fix": leg.fix or None,
        "course_deg": course,
        "turn": leg.turn if leg.turn in ("L", "R") else None,
        "min_ft": low,
        "max_ft": high,
    }


def _note_fix(fixes: dict, leg: Leg, place: tuple[float, float], missed: bool) -> None:
    """A fix of the drawing, once however often it is crossed: its roles,
    and the limits it is crossed at last -- a transition's fix where the
    final starts is labelled with the final's -- and its speed limit."""
    low, high = altitude_limits(leg)
    at = fixes.setdefault(
        leg.fix,
        {
            "ident": leg.fix,
            "lat": round(place[0], 6),
            "lon": round(place[1], 6),
            "roles": [],
            "min_ft": None,
            "max_ft": None,
            "speed_kt": None,
            "speed_limit": None,
            "missed": missed,
            "vertical_angle_deg": None,
        },
    )
    if leg.vertical_angle is not None and not missed:
        at["vertical_angle_deg"] = abs(leg.vertical_angle)
    for role in _fix_roles(leg):
        if role not in at["roles"]:
            at["roles"].append(role)
    # Not at the missed approach point: its coded altitude is the
    # threshold's crossing height or the minimums', which the chart gives
    # in its minimums, not at the fix.
    if (low is not None or high is not None) and not leg.missed_approach_point:
        at["min_ft"], at["max_ft"] = low, high
    if leg.speed_kt:
        at["speed_kt"] = leg.speed_kt
        # ARINC 424-18 5.261: "+" at or above, "-" at or below, blank at.
        at["speed_limit"] = {"+": "min", "-": "max"}.get(leg.speed_code, "at")
    at["missed"] = at["missed"] and missed


def _fix_roles(leg: Leg) -> list[str]:
    """What a fix is on its approach, by its waypoint description's
    fourth character (ARINC 424-18 5.17): an initial approach fix (A, C
    with a hold, D also the final approach course fix), an intermediate
    fix (B), the final approach course fix (I), the final approach fix,
    the missed approach point; and a hold where its leg holds."""
    roles = {"A": ["IAF"], "B": ["IF"], "C": ["IAF"], "D": ["IAF", "FACF"], "I": ["FACF"], "F": ["FAF"], "M": ["MAP"]}.get(
        leg.description[3:4], []
    )
    return [*roles, "hold"] if leg.path in HOLDS else roles
