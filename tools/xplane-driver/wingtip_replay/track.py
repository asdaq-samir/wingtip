"""The flight the plugin replays, read from the X-Plane 12 flight data
recorder file (.fdr, version 4) that the Studio's "Export for simulator"
menu writes (apps/web/src/lib/replay/simExport/fdr.ts). The plugin reads the
same file X-Plane would load, so there is one file for both ways of
replaying it: X-Plane's own FDR replay, or the plugin placing the airplane
itself (PI_wingtip_replay.py).

Plain Python, with no X-Plane module, so the tests run it anywhere. The
path between rows is not smoothed again here: the engine's sim_flight
already made the rows a smooth curve through the reports, ten a second, so
the plugin only goes in a straight line between two neighbouring rows, as
X-Plane does with an FDR. Two rows further apart than GAP_S are a gap, and
nothing is drawn across it.
"""

from __future__ import annotations

import bisect
import math
import re
from dataclasses import dataclass

#: Rows further apart than this, s, are a gap: the export writes ten a
#: second (FRAME_HZ in simExport/flight.ts), so a missing second is no
#: longer the smooth path between reports.
GAP_S = 1.0

#: A UTC clock time as the export writes it, HH:MM:SS.ss.
_CLOCK = re.compile(r"^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d+)?)$")

#: A day in seconds: a row whose clock is half a day before the last one
#: has crossed midnight UTC (the export writes the time of day only).
_DAY_S = 86400.0


@dataclass(frozen=True)
class Frame:
    """One row: time from the first row (s), position, altitude (ft, as the
    file's COMM line says: MSL, or pressure altitude where the airplane sent
    no altimeter setting), the file's magnetic heading, pitch and roll
    (degrees), and the values of the file's DREF columns in order."""

    t: float
    lat: float
    lon: float
    alt_ft: float
    heading_mag: float
    pitch: float
    roll: float
    extra: tuple[float, ...]


@dataclass(frozen=True)
class Pose:
    """The airplane at a moment: the frame's fields between two rows, with
    the true course of the path there (degrees, None where it is standing
    still and the path says nothing)."""

    t: float
    lat: float
    lon: float
    alt_ft: float
    heading_mag: float
    pitch: float
    roll: float
    course_true: float | None
    extra: tuple[float, ...]


@dataclass(frozen=True)
class Flight:
    """A parsed file: its header records, the rows, and the runs of rows
    with no gap between them, each (first index, last index)."""

    acft: str | None
    tail: str | None
    date: str | None
    pres_inhg: float | None
    drefs: tuple[str, ...]
    #: The first row's UTC time of day, s: where the sim's clock is set.
    start_clock_s: float
    frames: tuple[Frame, ...]
    runs: tuple[tuple[int, int], ...]

    @property
    def duration_s(self) -> float:
        return self.frames[-1].t if self.frames else 0.0

    def run_times(self) -> list[tuple[float, float]]:
        """Each run's (start, end), s from the first row."""
        return [(self.frames[a].t, self.frames[b].t) for a, b in self.runs]

    def sample(self, t: float) -> Pose | None:
        """The airplane at `t`: in a straight line between the rows either
        side, or None outside the flight or in a gap (it is not known to
        have been anywhere then, so it is drawn nowhere)."""
        here = self._between(t)
        if here is None:
            return None
        a, b, f = here
        return Pose(
            t=t,
            lat=_lerp(a.lat, b.lat, f),
            lon=_lerp(a.lon, b.lon, f),
            alt_ft=_lerp(a.alt_ft, b.alt_ft, f),
            heading_mag=_lerp_angle(a.heading_mag, b.heading_mag, f),
            pitch=_lerp(a.pitch, b.pitch, f),
            roll=_lerp(a.roll, b.roll, f),
            course_true=self._course(t),
            extra=(a if f < 0.5 else b).extra,
        )

    def _between(self, t: float) -> tuple[Frame, Frame, float] | None:
        for a_i, b_i in self.runs:
            first, last = self.frames[a_i], self.frames[b_i]
            if first.t <= t <= last.t:
                if a_i == b_i:
                    return first, first, 0.0
                times = [f.t for f in self.frames[a_i : b_i + 1]]
                j = min(max(bisect.bisect_right(times, t) - 1, 0), len(times) - 2)
                a, b = self.frames[a_i + j], self.frames[a_i + j + 1]
                return a, b, (t - a.t) / (b.t - a.t)
        return None

    def _course(self, t: float, half_s: float = 0.5) -> float | None:
        """The path's true course at `t`, from the point half a second
        before to half a second after, both in the same run. The export's
        heading column is this course made magnetic (no wind is known, so
        the heading is the track), so the plugin takes the course from the
        path and needs no magnetic variation of its own."""
        for a_i, b_i in self.runs:
            lo, hi = self.frames[a_i].t, self.frames[b_i].t
            if lo <= t <= hi:
                p, q = self._between(max(lo, t - half_s)), self._between(min(hi, t + half_s))
                if p is None or q is None:
                    return None
                return _course(_point(*p), _point(*q))
        return None


