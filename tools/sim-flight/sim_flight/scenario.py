"""A test flight's script (flights/*.json): where it flies, how, and what
the apps are expected to do on the way. Written as a pilot reads it, in
feet and knots with the FAA data it comes from; read here into

- the X-Plane plugin's flight file (`for_plugin`, in metres and metres a
  second, which X-Plane's local frame is in), written into X-Plane's
  Output/wingtip by the runner;
- what the browser test checks (`for_test`), served by the feed.

Standard library only (and wingtip.units).
"""

from __future__ import annotations

import json
from pathlib import Path

from wingtip.units import M_PER_FT, M_PER_NM, MS_TO_KT

PHASES = ("takeoff", "climb", "enroute", "approach", "final", "landing", "rollout")
FLY = ("path", "autopilot")


class ScenarioError(ValueError):
    """A flight script that cannot be flown, with the reason in words."""


def _need(cond: bool, why: str) -> None:
    if not cond:
        raise ScenarioError(why)


def load(path: Path) -> dict:
    """A flight script, read and checked."""
    try:
        scn = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as err:
        raise ScenarioError(f"{path}: {err}") from err
    check(scn)
    return scn


def check(scn: dict) -> None:
    """Every point placed and named once, every phase known, the
    autopilot's and the traffic's points among them."""
    places = scn.get("places", {})
    points = scn.get("points", [])
    _need(len(points) >= 2, "a flight flies at least two points")
    names = [p.get("name") for p in points]
    _need(all(names) and len(set(names)) == len(names), f"each point has a name of its own: {names}")
    for p in points:
        _need(p.get("phase") in PHASES, f"{p['name']}: phase is one of {PHASES}")
        _need(isinstance(p.get("kt"), (int, float)) and p["kt"] >= 0, f"{p['name']}: kt, its speed, 0 or more")
        if "at" in p:
            _need(p["at"] in places, f"{p['name']}: no place {p['at']!r}")
            _need("toward" not in p or p["toward"] in places, f"{p['name']}: no place {p.get('toward')!r}")
            _need(0.0 <= float(p.get("fraction", 0.0)) <= 1.0, f"{p['name']}: fraction between 0 and 1")
        else:
            _need("lat" in p and "lon" in p, f"{p['name']}: lat and lon, or at a place")
        _need("alt_ft" in p or (p.get("ground") and "at" in p), f"{p['name']}: alt_ft, or on the ground at a place")
    _need(points[0].get("ground") and points[-1].get("ground"), "a flight starts and ends on the ground")
    ap = scn.get("autopilot")
    if ap:
        _need(ap.get("from") in names and ap.get("to") in names, "the autopilot's from and to are points")
        _need(names.index(ap["from"]) < names.index(ap["to"]), "the autopilot hands back after it takes over")
    for t in scn.get("traffic", []):
        _need(t.get("after") in names, f"traffic {t.get('callsign')}: after names a point")
        _need(len(str(t.get("hex", ""))) == 6, f"traffic {t.get('callsign')}: hex, six hex digits")
    rates = scn.get("rates", {})
    _need(rates.get("climb_fpm", 0) > 0 and rates.get("descent_fpm", 0) > 0, "rates: climb_fpm and descent_fpm")


def _mps(kt: float) -> float:
    return kt / MS_TO_KT


def _fpm(fpm: float) -> float:
    return fpm * M_PER_FT / 60.0


def _point(p: dict, places: dict) -> dict:
    """A point for the plugin; one on the ground at a place is at the
    place's elevation, between its two ends (a runway's) by the fraction."""
    out = {"name": p["name"], "phase": p["phase"], "ground": bool(p.get("ground")), "speed_mps": _mps(p["kt"])}
    alt_ft = p.get("alt_ft")
    if "at" in p:
        at = places[p["at"]]
        toward = places.get(p.get("toward", p["at"]))
        f = float(p.get("fraction", 0.0))
        out.update(lat=at["lat"], lon=at["lon"], toward_lat=toward["lat"], toward_lon=toward["lon"], fraction=f)
        if alt_ft is None:
            alt_ft = at["elev_ft"] + (toward["elev_ft"] - at["elev_ft"]) * f
    else:
        out.update(lat=p["lat"], lon=p["lon"])
    # Both: the path is flown in metres, X-Plane's autopilot is set in feet.
    out["alt_m"], out["alt_ft"] = alt_ft * M_PER_FT, alt_ft
    return out


def for_plugin(scn: dict, fly: str, feed: tuple[str, int], autostart: bool = True) -> dict:
    """The plugin's flight file (wingtip_replay/route.py and flight.py
    read it): metres and metres a second, the places resolved."""
    _need(fly in FLY, f"fly is one of {FLY}")
    places = scn.get("places", {})
    return {
        "name": scn.get("name", ""),
        "fly": fly,
        "feed": {"host": feed[0], "port": feed[1]},
        "autostart": autostart,
        "points": [_point(p, places) for p in scn["points"]],
        "climb_mps": _fpm(scn["rates"]["climb_fpm"]),
        "descent_mps": _fpm(scn["rates"]["descent_fpm"]),
        "climb_fpm": scn["rates"]["climb_fpm"],
        "descent_fpm": scn["rates"]["descent_fpm"],
        "rest_s": float(scn.get("rest_s", 0)),
        "autopilot": scn.get("autopilot") if fly == "autopilot" else None,
        "power": scn.get("power", {}),
        "traffic": [
            {
                "callsign": t["callsign"],
                "hex": t["hex"],
                "after": t["after"],
                "delay_s": float(t.get("delay_s", 0)),
                "for_s": float(t.get("for_s", 120)),
                "ahead_m": t.get("ahead_nm", 3) * M_PER_NM,
                "right_m": t.get("right_nm", 0) * M_PER_NM,
                "above_m": t.get("above_ft", 500) * M_PER_FT,
                "speed_mps": _mps(t.get("kt", 100)),
                "turn_deg": float(t.get("turn_deg", 180)),
            }
            for t in scn.get("traffic", [])
        ],
    }


def for_test(scn: dict) -> dict:
    """What the browser test reads: the plan to open, the airplane to
    pick, the points in order with their phases, the traffic's call
    signs and the expectations."""
    return {
        "name": scn.get("name", ""),
        "plan": scn["plan"],
        "airplane": {k: v for k, v in scn.get("airplane", {}).items() if k in ("profile", "label")},
        "points": [{"name": p["name"], "phase": p["phase"]} for p in scn["points"]],
        "traffic": [t["callsign"] for t in scn.get("traffic", [])],
        "expect": scn.get("expect", {}),
    }


def write_plugin_files(scn: dict, out: Path, fly: str, feed: tuple[str, int]) -> Path:
    """The flight file into X-Plane's Output/wingtip (`out`)."""
    out.mkdir(parents=True, exist_ok=True)
    path = out / "flight.json"
    path.write_text(json.dumps(for_plugin(scn, fly, feed), indent=2) + "\n", encoding="utf-8")
    return path
