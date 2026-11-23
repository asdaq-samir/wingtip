"""The test flight's report, from what the run kept in its folder:

- results.json, the browser test's checks and measures
  (apps/web/e2e/sim/flight.sim.ts);
- states.jsonl, every state line the simulator sent (sim_flight.feed);
- readback.jsonl, the engine's reading of the GDL 90 sent
  (sim_flight.readback), held here to the state lines.

It writes report.md beside them and says whether every check passed.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

#: How near the engine's reading of a report must be to what the
#: simulator said: a GDL 90 position is in steps of 180/2^23 degrees
#: (about 2 m), an altitude in 25 ft, a speed in 1 kt and a track in
#: 360/256 degrees (the specification, 3.5.1).
NEAR_DEG = 0.0001
NEAR_FT = 25.0
NEAR_KT = 1.0
NEAR_TRACK_DEG = 1.5


def _lines(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def percentile(values: list[float], p: float) -> float | None:
    """The p-th percentile by nearest rank, None of nothing."""
    if not values:
        return None
    ranked = sorted(values)
    return ranked[max(0, math.ceil(p / 100.0 * len(ranked)) - 1)]


def _track_off(a: float | None, b: float | None) -> float:
    if a is None or b is None:
        return 0.0
    return abs((a - b + 180.0) % 360.0 - 180.0)


def readback_checks(states: list[dict], readback: list[dict]) -> list[dict]:
    """Each GDL 90 datagram as the engine read it, against the state line
    it was sent for (the same utc): own ship where, how high and how fast
    the simulator said, and the scripted traffic heard."""
    by_utc = {s["utc"]: s for s in states if "own" in s}
    worst = {"deg": 0.0, "ft": 0.0, "kt": 0.0, "track": 0.0}
    read = heard = missing = 0
    for r in readback:
        s = by_utc.get(r["at"])
        own = r.get("own")
        if s is None or own is None:
            missing += 1
            continue
        read += 1
        o = s["own"]
        worst["deg"] = max(worst["deg"], abs(own["lat"] - o["lat"]), abs(own["lon"] - o["lon"]))
        if own.get("geometric_ft") is not None:
            worst["ft"] = max(worst["ft"], abs(own["geometric_ft"] - o["alt_ft"]))
        if own.get("speed_kt") is not None:
            worst["kt"] = max(worst["kt"], abs(own["speed_kt"] - o["gs_kt"]))
        if o["gs_kt"] > 5:  # a track standing still says nothing
            worst["track"] = max(worst["track"], _track_off(own.get("track_deg"), o["track_deg"]))
        want = {t["callsign"] for t in s.get("traffic", [])}
        got = {t.get("callsign") for t in r.get("targets", [])}
        heard += len(want & got)
    ok = read > 0 and worst["deg"] <= NEAR_DEG and worst["ft"] <= NEAR_FT and worst["kt"] <= NEAR_KT and worst["track"] <= NEAR_TRACK_DEG
    return [
        {
            "name": "GDL 90 read back by the engine (receiver_read), as the phones read it",
            "ok": ok if readback else None,
            "detail": (
                f"{read} datagrams read, {missing} unmatched; worst {worst['deg']:.6f} deg, {worst['ft']:.0f} ft, "
                f"{worst['kt']:.1f} kt, {worst['track']:.1f} deg of track"
                if readback
                else "not read back (the stack was down, or --no-readback)"
            ),
        },
        {
            "name": "the scripted traffic in the GDL 90 stream",
            "ok": (heard > 0) if any(s.get("traffic") for s in states) and readback else None,
            "detail": f"{heard} traffic reports heard by the engine",
        },
    ]


def flight_summary(states: list[dict]) -> dict:
    """What the simulator flew: how long, how many lines, the phases in
    order, and whether the script finished."""
    own = [s for s in states if "own" in s]
    phases: list[str] = []
    for s in own:
        if s["phase"] and (not phases or phases[-1] != s["phase"]):
            phases.append(s["phase"])
    return {
        "lines": len(own),
        "refused": sum(1 for s in states if "refused" in s),
        "seconds": round(own[-1]["t"] - own[0]["t"], 1) if own else 0.0,
        "phases": phases,
        "finished": bool(own and own[-1].get("done")),
        "sim": own[0]["sim"] if own else "",
    }


def _mark(ok) -> str:
    return "pass" if ok is True else "FAIL" if ok is False else "not run"


def _fmt(v) -> str:
    return "-" if v is None else f"{v:g}"


def write(folder: Path) -> bool:
    """report.md in `folder`; True where no check failed."""
    states = _lines(folder / "states.jsonl")
    readback = _lines(folder / "readback.jsonl")
    results = json.loads((folder / "results.json").read_text()) if (folder / "results.json").exists() else {}
    flight = flight_summary(states)
    checks = [*results.get("checks", []), *readback_checks(states, readback)]
    if not flight["finished"]:
        checks.insert(0, {"name": "the simulator flew the script to its end", "ok": False, "detail": f"phases seen: {flight['phases']}"})
    per_fix = results.get("perFix", {})
    lines = [
        f"# Test flight: {results.get('name', '')}",
        "",
        f"Simulator {flight['sim'] or '?'}, {flight['seconds']:.0f} s flown, {flight['lines']} state lines "
        f"({flight['refused']} refused), phases {', '.join(flight['phases']) or 'none'}; "
        f"{results.get('fixes', 0)} fixes given to the web app.",
        "",
        "| Check | Result | Detail |",
        "|---|---|---|",
        *[f"| {c['name']} | {_mark(c.get('ok'))} | {c.get('detail', '')} |" for c in checks],
        "",
        "## Work a fix",
        "",
        "| Measure | p50 | p95 | max |",
        "|---|---|---|---|",
    ]
    for key, title in (("engine", "Engine calls"), ("mutations", "DOM mutations")):
        values = per_fix.get(key, [])
        lines.append(
            f"| {title} | {_fmt(percentile(values, 50))} | {_fmt(percentile(values, 95))} | {_fmt(max(values) if values else None)} |"
        )
    by_rule = sorted(per_fix.get("byRule", {}).items(), key=lambda kv: -kv[1])[:15]
    if by_rule:
        fixes = max(1, results.get("fixes", 1))
        lines += ["", "| Engine rule | Calls | A fix |", "|---|---|---|"]
        lines += [f"| {name} | {n} | {n / fixes:.2f} |" for name, n in by_rule]
    lines += ["", f"Checkpoints shown next, in order: {', '.join(results.get('nextNames', [])) or 'none'}."]
    (folder / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return all(c.get("ok") is not False for c in checks)
