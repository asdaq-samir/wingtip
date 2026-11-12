"""STDDS's terminal radar tracks read (ingest.swim hands each message here
once it is worth reading): TAIS's TATrackAndFlightPlan, each airborne
track as wingtip.traffic takes an airplane heard elsewhere. Its course
and speed are the engine's (velocity_track), from the track's ground
velocity; the rest is passed on as sent."""

from __future__ import annotations

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


def _velocity(vx: float | None, vy: float | None) -> tuple[float | None, float | None]:
    """A ground velocity's track (degrees true, toward where it goes) and
    speed (kt), to a tenth: the engine's velocity_track, with no track
    where it does not move; neither where the track sends no velocity or
    one that is not a number."""
    if vx is None or vy is None or not math.isfinite(vx + vy):
        return None, None
    (got,) = json.loads(wingtip_native.call("velocity_track", json.dumps({"velocities": [{"east": vx, "north": vy}]})))
    return (None if got["track_deg"] is None else round(got["track_deg"], 1)), round(got["speed"], 1)


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
    out = []
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
        track_deg, speed_kt = _velocity(_number(track, "vx"), _number(track, "vy"))
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
                    # 7500 unlawful interference (AIM 6-3-4), 7600 radio failure
                    # (AIM 6-4-2), 7700 emergency (AIM 6-2-2).
                    "emergency": {"7500": "unlawful", "7600": "nordo", "7700": "general"}.get(squawk),
                    "category": None,
                },
                at,
            )
        )
    return out
