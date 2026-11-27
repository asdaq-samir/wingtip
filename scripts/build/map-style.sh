#!/usr/bin/env bash
# Generates each app's overlay layers from design/map-style.json, the one
# source of the layers the web's and Android's MapLibre maps draw from the
# cycle's vector tiles (iOS draws with MapKit and reads none of it):
#
#   apps/web/src/lib/generated/overlayLayers.ts            the web's OVERLAY_LINES and OVERLAY_MARKS
#   apps/android/.../map/generated/OverlayStyle.kt         Android's OverlayStyle
#
#   scripts/build/map-style.sh           write them
#   scripts/build/map-style.sh --check   fail where one differs (CI)
#
# Python's standard library alone, as design-tokens.sh is.
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
exec python3 "$here/scripts/build/map_style.py" "$@"