def _point(a: Frame, b: Frame, f: float) -> tuple[float, float]:
    return _lerp(a.lat, b.lat, f), _lerp(a.lon, b.lon, f)


def _lerp(a: float, b: float, f: float) -> float:
    return a + (b - a) * f


def _lerp_angle(a: float, b: float, f: float) -> float:
    """Between two headings the short way round, 0 to 360."""
    return (a + wrap180(b - a) * f) % 360.0


def wrap180(deg: float) -> float:
    """An angle as -180 to 180."""
    return (deg + 180.0) % 360.0 - 180.0


#: Below this, m, two points are the same place and give no course.
_STILL_M = 0.5
_EARTH_M = 6371008.8  # the mean Earth radius (IUGG), for the still test only


def _course(p: tuple[float, float], q: tuple[float, float]) -> float | None:
    """The initial great-circle bearing from p to q, degrees true (the
    spherical formula; over half a second the sphere's error is nothing),
    or None where they are the same place."""
    lat1, lon1, lat2, lon2 = map(math.radians, (p[0], p[1], q[0], q[1]))
    dlon = lon2 - lon1
    north = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    east = math.sin(dlon) * math.cos(lat2)
    if math.hypot(north, east) * _EARTH_M < _STILL_M:
        return None
    return math.degrees(math.atan2(east, north)) % 360.0


def _clock_s(text: str) -> float | None:
    m = _CLOCK.match(text.strip())
    if not m:
        return None
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))


def parse_fdr(text: str, gap_s: float = GAP_S) -> Flight:
    """The file's header and rows. Rows are version 4's: a UTC clock time,
    longitude, latitude, altitude, heading, pitch, roll, then one column a
    DREF line. A clock that runs back by more than half a day has crossed
    midnight and goes on into the next day; a row at or before the last
    one's time is left out."""
    head: dict[str, str] = {}
    drefs: list[str] = []
    frames: list[Frame] = []
    start: float | None = None
    day = 0.0
    last_clock: float | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        fields = [f.strip() for f in line.split(",")]
        key = fields[0].upper()
        if key == "DATA":
            fields = fields[1:]
        clock = _clock_s(fields[0])
        if clock is None:
            if key == "DREF" and len(fields) > 1:
                drefs.append(re.split(r"\s+", fields[1])[0])
            elif key in ("ACFT", "TAIL", "DATE", "PRES") and len(fields) > 1:
                head[key] = ",".join(fields[1:]).strip()
            continue
        if last_clock is not None and clock < last_clock - _DAY_S / 2:
            day += _DAY_S
        last_clock = clock
        absolute = clock + day
        if start is None:
            start = absolute
        t = absolute - start
        if frames and t <= frames[-1].t:
            continue
        numbers = [float(v) for v in fields[1:]]
        lon, lat, alt, hdg, pitch, roll = numbers[:6]
        frames.append(Frame(t, lat, lon, alt, hdg % 360.0, pitch, roll, tuple(numbers[6:])))
    runs: list[tuple[int, int]] = []
    for i, frame in enumerate(frames):
        if runs and frame.t - frames[i - 1].t <= gap_s:
            runs[-1] = (runs[-1][0], i)
        else:
            runs.append((i, i))
    pres = head.get("PRES")
    return Flight(
        acft=head.get("ACFT"),
        tail=head.get("TAIL"),
        date=head.get("DATE"),
        pres_inhg=float(pres) if pres else None,
        drefs=tuple(drefs),
        start_clock_s=(start or 0.0) % _DAY_S,
        frames=tuple(frames),
        runs=tuple(runs),
    )
