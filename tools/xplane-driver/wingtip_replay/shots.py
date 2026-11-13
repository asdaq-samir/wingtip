"""The shot list (shots.json, of shots.schema.json's shape) and when each
shot plays.

A shot is a camera (chase, flyby, tower or cockpit) from one time to
another, in seconds from the flight file's first row. The flight's gaps cut
the shots: a "take" is the part of a shot inside one run of rows, and the
recorder runs only over the takes, so the video cuts at a gap and never
shows the airplane moving through time nobody saw it. Plain Python, for the
tests.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

#: The shot list's schema, beside this file: the one both simulator
#: drivers read (the MSFS agent's Replay.Core embeds the same file), so a
#: camera's kind or a setting's values are stated once.
SCHEMA = json.loads((Path(__file__).resolve().parent / "shots.schema.json").read_text())
_PROPS = SCHEMA["properties"]

KINDS = tuple(_PROPS["shots"]["items"]["properties"]["kind"]["enum"])

#: A take shorter than this, s, is left out: a camera that cuts away again
#: at once is a flicker, not a shot.
MIN_TAKE_S = 1.0


class ShotListError(ValueError):
    """The shot list cannot be played, with the reason in words."""


@dataclass(frozen=True)
class Shot:
    kind: str
    start: float
    end: float
    params: dict = field(default_factory=dict, compare=False)


@dataclass(frozen=True)
class Take:
    """The part of `shot` between `start` and `end` with no gap in it."""

    shot: Shot
    start: float
    end: float


@dataclass(frozen=True)
class Settings:
    """The shot list's settings beside the shots (docs/XPLANE-TRIAL.md),
    each as shots.schema.json describes it, its default the schema's."""

    flight: str
    #: "auto", "menu" or "drive": how the airplane is replayed.
    source: str
    #: "fixed" (1/fps s a drawn frame) or "real" (the wall clock).
    clock: str
    fps: float
    record: bool
    autostart: bool
    quit_when_done: bool


_SOURCES = tuple(_PROPS["source"]["enum"])
_CLOCKS = tuple(_PROPS["clock"]["enum"])
_FPS = (float(_PROPS["fps"]["minimum"]), float(_PROPS["fps"]["maximum"]))


def _given(spec: dict, key: str):
    """A setting as the list gives it, else the schema's default."""
    return spec.get(key, _PROPS[key]["default"])


def load(spec: dict, duration_s: float) -> tuple[Settings, list[Shot]]:
    """The settings and shots of a parsed shots.json, the shots in order,
    cut to the flight's length. Overlapping shots, an unknown kind or a
    shot that ends before it starts are refused, with which one."""
    try:
        settings = Settings(
            flight=str(spec["flight"]),
            source=str(_given(spec, "source")),
            clock=str(_given(spec, "clock")),
            fps=float(_given(spec, "fps")),
            record=bool(_given(spec, "record")),
            autostart=bool(_given(spec, "autostart")),
            quit_when_done=bool(_given(spec, "quit_when_done")),
        )
    except KeyError as err:
        raise ShotListError(f"the shot list has no {err.args[0]!r}") from err
    if settings.source not in _SOURCES:
        raise ShotListError(f"source must be one of {', '.join(_SOURCES)}, not {settings.source!r}")
    if settings.clock not in _CLOCKS:
        raise ShotListError(f"clock must be one of {', '.join(_CLOCKS)}, not {settings.clock!r}")
    if not _FPS[0] <= settings.fps <= _FPS[1]:
        raise ShotListError(f"fps must be {_FPS[0]:g} to {_FPS[1]:g}, not {settings.fps}")
    shots: list[Shot] = []
    for i, raw in enumerate(spec.get("shots", [])):
        kind = raw.get("kind")
        if kind not in KINDS:
            raise ShotListError(f"shot {i + 1}: kind must be one of {', '.join(KINDS)}, not {kind!r}")
        start, end = float(raw.get("from_s", 0.0)), float(raw.get("to_s", duration_s))
        if end <= start:
            raise ShotListError(f"shot {i + 1} ({kind}) ends at {end} s, before it starts at {start} s")
        params = {k: v for k, v in raw.items() if k not in ("kind", "from_s", "to_s")}
        shots.append(Shot(kind, max(0.0, start), min(end, duration_s), params))
    shots.sort(key=lambda s: s.start)
    for a, b in zip(shots, shots[1:]):
        if b.start < a.end:
            raise ShotListError(f"the {a.kind} shot to {a.end} s overlaps the {b.kind} shot from {b.start} s")
    return settings, [s for s in shots if s.end > s.start]


def takes(shots: list[Shot], runs: list[tuple[float, float]]) -> list[Take]:
    """Each shot cut to the runs of rows: one take for each run it meets,
    none across a gap, none shorter than MIN_TAKE_S."""
    out: list[Take] = []
    for shot in shots:
        for lo, hi in runs:
            start, end = max(shot.start, lo), min(shot.end, hi)
            if end - start >= MIN_TAKE_S:
                out.append(Take(shot, start, end))
    return out


def take_at(all_takes: list[Take], t: float) -> Take | None:
    """The take playing at `t` (a take owns its start, not its end)."""
    for take in all_takes:
        if take.start <= t < take.end:
            return take
    return None


def next_take(all_takes: list[Take], t: float) -> Take | None:
    """The first take starting at or after `t`."""
    return next((take for take in all_takes if take.start >= t), None)


def recording_spans(all_takes: list[Take]) -> list[tuple[float, float]]:
    """When the recorder runs: the takes, with takes that follow on with no
    time between them joined into one span (a cut between two cameras is
    one recording; a gap or a pause between shots is two)."""
    spans: list[tuple[float, float]] = []
    for take in all_takes:
        if spans and abs(take.start - spans[-1][1]) < 1e-6:
            spans[-1] = (spans[-1][0], take.end)
        else:
            spans.append((take.start, take.end))
    return spans


class Clock:
    """The replay's time, s from the first row. "fixed" moves on 1/fps a
    drawn frame, so the replay plays at the video's speed however slowly
    the Mac draws; "real" moves on the wall clock's time."""

    def __init__(self, mode: str, fps: float, start: float) -> None:
        self.mode, self.fps, self.t = mode, fps, start

    def tick(self, since_last_s: float) -> float:
        self.t += 1.0 / self.fps if self.mode == "fixed" else since_last_s
        return self.t

    def jump(self, t: float) -> None:
        self.t = t
