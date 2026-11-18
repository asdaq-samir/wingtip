"""STDDS's terminal radar tracks read (ingest.swim hands each message here
once it is worth reading): TAIS's TATrackAndFlightPlan, each airborne
track as wingtip.traffic takes an airplane heard elsewhere. Its course
and speed are the engine's (velocity_track, asked once a message), from
the track's ground velocity, and what its code declares is the engine's
too (squawk_meaning); the rest is passed on as sent."""

from __future__ import annotations

import functools
import json
import math
import xml.etree.ElementTree as ET
from datetime import datetime

import wingtip_native


def _number(element, tag: str) -> float | None:
    text = element.findtext(tag)
    try:
        return float(text) if text not in (None, "") else None
    except ValueError:
        return None


def _when(text: str | None) -> float | None:
    """An ISO time as the feed writes it ("2026-10-20T01:58:25.921Z"), s."""
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


Velocity = tuple[float | None, float | None]


def _velocities(velocities: list[Velocity]) -> list[Velocity]:
    """Each ground velocity's track (degrees true, toward where it goes) and
    speed (kt), to a tenth: the engine's velocity_track, asked once for the
    whole message rather than once a track, with no track where it does not
    move; neither where the track sends no velocity or one that is not a
    number."""
    asked = [i for i, (vx, vy) in enumerate(velocities) if vx is not None and vy is not None and math.isfinite(vx + vy)]
    out: list[Velocity] = [(None, None)] * len(velocities)
    if not asked:
        return out
    body = json.dumps({"velocities": [{"east": velocities[i][0], "north": velocities[i][1]} for i in asked]})
    for i, got in zip(asked, json.loads(wingtip_native.call("velocity_track", body)), strict=True):
        out[i] = (None if got["track_deg"] is None else round(got["track_deg"], 1)), round(got["speed"], 1)
    return out


#: The engine's words for what a squawk says (squawk_meaning) in those an
#: ADS-B report's own emergency field uses (readsb's "general", "nordo",
#: "unlawful"), which wingtip.traffic carries for every airplane.
_EMERGENCY_WORDS = {"emergency": "general", "lost radio": "nordo", "hijack": "unlawful"}


@functools.cache
def _emergency(squawk: str) -> str | None:
    """What a transponder's code declares, by the engine's squawk_meaning
    (AIM 6-2-2, 6-3-4 and 6-4-2); None for any other code. Kept by the
    code, as a facility's messages repeat the same few hundred."""
    meaning = json.loads(wingtip_native.call("squawk_meaning", json.dumps({"squawk": squawk})))
    return _EMERGENCY_WORDS.get(meaning) if meaning else None


def tracks(xml: str) -> list[tuple[dict, float]]:
    """A TATrackAndFlightPlan message's airborne tracks, each as wingtip.traffic's
    `_aircraft` gives an airplane, and when it was where it is (s): the
    track's Mode S address (`acAddress`), its place, its altitude as the
    transponder reports it (pressure altitude, to the hundred feet), its
    speed and track from its ground velocity (vx, vy, knots east and north;
    STARS's TAIS interface), its climb (vVert, ft/min) and its beacon code;
    the flight plan's ident and type where the track has one. None for a
    track with no address, one coasting or dropped, or on the surface."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    if not root.tag.endswith("TATrackAndFlightPlan"):
        return []
    kept = []
    for record in root.iter("record"):
        track = record.find("track")
        if track is None or track.findtext("status") != "active":
            continue
        address = (track.findtext("acAddress") or "").strip().lower()
        lat, lon = _number(track, "lat"), _number(track, "lon")
        at = _when(track.findtext("mrtTime"))
        # "000000" is no address: a target with no Mode S transponder.
        if len(address) != 6 or address == "000000" or lat is None or lon is None or at is None:
            continue
        kept.append((record, track, address, lat, lon, at))
    velocities = _velocities([(_number(track, "vx"), _number(track, "vy")) for _, track, *_ in kept])
    out = []
    for (record, track, address, lat, lon, at), (track_deg, speed_kt) in zip(kept, velocities, strict=True):
        plan = record.find("flightPlan")
        ident = (plan.findtext("acid") or "").strip() if plan is not None else ""
        kind = (plan.findtext("acType") or "").strip() if plan is not None else ""
        squawk = (track.findtext("reportedBeaconCode") or "").strip()
        out.append(
            (
                {
                    "hex": address,
                    "callsign": ident or None,
                    "registration": ident if ident.startswith("N") else None,
                    "type": kind or None,
                    "lat": round(lat, 5),
                    "lon": round(lon, 5),
                    "altitude_ft": _number(track, "reportedAltitude"),
                    "pressure_altitude": True,
                    "track_deg": track_deg,
                    "speed_kt": speed_kt,
                    "vertical_fpm": _number(track, "vVert"),
                    "seen_s": None,
                    "squawk": squawk or None,
                    "emergency": _emergency(squawk) if squawk else None,
                    "category": None,
                },
                at,
            )
        )
    return out
