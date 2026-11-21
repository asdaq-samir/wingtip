"""An airport's instrument procedures -- its approaches, its arrivals
(STARs) and its departures (SIDs) -- from the FAA's Coded Instrument
Flight Procedures (CIFP): the file a GPS's database is built from, in
ARINC 424-18's 132-column records, published with each 28-day AIRAC
cycle (FAA Aeronautical Information Services, "CIFP Readme").

Each procedure is drawn as its chart draws it, for the map: its fixes in
order, a line along its legs, its holds, and the altitude and speed each
fix is to be crossed at. A sketch from the coded legs, not the chart: the
legs that end at no fix (a climb on a course to an altitude, a heading to
intercept) end where a turn would, and a hold is drawn the size a light
airplane flies it.

The national file (53 MB) is downloaded once a cycle and read once: an
index of where each airport's records lie, and the fixes, navaids and
NDBs that are not an airport's own. An airport's procedures are read
from its own run of records when asked for.

The records are read by wingtip.cifp_records, the file's index kept by
wingtip.cifp_index, and the parts a drawing is made of are
wingtip.procedure_parts'; this fetches the cycle's file and walks a
procedure's legs.
"""

from __future__ import annotations

import logging
import os
import tempfile
import threading
from datetime import date, datetime
from pathlib import Path

from . import apra, data_cycles, geo
from .cifp_index import KINDS, _airport, _fix_place, _index
from .cifp_records import Leg, altitude_limits
from .config import DATA_DIR
from .engine import ask as engine
from .faa_data import download_and_extract
from .procedure_parts import (
    FROM_FIX,
    HOLDS,
    OPEN,
    TO_FIX,
    _arc,
    _course,
    _final_course_between,
    _hold,
    _inbound_at,
    _magnetic,
    _missed_leg,
    _note_fix,
    _opposite_end,
    _procedure_turn,
    _runway_of,
    _transition_role,
    procedure_name,
)

log = logging.getLogger(__name__)

CIFP_DIR = DATA_DIR / "raw" / "faa_cifp"
#: The cycle's zip by its start, where APRA names none (wingtip.apra).
CIFP_URL = "https://aeronav.faa.gov/Upload_313-d/cifp/CIFP_{start:%y%m%d}.zip"
CIFP_FILE = "FAACIFP18"

#: How a leg is drawn -- an RF or AF leg's arc, a hold's racetrack at a
#: light airplane's 120 kt (AIM 5-3-8), a procedure turn (AIM 5-4-9), how
#: far a leg with no fix to end at goes, a climb's at 200 ft a nm (FAA
#: Order 8260.3) -- is the engine's (engine/crates/procedures/src/paths.rs
#: and legs.rs: procedure_arc, procedure_hold, procedure_turn,
#: procedure_leg_nm, procedure_hold_leg_nm, #482 phase 4b); this reads the
#: CIFP and walks its legs.

_LOCK = threading.Lock()


def cifp_start(on: date | datetime | None = None) -> date:
    """The date the AIRAC cycle in force at `on` (now, to the minute: from
    0901Z on its date) took effect: the CIFP is on the 28-day AIRAC cycle
    (the engine's `data_cycle`)."""
    return data_cycles.start_on("airac", on)


def cifp_path(on: date | datetime | None = None) -> Path:
    """The cycle's FAACIFP18, downloaded the first time it is asked for.
    The newest one on disk of a cycle already begun while the cycle's own
    cannot be had: the FAA posts it a few weeks ahead, and the next cycle
    is fetched ahead too (`stage_next`), so that is rare and short. Never
    one still to come: the next cycle's file staged beside it was taken as
    "the newest" and read before its 0901Z. Say which cycle the answer is
    from with `cifp_cycle`, and whether it is out of date with `cifp_stale`."""
    start = cifp_start(on)
    folder = CIFP_DIR / f"{start:%y%m%d}"
    path = folder / CIFP_FILE
    if path.exists():
        return path
    with _LOCK:
        if not path.exists():
            try:
                _fetch(apra.cifp_url(start) or CIFP_URL.format(start=start), folder)
            except RuntimeError:
                held = held_before(start)
                if held is None:
                    raise
                log.warning("The CIFP for %s could not be had; using %s", start, held.parent.name)
                return held
    return path


