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
# x86-64 everywhere, emulated on the Mac: librsvg's text antialiasing
# differs between arm64 and x86-64 builds (the Play feature graphic's
# words drew differently on the Mac mini and CI's runner, 2026-11-09),
# so one architecture draws every committed pixel.
image=wingtip-brand-render-amd64
docker build -q --platform linux/amd64 -t "$image" -f "$here/scripts/build/brand-render.Dockerfile" "$here/scripts/build" >/dev/null
exec docker run --rm --platform linux/amd64 -u "$(id -u):$(id -g)" -v "$here:/repo" -w /repo "$image" \
  python3 scripts/build/store_frames.py "$@"
