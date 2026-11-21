"""The simulator's state, as a simulator's side sends it to the feed: one
JSON object a datagram (a "state line"), from the X-Plane plugin
(tools/xplane-driver/wingtip_replay/state_out.py) or the MSFS agent
(tools/msfs-agent, --feed). Read here into one shape, in both the units a
browser's GPS gives (metres, metres a second) and the units a GDL 90
report carries (feet, knots), each converted once through wingtip.units.

A state line:

    {"sim": "xplane", "seq": 12, "t": 34.5, "utc": 1763900000.2,
     "lat": 43.12, "lon": -89.34, "alt_m": 263.0 | "alt_ft": 862,
     "pressure_ft": 850, "gs_mps": 0.0 | "gs_kt": 0, "vs_mps": 0.0 | "vs_fpm": 0,
     "track_deg": 5.0, "on_ground": true, "phase": "takeoff",
     "point": "KMSN 36", "next": "Lift-off", "done": false,
     "traffic": [{"hex": "a4f001", "callsign": "N4SIM", "lat": ..., "lon": ...,
                  "alt_m": ..., "gs_mps": ..., "vs_mps": ..., "track_deg": ...}]}
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from wingtip.units import M_PER_FT, M_TO_FT, MS_TO_KT


class StateError(ValueError):
    """A state line the feed cannot read, with the reason in words."""


def _metres(line: dict, metric: str, imperial: str, per: float) -> float | None:
    """A figure in metric units, from the metric field or the imperial one
    (`per` imperial units to a metric one)."""
    if line.get(metric) is not None:
        return float(line[metric])
    if line.get(imperial) is not None:
        return float(line[imperial]) / per
    return None


@dataclass(frozen=True)
class Craft:
    """An airplane at a moment, metres and metres a second, the track true."""

    lat: float
    lon: float
    alt_m: float
    gs_mps: float
    vs_mps: float
    track_deg: float | None
    hex: str = ""
    callsign: str = ""

    @property
    def alt_ft(self) -> float:
        return self.alt_m * M_TO_FT

    @property
    def gs_kt(self) -> float:
        return self.gs_mps * MS_TO_KT

    @property
    def vs_fpm(self) -> float:
        return self.vs_mps * M_TO_FT * 60.0


def _craft(line: dict) -> Craft:
    try:
        lat, lon = float(line["lat"]), float(line["lon"])
    except (KeyError, TypeError, ValueError) as err:
        raise StateError(f"no position in {line!r}") from err
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        raise StateError(f"a position off the earth: {lat}, {lon}")
    alt = _metres(line, "alt_m", "alt_ft", M_TO_FT)
    if alt is None:
        raise StateError(f"no altitude in {line!r}")
    # A metre a second is MS_TO_KT knots; a foot a minute is M_PER_FT / 60
    # of a metre a second.
    gs = _metres(line, "gs_mps", "gs_kt", MS_TO_KT) or 0.0
    vs = line.get("vs_mps")
    if vs is None and line.get("vs_fpm") is not None:
        vs = float(line["vs_fpm"]) * M_PER_FT / 60.0
    track = line.get("track_deg")
    return Craft(
        lat=lat,
        lon=lon,
        alt_m=alt,
        gs_mps=gs,
        vs_mps=float(vs or 0.0),
        track_deg=None if track is None else float(track) % 360.0,
        hex=str(line.get("hex", "")),
        callsign=str(line.get("callsign", "")),
    )


@dataclass(frozen=True)
class State:
    """One state line read: own ship, the scripted traffic, and where the
    flight is in its script."""

    sim: str
    seq: int
    t: float
    utc: float
    own: Craft
    pressure_ft: float | None
    on_ground: bool
    phase: str
    point: str
    next: str
    done: bool
    traffic: tuple[Craft, ...] = field(default_factory=tuple)


def parse(datagram: bytes) -> State:
    """A datagram read as a state line; StateError where it is not one."""
    try:
        line = json.loads(datagram.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as err:
        raise StateError(f"not JSON: {err}") from err
    if not isinstance(line, dict):
        raise StateError("a state line is one JSON object")
    try:
        seq, t, utc = int(line.get("seq", 0)), float(line.get("t", 0.0)), float(line["utc"])
    except (KeyError, TypeError, ValueError) as err:
        raise StateError(f"no seq, t or utc in {line!r}") from err
    traffic = line.get("traffic") or []
    if not isinstance(traffic, list):
        raise StateError("traffic is a list")
    pressure = line.get("pressure_ft")
    return State(
        sim=str(line.get("sim", "")),
        seq=seq,
        t=t,
        utc=utc,
        own=_craft(line),
        pressure_ft=None if pressure is None else float(pressure),
        on_ground=bool(line.get("on_ground", False)),
        phase=str(line.get("phase", "")),
        point=str(line.get("point", "")),
        next=str(line.get("next", "")),
        done=bool(line.get("done", False)),
        traffic=tuple(_craft(other) for other in traffic),
    )


def _craft_json(c: Craft) -> dict:
    return {
        "hex": c.hex,
        "callsign": c.callsign,
        "lat": c.lat,
        "lon": c.lon,
        "alt_m": round(c.alt_m, 2),
        "alt_ft": round(c.alt_ft, 1),
        "gs_mps": round(c.gs_mps, 3),
        "gs_kt": round(c.gs_kt, 2),
        "vs_mps": round(c.vs_mps, 3),
        "vs_fpm": round(c.vs_fpm, 1),
        "track_deg": None if c.track_deg is None else round(c.track_deg, 2),
    }


def as_json(s: State) -> dict:
    """The state as the feed serves it to the browser test (GET /state):
    both units, so the test converts nothing."""
    return {
        "sim": s.sim,
        "seq": s.seq,
        "t": s.t,
        "utc": s.utc,
        "own": _craft_json(s.own),
        "pressure_ft": s.pressure_ft,
        "on_ground": s.on_ground,
        "phase": s.phase,
        "point": s.point,
        "next": s.next,
        "done": s.done,
        "traffic": [_craft_json(c) for c in s.traffic],
    }
