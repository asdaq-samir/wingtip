#!/usr/bin/env bash
# Generates each app's shared words from design/wording.json, the one
# source of the words the web, the iPhone and Android say the same:
#
#   apps/web/src/lib/wording/generated/wording.ts             the web's WORDING
#   apps/ios/Wingtip/Design/Generated/Wording.swift           iOS's Wording
#   apps/android/app/src/main/res/values/wording_strings.xml  Android's R.string.wording_*
#   docs/design/rules.md                                      its table, section 14
#
#   scripts/build/wording.sh           write them
#   scripts/build/wording.sh --check   fail where one differs, or a word breaks the rules (CI)
#
# Python's standard library alone, as screens.sh is.
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
exec python3 "$here/scripts/build/wording.py" "$@"
