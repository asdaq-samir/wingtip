#!/usr/bin/env bash
# A Studio track made ready for the simulator replay agent, on the Mac:
#
#   [RATE_HZ=10] tools/msfs-agent/prepare-track.sh N901TQ 2026-11-11 [23:40 23:59:59] > track.json
#
# The airplane's UTC day as the planner's /api/studio/track gives it (the
# Studio's own track store), cut to the flight between the two UTC times,
# then made ready by the engine's replay_track (engine/crates/route/
# contract/replay_track.json): its gaps marked and listed, nothing smoothed
# across them, the height averaged, the vertical speed worked out. Then the
# engine's sim_flight (contract/sim_flight.json), the Studio's simulator
# export, draws each run between two gaps as frames, RATE_HZ a second (10
# by default, the export's): the path, the altitude set on the altimeter
# setting the airplane sent, and the heading, pitch and bank estimated,
# with their sources. The agent reads those frames and holds no rule of
# its own; it only eases the airplane from one frame to the next.
#
# It wants the local stack up (the planner on 127.0.0.1:8084, the engine
# in its container). The export keeps adsb.lol's source and licence (ODbL
# 1.0), which a copy of its data must carry.
set -euo pipefail

planner=${PLANNER_URL:-http://127.0.0.1:8084}
container=${PLANNER_CONTAINER:-wingtip-planner-1}
rate=${RATE_HZ:-10}
[ $# -ge 2 ] || { sed -n '2,4p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 64; }
who=$1 day=$2 from=${3:-00:00} to=${4:-23:59:59}

raw=$(mktemp)
trap 'rm -f "$raw"' EXIT
curl -fsS -m 120 "$planner/api/studio/track?q=$who&day=$day" -o "$raw"

# The cut, in the planner's container's Python (the Mac has only the
# system's), then the engine's replay_track and sim_flight on it, in the
# same container.
docker exec -i "$container" python -c '
import datetime as dt, json, sys
from wingtip.engine import ask

day, start, end, rate = sys.argv[1:5]
track = json.load(sys.stdin)
def at(hms):
    return dt.datetime.fromisoformat(f"{day}T{hms}+00:00").timestamp()
lo, hi = at(start), at(end)
reports = [p for p in track["points"] if lo <= p["t"] <= hi]
if not reports:
    sys.exit(f"prepare-track: no reports between {start} and {end} UTC")
ready = ask("replay_track", points=reports)
# The altimeter settings the airplane sent, as the Studio export reads
# them (apps/web features/replay/track.ts).
settings = [{"t": r["t"], "hpa": r["qnh_hpa"], "alt_ft": r.get("alt_ft")} for r in reports if r.get("qnh_hpa")]
sim = ask("sim_flight", points=ready["points"], settings=settings, pressure=track["altitude"] == "pressure", rate_hz=float(rate))
# What the agent reads of each frame, rounded past what a simulator draws.
keep = {"t": 2, "lat": 6, "lon": 6, "alt_ft": 1, "gs_kt": 1, "track_deg": 2, "pitch_deg": 2, "bank_deg": 2}
segments = [
    {"msl": s["msl"], "rows": [{**{k: round(f[k], n) for k, n in keep.items()}, "ground": f["ground"]} for f in s["rows"]]}
    for s in sim["segments"]
]
meta = {k: track[k] for k in ("hex", "registration", "type", "day", "altitude", "source", "license")}
json.dump({**meta, "from_utc": start, "to_utc": end, **ready, "rate_hz": float(rate), "segments": segments}, sys.stdout, indent=1)
print()
' "$day" "$from" "$to" "$rate" <"$raw"
