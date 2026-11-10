#!/usr/bin/env bash
# Generates each app's design tokens from design/tokens.json, the one
# source of Wingtip's colours, type, spacing, corners, materials, motion
# and tap targets:
#
#   apps/web/src/styles/tokens.css                 CSS custom properties
#   apps/web/src/lib/tokens.ts                     the same for JS
#   apps/ios/Wingtip/Design/Generated/Tokens.swift UIColor, Font, CGFloat
#   apps/android/.../design/generated/Tokens.kt    Color, Typography, Dp
#
#   scripts/build/design-tokens.sh           write them
#   scripts/build/design-tokens.sh --check   fail where one differs (CI)
#
# The generator is Python's standard library alone (3.9 and up), so
# nothing is installed and nothing drifts: the same input gives the same
# bytes on the Mac and on the runner.
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
exec python3 "$here/scripts/build/design_tokens.py" "$@"
