"""The CIFP's records as ARINC 424-18 writes them, read: their columns,
places, variations, angles and altitudes, and a procedure's leg (Leg) with
the altitudes a fix is crossed at (altitude_limits). wingtip.procedures
reads an airport's procedures with them, wingtip.cifp_index the file's
index and wingtip.approach_facts an approach's runway."""

from __future__ import annotations

import re
from dataclasses import dataclass


def _col(rec: str, first: int, last: int) -> str:
    """Columns `first` to `last` of a record, as ARINC 424 numbers them
    (from 1, both ends in)."""
    return rec[first - 1 : last]


def _angle(text: str, degrees: int) -> float | None:
    """A latitude ("N34120381") or longitude ("W118364189"): hemisphere,
    degrees, minutes, seconds to hundredths (ARINC 424-18 5.36, 5.37)."""
    text = text.strip()
    if len(text) != 1 + degrees + 6 or text[0] not in "NSEW":
        return None
    d, m, s = int(text[1 : 1 + degrees]), int(text[1 + degrees : 3 + degrees]), int(text[3 + degrees :]) / 100
    value = d + m / 60 + s / 3600
    return -value if text[0] in "SW" else value


def _position(rec: str) -> tuple[float, float] | None:
    """A waypoint's, a navaid's, a runway's or an airport's place: its
    latitude in columns 33-41 and its longitude in 42-51."""
    lat, lon = _angle(_col(rec, 33, 41), 2), _angle(_col(rec, 42, 51), 3)
    return None if lat is None or lon is None else (lat, lon)


def _variation(text: str) -> float | None:
    """A magnetic variation, east positive: "E0120" is 12.0° east (5.39)."""
    text = text.strip()
    if len(text) != 5 or text[0] not in "EW" or not text[1:].isdigit():
        return None
    value = int(text[1:]) / 10
    return value if text[0] == "E" else -value


def _tenths(text: str) -> float | None:
    text = text.strip()
    return int(text) / 10 if text.isdigit() else None


def _vertical_angle(text: str) -> float | None:
    """A vertical angle in hundredths of a degree, signed: "-300" is a
    3.00° descent (ARINC 424-18 5.70)."""
    text = text.strip()
    return int(text) / 100 if re.fullmatch(r"[+-]?\d{3}", text) else None


def _feet(text: str) -> int | None:
    """An altitude field: feet ("04600"), or a flight level ("FL180")."""
    text = text.strip()
    if text.startswith("FL") and text[2:].isdigit():
        return int(text[2:]) * 100
    return int(text) if text.isdigit() else None


@dataclass
class Leg:
    """One leg of a procedure, as its primary record codes it (ARINC
    424-18 4.1.9.1)."""

    route: str
    transition: str
    seq: int
    fix: str
    fix_icao: str
    fix_section: str
    description: str
    turn: str
    path: str
    navaid: str
    arc_nm: float | None
    theta: float | None
    rho: float | None
    #: The course or heading flown, degrees magnetic unless `course_true`.
    course: float | None
    course_true: bool
    distance_nm: float | None
    minutes: float | None
    altitude_code: str
    altitude1: int | None
    altitude2: int | None
    speed_kt: int | None
    speed_code: str
    center: str
    center_icao: str
    center_section: str
    #: The vertical path's angle, degrees, negative descending: an
    #: approach's glidepath, coded on its final approach fix and its
    #: missed approach point (ARINC 424-18 5.70).
    vertical_angle: float | None = None

    @classmethod
    def read(cls, rec: str) -> Leg:
        course = _col(rec, 71, 74).strip()
        held = _col(rec, 75, 78).strip()
        return cls(
            route=_col(rec, 20, 20),
            transition=_col(rec, 21, 25).strip(),
            seq=int(_col(rec, 27, 29) or 0),
            fix=_col(rec, 30, 34).strip(),
            fix_icao=_col(rec, 35, 36),
            fix_section=_col(rec, 37, 38),
            description=_col(rec, 40, 43),
            turn=_col(rec, 44, 44).strip(),
            path=_col(rec, 48, 49),
            navaid=_col(rec, 51, 54).strip(),
            arc_nm=int(_col(rec, 57, 62)) / 1000 if _col(rec, 57, 62).strip().isdigit() else None,
            theta=_tenths(_col(rec, 63, 66)),
            rho=_tenths(_col(rec, 67, 70)),
            # "0789" is 078.9° magnetic; "264T" 264° true (5.26).
            course=(int(course[:3]) if course.endswith("T") and course[:3].isdigit() else _tenths(course)),
            course_true=course.endswith("T"),
            # A hold's leg: "0050" five miles, "T010" one minute (5.27).
            distance_nm=_tenths(held),
            minutes=_tenths(held[1:]) if held.startswith("T") else None,
            altitude_code=_col(rec, 83, 83),
            altitude1=_feet(_col(rec, 85, 89)),
            altitude2=_feet(_col(rec, 90, 94)),
            speed_kt=int(_col(rec, 100, 102)) if _col(rec, 100, 102).strip().isdigit() else None,
            speed_code=_col(rec, 118, 118).strip(),
            center=_col(rec, 107, 111).strip(),
            center_icao=_col(rec, 113, 114),
            center_section=_col(rec, 115, 116),
            vertical_angle=_vertical_angle(_col(rec, 103, 106)),
        )

    @property
    def missed_approach_point(self) -> bool:
        """The approach's missed approach point: its waypoint
        description's fourth character "M" (5.17)."""
        return self.description[3:4] == "M"


def altitude_limits(leg: Leg) -> tuple[int | None, int | None]:
    """The lowest and highest altitude a fix is to be crossed at, by its
    altitude description (ARINC 424-18 5.29): "+" at or above the first
    altitude, "-" at or below it, blank at it, "B" between the second
    (at or above) and the first (at or below). On an approach, "G" and
    "I" are at the first altitude and "H", "J" and "V" at or above it,
    the second being the glide slope's or the vertical path's altitude
    there; "X" is at it and "Y" at or below it. (None, None) where there
    is no limit."""
    code, first, second = leg.altitude_code, leg.altitude1, leg.altitude2
    if first is None:
        return None, None
    if code and code in "+HJV":
        return first, None
    if code and code in "-Y":
        return None, first
    if code == "B":
        return second, first
    if code == "C":
        return second, None
    return first, first


def _continuation(rec: str, column: int) -> bool:
    """A primary record (continuation number 0 or 1), not a continuation."""
    return _col(rec, column, column) in ("0", "1")


def _navaid_place(rec: str) -> tuple[float, float] | None:
    """A navaid's place: its VOR's (or NDB's), or a DME's alone where
    there is no VOR (columns 56-64 and 65-74, ARINC 424-18 4.1.2.1)."""
    place = _position(rec)
    if place:
        return place
    lat, lon = _angle(_col(rec, 56, 64), 2), _angle(_col(rec, 65, 74), 3)
    return None if lat is None or lon is None else (lat, lon)
