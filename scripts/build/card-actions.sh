#!/usr/bin/env bash
# Generates each app's card action table from design/card-actions.json,
# the one list of each kind of card's actions, in order, with each one's
# label (design/wording.json) and glyph (docs/design/icons.md):
#
#   apps/web/src/lib/generated/cardActions.ts            the web's ACTION and CARD_ACTIONS
#   apps/ios/Wingtip/Design/Generated/CardActions.swift  iOS's CardAction and CardKind
#   apps/android/.../design/generated/CardActions.kt     Android's CardAction and CardKind
#   docs/design/icons.md                                 its card table
#
#   scripts/build/card-actions.sh           write them
#   scripts/build/card-actions.sh --check   fail where one differs, or the file names a word or glyph there is not (CI)
#
# Python's standard library alone, as wording.sh is.
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
exec python3 "$here/scripts/build/card_actions.py" "$@"
