#!/usr/bin/env bash
# The browser suite's overlay tiles (apps/web/e2e/fixtures/overlay-tiles):
# the map's FAA overlays as the charts job builds them (charts.overlays),
# cut to the box round Chicago and west of it that the specs look at --
# C81, O'Hare, Midway, Wheeling, Waukegan, Rockford and the fields a pan
# west of them brings in -- for CI's stack, whose planner builds no cycle
# pack (CYCLE_PACK=0 in infra/docker-compose.ci.yml) and so no archive of
# its own. The e2e job copies it into data/raw/packs/tiles before the
# planner starts.
#
# Built from this machine's cycle pack and NASR files (data/raw, the
# local stack's), in the charts job's image, which has tippecanoe
# (`docker compose build charts`). Run it again when vector_tiles.VERSION
# changes: services/jobs/charts/tests/test_overlays.py checks the copy's
# version against it.
#
#   scripts/build/e2e-overlay-tiles.sh [charts image]
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
data=${WINGTIP_DATA:-$(git -C "$here" worktree list --porcelain | awk 'NR==1 {print $2}')/data/raw}
image=${1:-wingtip-charts:latest}
out=$here/apps/web/e2e/fixtures/overlay-tiles
# West, south, east, north.
bbox="-91.5, 41.4, -87.2, 43.4"

mkdir -p "$out"
rm -f "$out"/*.pmtiles "$out"/overlays.json
docker run --rm --entrypoint python \
  -v "$here/services/planner:/workspace/services/planner:ro" \
  -v "$here/services/jobs:/workspace/services/jobs:ro" \
  -v "$data:/workspace/data/raw:ro" \
  -v "$out:/out" \
  "$image" -c "
import json
from charts import overlays
from wingtip import altitude, cycle_pack
pack = cycle_pack.current()
assert pack is not None, 'no cycle pack in data/raw/packs: start the local stack once'
print(json.dumps(overlays.build(pack, altitude.DEFAULT_FAA_CACHE_DIR, '/out', bbox=($bbox))))
"
ls -l "$out"