def held_before(start: date) -> Path | None:
    """The newest CIFP on disk of a cycle that started by `start`: the one
    to fall back on, never a staged next cycle's."""
    begun = [p for p in CIFP_DIR.glob(f"*/{CIFP_FILE}") if (data_cycles.cifp_effective(p.parent.name) or date.max) <= start]
    return max(begun, key=lambda p: p.parent.name, default=None)


def _fetch(url: str, folder: Path) -> None:
    """Extract into a folder of its own and move the file into place whole,
    so a request that comes while the 53 MB is being written does not
    find it there, cut short, and index it for good. The folder's name is
    its own (mkdtemp), so the planner and a job fetching at once do not
    write into, or delete, each other's."""
    folder.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=folder.parent, prefix=f".{folder.name}.") as work:
        download_and_extract(url, Path(work), only={CIFP_FILE})
        found = next(Path(work).rglob(CIFP_FILE), None)
        if found is None:
            raise RuntimeError(f"{url} has no {CIFP_FILE}")
        os.replace(found, folder / CIFP_FILE)


def cifp_cycle(path: Path) -> str:
    """The cycle ("261001") the file at `path` is of, which is its
    folder's name -- the one in force unless the fallback was used."""
    return path.parent.name


def cifp_stale(path: Path, on: date | datetime | None = None) -> bool:
    """Whether `path` is of a cycle other than the one in force (the
    engine's `data_cycle`): its fixes, altitudes and whole procedures may
    have changed since."""
    return data_cycles.cycle("airac", data_cycles.cifp_effective(cifp_cycle(path)), on)["state"] != "in_force"


def procedures_at(ident: str, on: date | None = None) -> dict | None:
    """The airport's procedures, for the planner's list: each one's kind,
    identifier, name, runway (an approach's) and the transitions a pilot
    picks from -- an approach's, an arrival's or departure's enroute ones.
    None where the CIFP has no such airport."""
    path = cifp_path(on)
    airport = _airport(ident, path)
    if airport is None:
        return None
    found = []
    for (sub, proc), legs in airport.legs.items():
        kind = KINDS[sub]
        transitions = sorted({leg.transition for leg in legs if leg.transition and _transition_role(kind, leg) == "transition"})
        runways = sorted({leg.transition for leg in legs if _transition_role(kind, leg) == "runway"})
        found.append(
            {
                "kind": kind,
                "id": proc,
                "name": procedure_name(kind, proc),
                "runway": _runway_of(kind, proc),
                "transitions": transitions,
                "runway_transitions": runways,
            }
        )
    order = {"approach": 0, "arrival": 1, "departure": 2}
    found.sort(key=lambda p: (order[p["kind"]], p["runway"] or "", p["name"]))
    return {"airport": airport.ident, "cycle": cifp_cycle(path), "stale": cifp_stale(path, on), "procedures": found}


def airport_place(ident: str, on: date | None = None) -> tuple[float, float] | None:
    """The airport's reference point, (lat, lon), as its CIFP airport
    record has it (ARINC 424-18 4.1.7); None where the CIFP has no such
    airport."""
    airport = _airport(ident, cifp_path(on))
    return airport.place if airport else None


# --- drawing it -------------------------------------------------------------


