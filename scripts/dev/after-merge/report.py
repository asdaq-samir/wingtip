#!/usr/bin/env python3
"""The after-merge campaign's report, from what its pieces left in OUT
(scripts/dev/after-merge.sh; docs/TESTING-AFTER-MERGE.md says how to read
it). Each result against its limit, and the planner's rate limit to set,
worked out from the stress run.

    python3 scripts/dev/after-merge/report.py ~/wingtip-after-merge/<date> > report.md

Standard library only, and Python 3.9: it runs on the Mac's own python3.
"""

from __future__ import annotations

import json
import statistics
import subprocess
import sys
from pathlib import Path

import report_ops

# The launch server's two cores (a t3a.large, docs/README-AWS.md): docker
# stats counts a core as 100%.
CORES = 2
# The gateway's Hikari pool (Spring Boot's default, 10) is where a request
# waits on Postgres first, long before Postgres's 100 connections; the
# planner's synchronous endpoints wait in AnyIO's thread pool (40).
PG_POOL = 10
PLANNER_POOL = 40
# Soak limits, per hour after the first 20 minutes' warm.
SOAK_MEMORY_MB_PER_H = 50
SOAK_FDS_PER_H = 20
SOAK_DISK_MB_PER_H = 100


def load(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def samples(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text().splitlines() if path.exists() else []:
        try:
            rows.append(json.loads(line))
        except ValueError:
            pass
    return rows


def number(text: str) -> float:
    """docker stats' "1.5GiB" or "312MiB" or "12.5%" as MB or a number."""
    text = text.strip()
    for unit, mb in (("GiB", 1024), ("MiB", 1), ("KiB", 1 / 1024), ("GB", 1000), ("MB", 1), ("kB", 1 / 1000), ("B", 1 / 2**20)):
        if text.endswith(unit):
            return float(text[: -len(unit)]) * mb
    return float(text.rstrip("%") or 0)


def service(name: str) -> str:
    return name.removeprefix("wingtip-").removesuffix("-1")


def per_service(rows: list[dict]) -> dict[str, dict[str, list[float]]]:
    out: dict[str, dict[str, list[float]]] = {}
    for row in rows:
        for s in row.get("stats", []):
            d = out.setdefault(service(s["Name"]), {"cpu": [], "mem": [], "mem_pct": [], "t": []})
            d["cpu"].append(number(s["CPUPerc"]))
            d["mem"].append(number(s["MemUsage"].split("/")[0]))
            d["mem_pct"].append(number(s["MemPerc"]))
            d["t"].append(row["t"])
    return out


def pg_active(row: dict) -> int:
    return sum(int(p.split(":")[1]) for p in row.get("pg", "").split() if p.startswith("active:"))


def planner_threads(row: dict) -> int:
    for part in row.get("planner", "").split():
        if part.startswith("Threads:"):
            return int(part.split(":")[1])
    return 0


def pressure(rows: list[dict], baseline_threads: int) -> dict[str, float]:
    """How near each resource was to its end in `rows`, 1.0 at the end."""
    out: dict[str, float] = {}
    by = per_service(rows)
    cpu = [sum(v) for v in zip(*(d["cpu"] for k, d in by.items() if not k.startswith("after-merge")))] or [0]
    out[f"CPU, all services on {CORES} cores"] = statistics.quantiles(cpu, n=20)[-1] / (100 * CORES) if len(cpu) > 1 else cpu[0] / 200
    for name, d in by.items():
        if d["mem_pct"] and not name.startswith("after-merge"):
            out[f"{name} memory"] = max(d["mem_pct"]) / 100
    out[f"Postgres connections busy (gateway pool {PG_POOL})"] = max((pg_active(r) for r in rows), default=0) / PG_POOL
    out[f"planner workers (thread pool {PLANNER_POOL})"] = (
        max((planner_threads(r) - baseline_threads for r in rows), default=0) / PLANNER_POOL
    )
    return out


def values(summary: dict, metric: str) -> dict:
    return (summary["data"]["metrics"].get(metric) or {}).get("values", {})


def seconds(text: str) -> float:
    n = float(text.rstrip("smh"))
    return n * 3600 if text.endswith("h") else n * 60 if text.endswith("m") else n


def step_table(summary: dict, rows: list[dict]) -> tuple[list[str], dict | None, dict | None]:
    """Each step against the limits; the last that held and the first that broke."""
    lines = ["| Pilots | Requests/s | Errors | Worst p95 (of its limit) | Held |", "|---|---|---|---|---|"]
    held = broke = None
    t0 = rows[0]["t"] if rows else 0
    start = 0.0
    for step in summary["steps"]:
        span = seconds(step["ramp"]) + seconds(step["hold"])
        reqs = values(summary, f"http_reqs{{step:{step['name']}}}").get("count", 0)
        tiles = values(summary, f"http_reqs{{step:{step['name']},name:tile}}").get("count", 0)
        errors = values(summary, f"http_req_failed{{step:{step['name']}}}").get("rate", 0)
        worst = max(
            ((values(summary, f"{m}{{step:{step['name']}}}").get("p(95)", 0) / limit, m) for m, limit in summary["limits"].items()),
            default=(0, ""),
        )
        ok = errors < summary["errors"] and worst[0] < 1 and reqs > 0
        info = {
            **step,
            "rps": reqs / span,
            "other_rps": (reqs - tiles) / span,
            "rows": [r for r in rows if start <= r["t"] - t0 < start + span],
        }
        if reqs:
            lines.append(f"| {step['name']} | {reqs / span:.1f} | {errors:.2%} | {worst[1]} {worst[0]:.0%} | {'yes' if ok else '**no**'} |")
        if ok and broke is None:
            held = info
        elif not ok and broke is None and reqs:
            broke = info
        start += span
    return lines, held, broke


def stress(out: Path) -> list[str]:
    summary = load(out / "stress" / "summary.json")
    if not summary:
        return ["Not run yet."]
    rows = samples(out / "stress" / "samples.jsonl")
    lines, held, broke = step_table(summary, rows)
    base = min((planner_threads(r) for r in rows[:6]), default=0)
    lines.append("")
    if broke is None:
        lines.append(f"Held at every step to {summary['steps'][-1]['target']} pilots: no breaking point under 500.")
    else:
        lines.append(f"**Breaking point: {held['target'] if held else 'under 10'} pilots**; at {broke['target']} the limits broke.")
        near = sorted(pressure(broke["rows"], base).items(), key=lambda kv: -kv[1])
        lines.append(
            "What was nearest its end at the step that broke (1.0 = at it): " + ", ".join(f"{k} {v:.2f}" for k, v in near[:5]) + "."
        )
        lines.append(f"First to hit it: **{near[0][0]}**.")
    lines += [""] + rate_limit(summary, held)
    containers = (out / "stress" / "containers.txt").read_text() if (out / "stress" / "containers.txt").exists() else ""
    if "oom=true" in containers:
        lines.append(f"\nKilled out of memory: `{containers.strip()}`.")
    return lines


def rate_limit(summary: dict, held: dict | None) -> list[str]:
    """The per-client limit on /api/planner/* (the ops audit's #16): ten
    times what one pilot asks, and never more than a quarter of what the
    server holds, so four runaway clients cannot take it. Tiles are left
    out: production's Caddy sends them to the planner direct and
    CloudFront keeps them."""
    fifty = next((s for s in summary["steps"] if s["name"] == "50"), None)
    if not held or not fifty:
        return ["Planner rate limit: needs the stress run to hold at 50 pilots."]
    span = seconds(fifty["ramp"]) + seconds(fifty["hold"])
    reqs = values(summary, "http_reqs{step:50}").get("count", 0) - values(summary, "http_reqs{step:50,name:tile}").get("count", 0)
    one = reqs / span / 50
    per_s = min(max(10 * one, 0.5), 0.25 * held["other_rps"])
    return [
        f"**Planner rate limit to set** (gateway, per client, non-tile `/api/planner/*`): **{per_s * 60:.0f} a minute**, "
        f"a burst of 20. One pilot asks {one * 60:.1f} a minute; the server held {held['other_rps']:.1f} a second at "
        f"{held['target']} pilots, and the limit is the lower of ten pilots' worth and a quarter of that."
    ]


def journeys(out: Path, profile: str) -> list[str]:
    summary = load(out / profile / "summary.json")
    if not summary:
        return ["Not run yet."]
    lines = ["| Step | Journey | p95 | Limit | Held |", "|---|---|---|---|---|"]
    names = [None] + [s["name"] for s in summary["steps"]] if len(summary["steps"]) > 1 else [None]
    for step in names:
        tag = f"{{step:{step}}}" if step else ""
        for metric, limit in summary["limits"].items():
            p95 = values(summary, metric + tag).get("p(95)")
            if p95 is not None:
                lines.append(f"| {step or 'all'} | {metric} | {p95:.0f} ms | {limit} ms | {'yes' if p95 < limit else '**no**'} |")
        errors = values(summary, "http_req_failed" + tag).get("rate", 0)
        lines.append(
            f"| {step or 'all'} | errors | {errors:.2%} | {summary['errors']:.0%} | {'yes' if errors < summary['errors'] else '**no**'} |"
        )
    return lines


def growth(series: list[tuple[float, float]]) -> float:
    """Per hour, by least squares, after the first 20 minutes."""
    if not series:
        return 0.0
    t0 = series[0][0]
    pts = [(t - t0, v) for t, v in series if t - t0 > 1200]
    if len(pts) < 3:
        return 0.0
    # statistics.linear_regression is 3.10's; the Mac's python3 is 3.9.
    mt = statistics.fmean(p[0] for p in pts)
    mv = statistics.fmean(p[1] for p in pts)
    spread = sum((t - mt) ** 2 for t, _ in pts) or 1.0
    return sum((t - mt) * (v - mv) for t, v in pts) / spread * 3600


def soak(out: Path) -> list[str]:
    rows = samples(out / "soak" / "samples.jsonl")
    lines = journeys(out, "soak")
    if not rows:
        return lines
    lines += ["", "| Grows | Per hour | Limit | Held |", "|---|---|---|---|"]
    for name, d in per_service(rows).items():
        g = growth(list(zip(d["t"], d["mem"])))
        lines.append(f"| {name} memory | {g:.0f} MB | {SOAK_MEMORY_MB_PER_H} MB | {'yes' if g < SOAK_MEMORY_MB_PER_H else '**no**'} |")
    fds = [(r["t"], float(p.split(":")[1])) for r in rows for p in r.get("planner", "").split() if p.startswith("fds:")]
    g = growth(fds)
    lines.append(f"| planner open files | {g:.0f} | {SOAK_FDS_PER_H} | {'yes' if g < SOAK_FDS_PER_H else '**no**'} |")
    for key, label in (("db_bytes", "Postgres"), ("live_kb", "live stores")):
        scale = 2**20 if key == "db_bytes" else 1024
        g = growth([(r["t"], float(r[key]) / scale) for r in rows if r.get(key, "").strip().isdigit()])
        lines.append(f"| {label} on disk | {g:.0f} MB | {SOAK_DISK_MB_PER_H} MB | {'yes' if g < SOAK_DISK_MB_PER_H else '**no**'} |")
    caches: dict[str, list[tuple[float, float]]] = {}
    for r in rows:
        for part in r.get("du_kb", "").split():
            path, _, kb = part.rpartition("=")
            caches.setdefault(Path(path).name, []).append((r["t"], float(kb) / 1024))
    for name, series in caches.items():
        g = growth(series)
        lines.append(f"| {name} | {g:.0f} MB | {SOAK_DISK_MB_PER_H} MB | {'yes' if g < SOAK_DISK_MB_PER_H else '**no**'} |")
    return lines


def tail(path: Path, n: int = 8) -> list[str]:
    if not path.exists():
        return ["Not run yet."]
    return ["```", *path.read_text(errors="replace").splitlines()[-n:], "```"]


def main(out: Path) -> None:
    repo = Path(__file__).resolve().parents[3]
    head = subprocess.run(["git", "-C", str(repo), "log", "-1", "--format=%h %s"], capture_output=True, text=True).stdout.strip()
    print(f"# After-merge campaign, {out.name}\n\nThe tree: `{head[:90]}`. How to read this: docs/TESTING-AFTER-MERGE.md.\n")
    print("| Piece | Exit | Minutes |\n|---|---|---|")
    for state in sorted((out / "state").glob("*.exit")):
        code, secs = (state.read_text().split() + ["0", "0"])[:2]
        print(f"| {state.stem} | {code} | {int(secs) // 60} |")
    sections = [
        ("Restore drill", tail(out / "drill.txt")),
        ("WebP transcode", tail(out / "transcode.txt")),
        ("Stress (10 to 500 pilots)", stress(out)),
        ("Stress, each journey", journeys(out, "stress")),
        ("Soak (50 pilots, 2 hours)", soak(out)),
        ("Spike (0 to 200 in 10 s)", journeys(out, "spike")),
        ("Chaos (50 pilots on)", report_ops.chaos(out / "chaos")),
        ("Cycle changeover", report_ops.changeover(out / "changeover")),
        ("Security scans", report_ops.scans(out / "scans")),
    ]
    for title, lines in sections:
        print(f"\n## {title}\n")
        print("\n".join(lines))


if __name__ == "__main__":
    main(Path(sys.argv[1]).expanduser())
