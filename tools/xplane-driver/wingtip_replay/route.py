"""The test flight's path in time (docs/SIM-FLIGHT.md): its points in order
(tools/sim-flight's flight file, written into Output/wingtip/flight.json),
flown leg by leg at each point's speed, climbing as soon as a point above
asks for it and descending late enough to cross a point below at its
height, as a pilot flies an autopilot's vertical speed to a fix. Plain
Python, for the tests; flight.py places the airplane from it or flies
X-Plane's autopilot along it.

Heights are metres above sea level and speeds metres a second, as the
flight file has them. Between two points the place is a straight line in
latitude and longitude, and a leg's length is what X-Plane's local frame
says it is (flight.py measures it there), so nothing here works out a
distance on the earth: over a leg of 50 nm the straight line in degrees
is within tens of metres of the great circle, which a test flight does
not mind.
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass

#: The table's step, s.
STEP_S = 0.2
#: The least speed on a leg that goes anywhere, m/s: a leg that starts at
#: rest (the take-off roll) starts moving at once.
CREEP_MPS = 1.0


@dataclass(frozen=True)
class Point:
    name: str
    phase: str
    ground: bool
    lat: float
    lon: float
    alt_m: float
    speed_mps: float


@dataclass(frozen=True)
class Sample:
    """The flight at `t`: on leg `leg` (from point leg to leg + 1) at
    `frac` of it, `s_m` from the start, at `alt_m`, moving at `speed_mps`
    and climbing at `vs_mps`."""

    t: float
    leg: int
    frac: float
    s_m: float
    alt_m: float
    speed_mps: float
    vs_mps: float
    phase: str
    resting: bool = False


def points_of(spec: dict) -> list[Point]:
    """The flight file's points, each where it is: a point at a place
    `fraction` of the way to another (a lift-off along the runway) is put
    there. A point with no height is on the ground at its own place's."""
    out = []
    for p in spec["points"]:
        lat, lon = p["lat"], p["lon"]
        if "toward_lat" in p:
            f = float(p.get("fraction", 0.0))
            lat, lon = lat + (p["toward_lat"] - lat) * f, lon + (p["toward_lon"] - lon) * f
        alt = p.get("alt_m")
        out.append(
            Point(p["name"], p["phase"], bool(p.get("ground")), lat, lon, float(alt if alt is not None else 0.0), float(p["speed_mps"]))
        )
    return out


def place(points: list[Point], leg: int, frac: float) -> tuple[float, float]:
    """Latitude and longitude `frac` of the way along leg `leg`."""
    a, b = points[leg], points[min(leg + 1, len(points) - 1)]
    return a.lat + (b.lat - a.lat) * frac, a.lon + (b.lon - a.lon) * frac


def _speed(a: Point, b: Point, d: float, length: float) -> float:
    """Even acceleration over the leg's distance: v^2 eases from a's to b's."""
    f = 0.0 if length <= 0 else min(1.0, d / length)
    v2 = a.speed_mps**2 + (b.speed_mps**2 - a.speed_mps**2) * f
    return max(CREEP_MPS, v2**0.5) if max(a.speed_mps, b.speed_mps) > 0 else 0.0


def _height(a: Point, b: Point, h: float, d: float, length: float, v: float, climb: float, descent: float, dt: float) -> float:
    """The height a step on: along the ground between two ground points;
    down a straight line onto a ground point (the flare); climbing at once
    to a point above; descending only once the rest of the leg at this
    speed is no longer than the descent at `descent` takes."""
    f = 0.0 if length <= 0 else min(1.0, d / length)
    if b.ground:
        start = a.alt_m if a.ground else h
        return start + (b.alt_m - start) * (f if a.ground else min(1.0, dt * v / max(length - d + dt * v, 1e-6)))
    if b.alt_m > h:
        return min(b.alt_m, h + climb * dt)
    if b.alt_m < h:
        left_s = (length - d) / max(v, CREEP_MPS)
        if (h - b.alt_m) / descent >= left_s - dt:
            return max(b.alt_m, h - descent * dt)
    return h


def profile(points: list[Point], lengths: list[float], climb_mps: float, descent_mps: float, rest_s: float) -> list[Sample]:
    """The flight's samples every STEP_S from the first point to the last,
    then `rest_s` at rest there (for the logbook to see it has stopped)."""
    if len(lengths) != len(points) - 1:
        raise ValueError("one length a leg")
    out: list[Sample] = []
    s_done = 0.0
    h = points[0].alt_m
    for leg, length in enumerate(lengths):
        a, b = points[leg], points[leg + 1]
        d = 0.0
        while d < length:
            v = _speed(a, b, d, length)
            if v <= 0:
                break
            h_next = _height(a, b, h, d, length, v, climb_mps, descent_mps, STEP_S)
            out.append(Sample(len(out) * STEP_S, leg, d / length, s_done + d, h, v, (h_next - h) / STEP_S, b.phase))
            d += v * STEP_S
            h = h_next
        s_done += length
    last = len(points) - 2
    for _ in range(int(rest_s / STEP_S) + 1):
        out.append(Sample(len(out) * STEP_S, last, 1.0, s_done, points[-1].alt_m, 0.0, 0.0, points[-1].phase, resting=True))
    return out


def at(table: list[Sample], t: float) -> Sample:
    """The sample at `t`, between two of the table's in proportion; the
    last once the table is over."""
    # The samples are STEP_S apart from 0, so the one after `t` is found
    # by its index rather than a search.
    i = int(t / STEP_S) + 1
    if i <= 0:
        return table[0]
    if i >= len(table):
        return table[-1]
    a, b = table[i - 1], table[i]
    if b.leg != a.leg:
        return a
    k = (t - a.t) / (b.t - a.t) if b.t > a.t else 0.0
    return Sample(
        t,
        a.leg,
        a.frac + (b.frac - a.frac) * k,
        a.s_m + (b.s_m - a.s_m) * k,
        a.alt_m + (b.alt_m - a.alt_m) * k,
        a.speed_mps + (b.speed_mps - a.speed_mps) * k,
        a.vs_mps,
        a.phase,
        a.resting,
    )


def time_at(table: list[Sample], s_m: float) -> float:
    """When the path is `s_m` from its start (the autopilot's handback)."""
    i = bisect.bisect_left([s.s_m for s in table], s_m)
    return table[min(i, len(table) - 1)].t