def procedure_drawing(ident: str, procedure: str, transition: str | None = None, on: date | None = None) -> dict | None:
    """One procedure drawn, with the transition picked: its lines, its
    holds and its fixes, each fix with its role and the altitudes and
    speed it is crossed at. An approach is its transition, then its final
    to the missed approach point, then the missed approach (`missed`); an
    arrival its enroute transition, its common route and every runway
    transition; a departure every runway transition, its common route and
    its enroute transition. None where there is no such procedure."""
    path = cifp_path(on)
    airport = _airport(ident, path)
    if airport is None:
        return None
    found = next(((sub, legs) for (sub, proc), legs in airport.legs.items() if proc == procedure.upper()), None)
    if found is None:
        return None
    sub, legs = found
    kind = KINDS[sub]
    index = _index(path)
    runs: dict[tuple[str, str], list[Leg]] = {}
    for leg in sorted(legs, key=lambda leg: (leg.route, leg.transition, leg.seq)):
        runs.setdefault((leg.route, leg.transition), []).append(leg)
    roles = {key: _transition_role(kind, run[0]) for key, run in runs.items()}
    wanted = (transition or "").upper()
    order = {
        "approach": ("transition", "final"),
        "arrival": ("transition", "common", "runway"),
        "departure": ("runway", "common", "transition"),
    }[kind]
    chosen = [key for role in order for key, r in roles.items() if r == role and (r != "transition" or key[1] == wanted)]

    lines, holds, fixes = [], [], {}
    runway_path = None
    turns: list[tuple[str, tuple[float, float], float, bool]] = []
    # What a pilot briefs from the plate and the coded legs alone give:
    # the final's glidepath and course, and the missed approach's legs in
    # order (FAA-H-8083-16B, chapter 4, the approach briefing).
    glidepath: float | None = None
    final_course: float | None = None
    missed_legs: list[dict] = []
    for key in chosen:
        role = roles[key]
        missed = False
        points: list = []

        def flush() -> None:
            if len(points) > 1:
                lines.append({"role": "missed" if missed else role, "name": key[1] or None, "points": list(points)})

        # A departure's runway transition leaves from its runway's far end.
        pos = None
        # The altitude the airplane is known to be at, for a leg flown to an
        # altitude: the field's leaving it, then each fix's as it is crossed.
        known_ft = airport.elevation_ft if kind == "departure" and role == "runway" else None
        if kind == "departure" and role == "runway":
            pos = airport.runways.get(_opposite_end(key[1])) or airport.runways.get(key[1]) or airport.place

        def leg_nm(leg: Leg) -> float:
            """How far a leg with no fix to end at is drawn -- an FC leg's
            distance, a climb's from the altitude known at its start: the
            engine's procedure_leg_nm."""
            return float(
                engine("procedure_leg_nm", path=leg.path, distance_nm=leg.distance_nm, altitude_ft=leg.altitude1, known_ft=known_ft)
            )

        for leg in runs[key]:
            place = _fix_place(airport, leg.fix, leg.fix_icao, leg.fix_section, index)
            course = _course(leg, airport.variation)
            if kind == "approach" and missed:
                missed_legs.append(_missed_leg(leg, airport.variation))
            elif kind == "approach" and role == "final":
                if leg.vertical_angle is not None:
                    glidepath = abs(leg.vertical_angle)
                if leg.missed_approach_point and course is not None:
                    final_course = _magnetic(course, airport.variation)
            if leg.path == "IF" and place:
                flush()
                points = [place]
            elif leg.path in TO_FIX and place:
                start = points[-1] if points else pos
                if not points:
                    points = [start] if start else []
                if leg.path in ("RF", "AF") and start:
                    # Round the arc's centre fix (RF), or the DME's navaid (AF).
                    rf = leg.path == "RF"
                    center = _fix_place(
                        airport, leg.center if rf else leg.navaid, leg.center_icao if rf else "", leg.center_section if rf else "", index
                    )
                    points.extend(_arc(center, start, place, leg.turn) if center else [place])
                else:
                    points.append(place)
            elif leg.path in HOLDS and place and course is not None:
                minutes = leg.minutes if leg.minutes is not None else (None if leg.distance_nm else 1.0)
                leg_nm = engine("procedure_hold_leg_nm", minutes=minutes, distance_nm=leg.distance_nm)
                holds.append(
                    {
                        "fix": leg.fix,
                        "turn": leg.turn or "R",
                        "inbound_deg": round(course),
                        "missed": missed,
                        "leg_nm": round(leg_nm, 2),
                        "points": _hold(place, course, leg.turn, leg_nm),
                    }
                )
                if not points:
                    points = [place]
            elif leg.path in FROM_FIX and place and course is not None:
                if not points or points[-1] != place:
                    points.append(place)
                points.append(geo.destination_point(*place, course, leg_nm(leg)))
            elif leg.path == "PI" and place and course is not None:
                # A procedure turn at the fix, drawn once the final's course
                # into it is known (below).
                turns.append((leg.fix, place, course, missed))
            elif leg.path in OPEN and course is not None and (points or pos):
                start = points[-1] if points else pos
                if not points:
                    points = [start]
                points.append(geo.destination_point(*start, course, leg_nm(leg)))
            pos = points[-1] if points else (place or pos)
            if place and leg.fix:
                _note_fix(fixes, leg, place, missed)
            low, high = altitude_limits(leg)
            if (low is not None or high is not None) and not leg.missed_approach_point:
                known_ft = low if low is not None else high
            if (
                kind == "approach"
                and leg.missed_approach_point
                and leg.vertical_angle
                and place
                and leg.altitude1 is not None
                and leg.fix.startswith("RW")
            ):
                # The path the final comes down, placed for the debrief to
                # measure a track against: its angle into a runway's
                # threshold, crossed at the MAP's coded altitude -- the
                # threshold's elevation and its crossing height (ARINC 424-18
                # 5.70; the chart's GS/VDA and TCH). KBUR's ILS 08: 3.00° to
                # 787 ft at RW08. None where the MAP is not a runway's.
                runway_path = {
                    "deg": abs(leg.vertical_angle),
                    "fix": leg.fix,
                    "lat": round(place[0], 6),
                    "lon": round(place[1], 6),
                    "ft": leg.altitude1,
                }
            if kind == "approach" and leg.missed_approach_point:
                # The rest is the missed approach, drawn dashed from here,
                # its climb from about the field's elevation.
                flush()
                missed = True
                points = points[-1:]
                known_ft = airport.elevation_ft
        flush()

    # Each procedure turn, on the side the chart puts its barb, from the
    # final's course in from the fix: drawn as a hold is, and flown as drawn
    # (wingtip.procedure_paths), where El Dorado's ILS 22 via ELD was a teardrop
    # the map did not show (the owner's "not flying the approach as drawn",
    # 2026-10-19).
    for ident, place, pt_course, was_missed in turns:
        inbound = _inbound_at(lines, place)
        if inbound is not None:
            barb = ((pt_course - (inbound + 180) + 540) % 360) - 180
            holds.append(
                {
                    "fix": ident,
                    "turn": "L" if barb > 0 else "R",
                    "inbound_deg": round(inbound),
                    "missed": was_missed,
                    "kind": "procedure turn",
                    "points": _procedure_turn(place, inbound, pt_course),
                }
            )

    # Where a straight-in approach lands: its runway's threshold, where its
    # missed approach point is short of it (a VOR's or a LOC's MAP a mile
    # out); none for a circling approach.
    runway = _runway_of(kind, procedure.upper())
    threshold = airport.runways.get(f"RW{runway}") if runway else None
    if kind == "approach" and final_course is None:
        final_course = _final_course_between(fixes, airport.variation)
    return {
        "airport": airport.ident,
        "kind": kind,
        "id": procedure.upper(),
        "name": procedure_name(kind, procedure.upper()),
        "glidepath_deg": glidepath,
        "final_course_deg": None if final_course is None else round(final_course) % 360 or 360,
        "missed_legs": missed_legs,
        "threshold": None if threshold is None else [round(threshold[0], 6), round(threshold[1], 6)],
        "transition": wanted or None,
        "cycle": cifp_cycle(path),
        "stale": cifp_stale(path, on),
        "lines": [{**ln, "points": [[round(p[0], 6), round(p[1], 6)] for p in ln["points"]]} for ln in lines],
        "holds": [{**h, "points": [[round(p[0], 6), round(p[1], 6)] for p in h["points"]]} for h in holds],
        "fixes": list(fixes.values()),
        "runway_path": runway_path,
    }
