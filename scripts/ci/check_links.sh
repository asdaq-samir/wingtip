#!/usr/bin/env bash
# The relative links and #fragments in the repository's Markdown, checked by
# lychee at .tool-versions' version (settings: lychee.toml), offline. Its
# heading anchors are GitHub's, which was proved against the check this
# replaced (2026-11-12): the same 108 files had no broken link, and a file
# of awkward headings (code, quotes, punctuation, accents, duplicates)
# resolved the same.
#
#   scripts/ci/check_links.sh            every tracked *.md
#   scripts/ci/check_links.sh a.md b.md  only these
set -euo pipefail
cd "$(dirname "$0")/../.."
# Not installable here: a skip (3) on a Mac, a failure in CI (guards.sh reads both).
scripts/build/tool.sh --have lychee || { echo "no lychee here"; [ -z "${GITHUB_ACTIONS:-}" ] && exit 3; exit 1; }
# Bash 3.2 (the Mac's) has no mapfile: the list goes through xargs.
if [ $# -eq 0 ]; then
  git ls-files -z '*.md' | grep -zv node_modules/ | xargs -0 scripts/build/tool.sh lychee --config lychee.toml --root-dir "$PWD" --format compact
else
  exec scripts/build/tool.sh lychee --config lychee.toml --root-dir "$PWD" --format compact "$@"
fi
