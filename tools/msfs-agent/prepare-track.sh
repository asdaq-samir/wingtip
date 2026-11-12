#!/usr/bin/env bash
# A Studio track made ready for the simulator replay agent, on the Mac:
#
#   tools/msfs-agent/prepare-track.sh N901TQ 2026-11-11 [23:40 23:59:59] > track.json
#
# The airplane's UTC day as the planner's /api/studio/track gives it (the
# Studio's own track store), cut to the flight between the two UTC times,
# then made ready by the engine's replay_track (engine/crates/route/
# contract/replay_track.json): its gaps marked and listed, nothing smoothed
# across them, the height averaged, the vertical speed worked out. The
# agent reads that and holds no rule of its own about either; it only
# eases the airplane between two reports a frame at a time, as the web's
# replay does (features/replay/track.ts, sampleAt).
#
# It wants the local stack up (the planner on 127.0.0.1:8084, the engine
# in its container). The export keeps adsb.lol's source and licence (ODbL
# 1.0), which a copy of its data must carry.
set -euo pipefail

planner=${PLANNER_URL:-http://127.0.0.1:8084}
container=${PLANNER_CONTAINER:-wingtip-planner-1}
[ $# -ge 2 ] || { sed -n '2,4p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 64; }
who=$1 day=$2 from=${3:-00:00} to=${4:-23:59:59}

raw=$(mktemp)
trap 'rm -f "$raw"' EXIT
curl -fsS -m 120 "$planner/api/studio/track?q=$who&day=$day" -o "$raw"

# The cut, in the planner's container's Python (the Mac has only the
# system's), then the engine's replay_track on it, in the same container.
docker exec -i "$container" python -c '
import datetime as dt, json, sys
from wingtip.engine import ask

day, start, end = sys.argv[1:4]
track = json.load(sys.stdin)
def at(hms):
    return dt.datetime.fromisoformat(f"{day}T{hms}+00:00").timestamp()
lo, hi = at(start), at(end)
reports = [p for p in track["points"] if lo <= p["t"] <= hi]
if not reports:
    sys.exit(f"prepare-track: no reports between {start} and {end} UTC")
ready = ask("replay_track", points=reports)
meta = {k: track[k] for k in ("hex", "registration", "type", "day", "altitude", "source", "license")}
json.dump({**meta, "from_utc": start, "to_utc": end, **ready}, sys.stdout, indent=1)
print()
' "$day" "$from" "$to" <"$raw"
