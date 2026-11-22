"""The national CIFP file's index (one read of it: where each airport's
run of records lies, and the fixes, navaids and NDBs no airport owns), an
airport's own records read from its run, and where a leg's fix is. For
wingtip.procedures and wingtip.approach_facts."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from .cifp_records import Leg, _col, _continuation, _navaid_place, _position, _variation
from .single_flight import once
from .engine import ask as engine

#: What a procedure is, by its record's subsection (ARINC 424-18 5.5).
KINDS = {"D": "departure", "E": "arrival", "F": "approach"}


@dataclass
class _Index:
    path: Path
    #: Each airport's run of records: where it starts and how long it is.
    airports: dict[str, tuple[int, int]] = field(default_factory=dict)
    #: Enroute waypoints, VHF navaids and NDBs, by ident: (ICAO code,
    #: section, place) for each of that name.
    fixes: dict[str, list[tuple[str, str, tuple[float, float]]]] = field(default_factory=dict)
    #: Each airport's terminal NDBs, by its ident and theirs: their
    #: places, which the file keeps apart from the airport's run.
    terminal_ndbs: dict[str, dict[str, tuple[float, float]]] = field(default_factory=dict)


@once(maxsize=2)
def _index(path: Path) -> _Index:
    """One read of the national file: each airport's run of records, and
    the fixes no airport owns (measured at about 1.5 s)."""
    index = _Index(path)
    offset = 0
    with path.open("rb") as f:
        for raw in f:
            length = len(raw)
            if raw[:1] == b"S":
                rec = raw.decode("latin-1")
                section = rec[4:6]
                if section == "P ":
                    ident = _col(rec, 7, 10).strip()
                    start, size = index.airports.get(ident, (offset, 0))
                    index.airports[ident] = (start, offset + length - start)
                elif section == "PN":
                    # A terminal NDB is the airport section's with its
                    # subsection in column 6, not 13 -- ARINC 424's section
                    # P, subsection N, as the FAA's file has KDLH's NDB DL:
                    # "SUSAPNKDLHK3 DL" (1 Oct 2026 cycle) -- and the file
                    # keeps them apart from the airports' runs: taken into the run, KDLH's NDB made its run 25 MB
                    # long, every procedure of the airports between read as
                    # Duluth's (2,235 of them, an LDA-C drawn in Los
                    # Angeles) -- 173 fields of the 1 Oct 2026 cycle.
                    if _continuation(rec, 22) and (place := _position(rec)):
                        index.terminal_ndbs.setdefault(_col(rec, 7, 10).strip(), {})[_col(rec, 14, 17).strip()] = place
                elif section in ("EA", "D ", "DB") and _continuation(rec, 22) and (place := _navaid_place(rec)):
                    ident = _col(rec, 14, 18).strip()
                    index.fixes.setdefault(ident, []).append((_col(rec, 20, 21), section, place))
            offset += length
    return index


def _records(ident: str, path: Path) -> tuple[str, list[str]] | None:
    """An airport's run of records, by its ident as the planner has it
    (KBUR) or the FAA's own (BUR, 1C5): the CIFP names a field by its ICAO
    ident, and by the FAA's where it has none (the Readme)."""
    index = _index(path)
    ident = ident.strip().upper()
    for name in engine("field_names", ident=ident):
        if name in index.airports:
            start, size = index.airports[name]
            with path.open("rb") as f:
                f.seek(start)
                return name, f.read(size).decode("latin-1").splitlines()
    return None


@dataclass
class _Airport:
    """An airport's own records: its place and variation, its terminal
    waypoints, NDBs and runways, and its procedures' legs."""

    ident: str
    place: tuple[float, float] | None
    variation: float
    waypoints: dict[str, tuple[float, float]]
    runways: dict[str, tuple[float, float]]
    legs: dict[tuple[str, str], list[Leg]]
    #: Its elevation, feet (ARINC 424-18 5.55, the airport record's
    #: columns 57 to 61).
    elevation_ft: float | None = None


@once(maxsize=64)
def _airport(ident: str, path: Path) -> _Airport | None:
    found = _records(ident, path)
    if not found:
        return None
    name, records = found
    airport = _Airport(name, None, 0.0, dict(_index(path).terminal_ndbs.get(name, {})), {}, {})
    for rec in records:
        sub = _col(rec, 13, 13)
        if sub == "A" and _continuation(rec, 22):
            airport.place = _position(rec)
            airport.variation = _variation(_col(rec, 52, 56)) or 0.0
            elevation = _col(rec, 57, 61).strip()
            airport.elevation_ft = float(elevation) if re.fullmatch(r"-?\d+", elevation) else None
        elif sub in ("C", "N") and _continuation(rec, 22) and (place := _position(rec)):
            airport.waypoints[_col(rec, 14, 18).strip()] = place
        elif sub == "G" and _continuation(rec, 22) and (place := _position(rec)):
            airport.runways[_col(rec, 14, 18).strip()] = place
        elif sub in KINDS and _continuation(rec, 39):
            airport.legs.setdefault((sub, _col(rec, 14, 19).strip()), []).append(Leg.read(rec))
    return airport


def _fix_place(airport: _Airport, ident: str, icao: str, section: str, index: _Index) -> tuple[float, float] | None:
    """Where a leg's fix is: the airport's own terminal waypoint, NDB or
    runway threshold, else the enroute waypoint or navaid of that name in
    that ICAO region."""
    if not ident:
        return None
    if section in ("PC", "PN") and ident in airport.waypoints:
        return airport.waypoints[ident]
    if section == "PG" and ident in airport.runways:
        return airport.runways[ident]
    named = index.fixes.get(ident, [])
    for want in (lambda f: f[0] == icao and f[1] == section, lambda f: f[0] == icao, lambda f: True):
        for found in named:
            if want(found):
                return found[2]
    return airport.waypoints.get(ident) or airport.runways.get(ident)
