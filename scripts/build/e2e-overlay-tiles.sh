#!/usr/bin/env bash
# The browser suite's overlay tiles (apps/web/e2e/fixtures/overlay-tiles):
# the map's FAA overlays as the planner builds them (wingtip.vector_tiles),
# cut to the box round Chicago and west of it that the specs look at --
# C81, O'Hare, Midway, Wheeling, Waukegan, Rockford and the fields a pan
# west of them brings in -- for CI's stack, whose planner builds no cycle
# pack (CYCLE_PACK=0 in infra/docker-compose.ci.yml) and so no archive of
# its own. The e2e job copies it into data/raw/packs/tiles before the
# planner starts.
#
# Built from this machine's cycle pack and NASR files (data/raw, the
# local stack's), in the planner's image, which has tippecanoe. Run it
# again when vector_tiles.VERSION changes:
# services/planner/tests_wingtip/test_vector_tiles.py checks the copy's
# version against it.
#
#   scripts/build/e2e-overlay-tiles.sh [planner image]
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
data=${WINGTIP_DATA:-$(git -C "$here" worktree list --porcelain | awk 'NR==1 {print $2}')/data/raw}
image=${1:-wingtip-planner:latest}
out=$here/apps/web/e2e/fixtures/overlay-tiles
# West, south, east, north.
bbox="-91.5, 41.4, -87.2, 43.4"

mkdir -p "$out"
rm -f "$out"/*.pmtiles "$out"/overlays.json
docker run --rm --entrypoint python \
  -v "$here/services/planner:/workspace/services/planner:ro" \
  -v "$data:/workspace/data/raw:ro" \
  -v "$out:/out" \
  "$image" -c "
import json
from wingtip import altitude, cycle_pack, vector_tiles
pack = cycle_pack.current()
assert pack is not None, 'no cycle pack in data/raw/packs: start the local stack once'
print(json.dumps(vector_tiles.build(pack, altitude.DEFAULT_FAA_CACHE_DIR, '/out', bbox=($bbox))))
"
ls -l "$out"
