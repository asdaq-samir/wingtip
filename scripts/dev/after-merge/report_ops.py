"""The after-merge report's chaos, changeover and scan sections (report.py
prints them). Each fault judged by what pilots saw (docs/RUNBOOKS.md,
"What pilots see when each feed fails"), whether it came back with no
hand on it, and which alarm of infra/cloudformation/template.yaml would
have mailed the owner; each scan finding given a first triage."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

# The alarms, as template.yaml sets them ("Alarms"): HealthAlarm is Route
# 53's check (3 failures 30 s apart) under 1 for 3 minutes; ServicesAlarm
# health.sh's count at 1 or more for 3 five-minute periods; DataDiskAlarm
# 85% for 2; GatewayAlertAlarm any ALERT line in 5 minutes.
HEALTH_ALARM_S = 3 * 30 + 3 * 60
SERVICES_ALARM_S = 3 * 300
DISK_ALARM_S = 2 * 300
DISK_ALARM_PCT = 85
DEV_ONLY = re.compile(r"requirements-dev|scripts/dev|tools/|ml/")


def rows(path: Path) -> list[dict]:
    out = []
    for line in path.read_text().splitlines() if path.exists() else []:
        try:
            out.append(json.loads(line))
        except ValueError:
            pass
    return out


def longest(times: list[int], step: int) -> int:
    """The longest run of `times` no more than `step` apart, in seconds."""
    best = run = 0
    for a, b in zip(times, times[1:]):
        run = run + (b - a) if b - a <= step else 0
        best = max(best, run)
    return best


def health_lines(path: Path) -> list[tuple[int, str]]:
    out = []
    for line in path.read_text().splitlines() if path.exists() else []:
        t, _, rest = line.partition(" ")
        if t.isdigit():
            out.append((int(t), rest))
    return out


def alert_times(path: Path) -> list[int]:
    out = []
    for line in path.read_text().splitlines() if path.exists() else []:
        try:
            out.append(int(datetime.fromisoformat(line.split()[0].replace("Z", "+00:00")).timestamp()))
        except (ValueError, IndexError):
            pass
    return out


def chaos(dir: Path) -> list[str]:
    events = rows(dir / "events.jsonl")
    if not events:
        return ["Not run yet."]
    probe = rows(dir / "probe.jsonl")
    health = health_lines(dir / "health.log")
    alerts = alert_times(dir / "alerts.txt")
    lines = [
        "| Fault | Back in | By itself | What pilots saw | health.sh saw it | Alarms that would mail |",
        "|---|---|---|---|---|---|",
    ]
    starts = [e for e in events if e["what"] == "start"]
    for start in starts:
        fault = start["fault"]
        mine = [e for e in events if e["fault"] == fault and e["t"] >= start["t"]]
        end = next((e for e in mine if e["what"] in ("recovered", "never")), None)
        if end is None:
            lines.append(f"| {fault} | (stopped) | | | | |")
            continue
        window = [p for p in probe if start["t"] <= p["t"] <= end["t"]]
        by_hand = any(e["what"] == "healed by hand" for e in mine)
        skipped = next((e["what"] for e in mine if e["what"].startswith("skipped")), None)
        seen = []
        for name in sorted({p["name"] for p in window}):
            own = [p for p in window if p["name"] == name]
            bad = [p for p in own if not 200 <= p["code"] < 400]
            said = next((p["said"] for p in own if p["said"]), "")
            if bad or said:
                seen.append(f"{name} {len(bad)}/{len(own)} failed{(': ' + said[:80]) if said else ''}")
        noticed = [t for t, text in health if start["t"] <= t <= end["t"] and re.search(r"not running|unhealthy|data (8[5-9]|9\d)%", text)]
        fired = []
        down = [p["t"] for p in window if p["name"] == "health" and not 200 <= p["code"] < 400]
        if longest(down, 30) >= HEALTH_ALARM_S:
            fired.append("HealthAlarm")
        if longest(noticed, 300) >= SERVICES_ALARM_S:
            fired.append("ServicesAlarm")
        full = [t for t, text in health if start["t"] <= t <= end["t"] and re.search(r"data (8[5-9]|9\d|100)%", text)]
        if longest(full, 300) >= DISK_ALARM_S:
            fired.append("DataDiskAlarm")
        if any(start["t"] <= t <= end["t"] + 300 for t in alerts):
            fired.append("GatewayAlertAlarm")
        after = f"after {(noticed[0] - start['t']) // 60} min" if noticed else "no"
        back = "never" if end["what"] == "never" else f"{(end['t'] - start['t']) // 60} min {(end['t'] - start['t']) % 60} s"
        lines.append(
            f"| {fault} | {skipped or back} | {'no, by hand' if by_hand else 'yes' if end['what'] == 'recovered' else '**no**'} "
            f"| {'; '.join(seen) or 'nothing'} | {after} "
            f"| {', '.join(fired) or 'none'} |"
        )
    lines += [
        "",
        "Held to: RUNBOOKS' table (a feed down leaves routes, nav logs and Briefs answering on the stored copy, "
        "and says so where the figure goes); a crash back by itself (Docker's restart policy); a hang back by "
        "itself through health.sh; any outage over 15 minutes alarmed. The origin certificate's figure is 0 on "
        "the Mac (no Caddy), so OriginCertAlarm is not judged here.",
    ]
    return lines


def changeover(dir: Path) -> list[str]:
    target = rows(dir / "target.json")
    polls = rows(dir / "polls.jsonl")
    if not target or not polls:
        return ["Not run yet."]
    epoch, at = target[0]["epoch"], target[0]["at"]
    day = at[:10]
    lines = [f"Rehearsed across {at} with a faked clock (libfaketime).", ""]
    before = [p for p in polls if p["faked"] < epoch]
    after = [p for p in polls if p["faked"] >= epoch + 120]

    def cycles(p: dict) -> list[dict]:
        return ((p.get("status") or {}).get("data_cycles")) or []

    false = sorted({c["name"] for p in before for c in cycles(p) if c.get("state") == "expired"})
    lines.append(f"- No false warning before 0901Z: {'**no**, ' + ', '.join(false) if false else 'yes'} ({len(before)} polls).")
    switched = [c for p in after[-1:] for c in cycles(p) if c.get("kind") in ("airac", "chart")]
    late = sorted({c["name"] for c in switched if c.get("current") != day})
    lines.append(f"- The switch at 0901Z: {'**no**, still on the old edition: ' + ', '.join(late) if late else 'yes' if switched else 'no polls after'}.")
    served = [(p.get("chart") or {}).get("chart_cycle") for p in after]
    name = f"{day[5:7]}-{day[8:10]}-{day[:4]}"
    lines.append(f"- The map's chart cycle after: {served[-1] if served else 'unknown'} ({'the new one' if served and served[-1] == name else '**not the new one**'}).")
    nxt = ((before[-1].get("status") or {}).get("charts") or {}).get("next") if before else None
    offline = (before[-1].get("offline") or {}) if before else {}
    staged = bool(nxt and nxt.get("state") in ("staged", "swapped")) or offline.get("next_cycle") == name
    lines.append(f"- Staged before its date: {'yes' if staged else '**no**'} (charts.next {json.dumps(nxt)[:160]}; offline next_cycle {offline.get('next_cycle')}).")
    try:
        kept = json.loads((dir / "kept.json").read_text())
    except (OSError, ValueError):
        kept = None
    if kept:
        ok = kept["before"]["state"] != "expired" and kept["at"]["state"] == "expired" and kept["after"]["state"] == "expired"
        lines.append(
            f"- The phones' kept regions (engine data_cycle as OfflineKept asks it, cycle {kept['kept_cycle']}): "
            f"{kept['before']['state']} at 0900Z, {kept['at']['state']} at 0901Z, {kept['after']['state']} at 0902Z: {'yes' if ok else '**no**'}."
        )
    for phone in ("ios", "android"):
        path = dir / f"phones-{phone}.txt"
        if path.exists():
            lines.append(f"- The {phone} test of it: {'passed' if path.read_text().rstrip().endswith('ok') else '**failed**, see ' + path.name}.")
    log = (dir / "planner.log").read_text(errors="replace") if (dir / "planner.log").exists() else ""
    lines.append(f"- \"FAA data past its cycle\" in the faked planner's log: {log.count('past its cycle')} times.")
    return lines


def osv(dir: Path) -> list[str]:
    lines = ["| Lockfile | Package | Version | Advisory | Severity | Triage |", "|---|---|---|---|---|---|"]
    for path in sorted(dir.glob("*.json")):
        data = json.loads(path.read_text() or "{}") if path.stat().st_size else {}
        source = path.stem.replace("_", "/")
        for result in data.get("results", []):
            for pkg in result.get("packages", []):
                groups = {i: g.get("max_severity", "") for g in pkg.get("groups", []) for i in g.get("ids", [])}
                for vuln in pkg.get("vulnerabilities", []):
                    fixed = [e["fixed"] for a in vuln.get("affected", []) for r in a.get("ranges", []) for e in r.get("events", []) if "fixed" in e]
                    triage = "dev only: bump with the next upgrade" if DEV_ONLY.search(source) else f"bump to {fixed[-1]}" if fixed else "no fix yet: watch"
                    p = pkg.get("package", {})
                    lines.append(f"| {source} | {p.get('name')} | {p.get('version')} | {vuln['id']} | {groups.get(vuln['id'], '?')} | {triage} |")
    return lines if len(lines) > 2 else ["No known vulnerability in any lockfile."]


def trivy(dir: Path) -> list[str]:
    lines = ["| Image | Package | Installed | Advisory | Severity | Triage |", "|---|---|---|---|---|---|"]
    for path in sorted(dir.glob("*.json")):
        data = json.loads(path.read_text()) if path.stat().st_size else {}
        for result in data.get("Results", []):
            for v in result.get("Vulnerabilities") or []:
                if not v.get("FixedVersion"):
                    triage = "no fix yet: watch"
                elif result.get("Class") == "os-pkgs":
                    triage = f"base image: rebuild on its newest digest ({v['FixedVersion']})"
                else:
                    triage = f"bump {v['PkgName']} to {v['FixedVersion']}"
                lines.append(f"| {path.stem} | {v['PkgName']} | {v['InstalledVersion']} | {v['VulnerabilityID']} | {v['Severity']} | {triage} |")
    return lines if len(lines) > 2 else ["No HIGH or CRITICAL vulnerability in any image."]


def zap(dir: Path) -> list[str]:
    lines = ["| Scan | Alert | Risk | Instances | Triage |", "|---|---|---|---|---|"]
    for scan in ("web", "api"):
        data = json.loads((dir / f"{scan}.json").read_text()) if (dir / f"{scan}.json").exists() else {}
        for site in data.get("site", []):
            for a in site.get("alerts", []):
                risk = int(a.get("riskcode", 0))
                triage = "informational" if risk == 0 else "to fix" if risk >= 2 else "to triage"
                lines.append(f"| {scan} | {a.get('alert')} | {a.get('riskdesc')} | {len(a.get('instances', []))} | {triage} |")
    return lines if len(lines) > 2 else ["Not run yet, or no alert."]


def scans(dir: Path) -> list[str]:
    return [
        "Each finding's triage is a first pass by rule (dev-only lockfiles, fix available, base image); "
        "the agent or owner confirms it before acting.",
        "",
        "### osv-scanner, the lockfiles",
        "",
        *(osv(dir / "osv") if (dir / "osv").exists() else ["Not run yet."]),
        "",
        "### trivy, the images (HIGH and CRITICAL)",
        "",
        *(trivy(dir / "trivy") if (dir / "trivy").exists() else ["Not run yet."]),
        "",
        "### OWASP ZAP baseline",
        "",
        *(zap(dir / "zap") if (dir / "zap").exists() else ["Not run yet."]),
    ]
