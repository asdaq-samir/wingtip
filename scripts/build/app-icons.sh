#!/usr/bin/env bash
# Draws every app's icons and launch art from the brand's SVG sources
# (docs/brand) and the launch colours (design/tokens.json color.brand):
#
#   apps/ios/Wingtip/Assets.xcassets       AppIcon (light, dark, tinted),
#                                          LaunchBackground, LaunchMark
#   apps/ios/WingtipWatch/Assets.xcassets  the watch's AppIcon
#   apps/android/app/src/main/res          the adaptive icon's layers, the
#                                          notification icon, the splash
#   apps/web/public, apps/site/assets      favicon.svg/.ico, the Home
#                                          Screen and manifest icons, the
#                                          installed app's launch images
#   docs/brand/app-store-1024.png, docs/store/play-*.png
#
#   scripts/build/app-icons.sh           write them
#   scripts/build/app-icons.sh --check   fail where one differs (CI)
#
# In Docker (scripts/build/brand-render.Dockerfile: librsvg, Pillow and the
# brand's typeface, pinned), so the Mac and the runner draw the same.
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
  python3 scripts/build/app_icons.py "$@"
