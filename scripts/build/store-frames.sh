#!/usr/bin/env bash
# Frames the store screenshots (scripts/build/store_frames.py): each
# capture in docs/store/screenshots/raw/<device>/ under its headline from
# captions.json, at the App Store's 6.9" and 6.5" iPhone and 13" iPad
# sizes and Google Play's phone size, into docs/store/screenshots/<size>/.
# In the brand-render image (scripts/build/brand-render.Dockerfile), for
# Barlow and Pillow. docs/store/screenshots/README.md says how the
# captures are taken.
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
command -v docker >/dev/null || PATH="$PATH:/usr/local/bin:$HOME/.docker/bin"
image=wingtip-brand-render
docker build -q -t "$image" -f "$here/scripts/build/brand-render.Dockerfile" "$here/scripts/build" >/dev/null
exec docker run --rm -u "$(id -u):$(id -g)" -v "$here:/repo" -w /repo "$image" \
  python3 scripts/build/store_frames.py "$@"
