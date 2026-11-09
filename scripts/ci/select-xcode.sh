#!/usr/bin/env bash
# The Xcode .tool-versions names (`xcode`), found among the Mac's Xcode
# apps and printed as its DEVELOPER_DIR; in a GitHub job, also set for the
# job's later steps through $GITHUB_ENV. DEVELOPER_DIR rather than `sudo
# xcode-select -s`: the Mac mini's runner has no password-less sudo, and
# GitHub's macOS image keeps several Xcodes side by side (Xcode_27.2.app),
# whose default can be another than the one the app is built with. No
# match is an error, not a fallback to the newest: one Xcode everywhere.
#
#   scripts/ci/select-xcode.sh                      in a workflow step
#   export DEVELOPER_DIR=$(scripts/ci/select-xcode.sh)   on the Mac
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
want=$("$here/scripts/build/toolchain.sh" get xcode)

found=""
for app in "/Applications/Xcode_$want.app" "/Applications/Xcode_$want.0.app" /Applications/Xcode.app /Applications/Xcode*.app; do
  [ -d "$app" ] || continue
  got=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$app/Contents/Info.plist" 2>/dev/null || true)
  if [ "$got" = "$want" ] || [ "$got" = "$want.0" ]; then found=$app; break; fi
done
if [ -z "$found" ]; then
  echo "::error title=No Xcode $want::.tool-versions names Xcode $want and this Mac has none in /Applications" >&2
  exit 1
fi

dir=$found/Contents/Developer
[ -z "${GITHUB_ENV:-}" ] || echo "DEVELOPER_DIR=$dir" >> "$GITHUB_ENV"
DEVELOPER_DIR=$dir xcodebuild -version >&2
echo "$dir"
