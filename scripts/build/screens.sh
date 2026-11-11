#!/usr/bin/env bash
# Generates each app's list of screens, and the links that open them, from
# design/screens.json, the one source of the app's deep links:
#
#   apps/web/src/lib/navigation/generated/screens.ts       the web's
#   apps/ios/Wingtip/Navigation/Generated/Screens.swift    iOS's
#   apps/android/.../navigation/generated/Screens.kt       Android's
#   docs/navigation.md                                     its table of links
#
#   scripts/build/screens.sh           write them
#   scripts/build/screens.sh --check   fail where one differs (CI)
#
# Python's standard library alone, as design-tokens.sh is.
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
exec python3 "$here/scripts/build/screens.py" "$@"
