#!/usr/bin/env python3
"""What the planner has to work with, as notices on the commit's checks
(ci.yml's e2e job, the first shard; the shards' stacks are alike): its
status (FAA files, weather, charts, corridors, services), the warm-up's
lines of its log, and whether the sources it fetches answer from the
runner. A job's log takes admin rights to read, an annotation does not.
"Warm" means the warm-up finished, not that every fetch in it succeeded,
and a planner without its obstacle file or its charts answers every nav
log and tile slowly and wrongly. Never fails.

  python3 scripts/ci/e2e_planner_data.py      against the stack on localhost
"""

import json
import subprocess
import urllib.request

KEPT = ("warm-up", "unavailable", "downloaded", "prepared ", "Error", "error", "Traceback", "refreshed")
SOURCES = (
    "https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/",
    "https://aeronav.faa.gov/visual/09-03-2026/sectional-files/Chicago.zip",
    "https://epqs.nationalmap.gov/v1/json?x=-88.09&y=42.32&units=Feet&wkid=4326",
    "https://davidmegginson.github.io/ourairports-data/airports.csv",
    "https://aviationweather.gov/data/cache/metars.cache.csv.gz",
)


def notice(title: str, text: str) -> None:
    text = text.replace("%", "%25").replace("\r", "").replace("\n", "%0A")[:4000]
    print(f"::notice title={title}::{text}")


def main() -> None:
    try:
        s = json.load(urllib.request.urlopen("http://localhost:8084/api/status", timeout=60))
        data = {
            "faa_files": [f["name"] for f in s["faa_files"]],
            "weather": {w["name"]: w["fetched_at"] for w in s["weather"]},
            "charts": s["charts"]["prepared"],
            "corridors": len(s["corridors"]),
            "services": {k: (v or {}).get("up") for k, v in s["services"].items()},
        }
        notice("planner data", json.dumps(data))
    except Exception as err:  # noqa: BLE001 -- a report, never a failure
        notice("planner status", f"unavailable: {err!r}")
    compose = ["docker", "compose", "-f", "docker-compose.yml", "-f", "infra/docker-compose.ci.yml"]
    log = subprocess.run([*compose, "logs", "--no-color", "--tail", "400", "planner"], capture_output=True, text=True).stdout
    kept = [line.split("| ", 1)[-1] for line in log.splitlines() if any(k in line for k in KEPT)]
    notice("planner log", "\n".join(kept[-40:]) or "(nothing matched)")
    reach: dict[str, object] = {}
    for url in SOURCES:
        try:
            request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "wingtip-maps/0.1"})
            reach[url] = urllib.request.urlopen(request, timeout=20).status
        except Exception as err:  # noqa: BLE001 -- a report, never a failure
            reach[url] = repr(err)[:120]
    notice("reachable from the runner", json.dumps(reach))


if __name__ == "__main__":
    main()
