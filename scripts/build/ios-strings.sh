#!/usr/bin/env bash
# Brings the iPhone's string catalog (apps/ios/Wingtip/Localizable.xcstrings)
# up to date with the words the Swift says, from a build's extracted strings.
#
# SWIFT_EMIT_LOC_STRINGS (apps/ios/project.yml) has the compiler write each
# Swift file's localisable strings (every Text, LocalizedStringKey and
# LocalizedStringResource) to a .stringsdata file beside its object file.
# Xcode's editor merges those into the catalog; xcodebuild never does, so a
# catalog kept from the command line goes stale. This merges them with
# Xcode's own tool, `xcrun xcstringstool sync`: a new string is added, one
# no longer in the code is marked stale (or dropped, when it has no
# translation). Every target's strings go in, the app's, the widgets' and
# the Watch's: the catalog is the one list of the words to translate.
#
# It needs a build first (any xcodebuild of the Wingtip scheme, for any
# simulator or device). Only .stringsdata of the given configuration whose
# Swift file still exists are read, so a restored DerivedData's leftovers of
# a deleted file add nothing.
#
#   scripts/build/ios-strings.sh [--check] [--derived-data <dir>] [--configuration <name>]
#     --check            fail, naming the keys, where the catalog would change (CI,
#                        native-ios.yml, after its build)
#     --derived-data     the build's DerivedData (xcodebuild -derivedDataPath); by
#                        default Xcode's own folder for this checkout's project
#     --configuration    Debug by default
set -euo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
catalog=$here/apps/ios/Wingtip/Localizable.xcstrings
project=$here/apps/ios/Wingtip.xcodeproj

check=""
derived=""
config=Debug
while [ $# -gt 0 ]; do
  case $1 in
    --check) check=1 ;;
    --derived-data) derived=${2:?--derived-data needs a folder}; shift ;;
    --configuration) config=${2:?--configuration needs a name}; shift ;;
    *) echo "usage: scripts/build/ios-strings.sh [--check] [--derived-data <dir>] [--configuration <name>]" >&2; exit 2 ;;
  esac
  shift
done

# Xcode's own DerivedData folder for this project: the one whose info.plist
# names this checkout's project (its name ends in a hash of the path).
if [ -z "$derived" ]; then
  for d in "$HOME"/Library/Developer/Xcode/DerivedData/Wingtip-*; do
    [ -f "$d/info.plist" ] || continue
    if [ "$(plutil -extract WorkspacePath raw "$d/info.plist" 2>/dev/null)" = "$project" ]; then
      derived=$d
      break
    fi
  done
fi
intermediates=$derived/Build/Intermediates.noindex
if [ -z "$derived" ] || [ ! -d "$intermediates" ]; then
  echo "ios-strings: no build of $project found${derived:+ in $derived}: build the Wingtip scheme first (xcodebuild ... build-for-testing), or pass --derived-data" >&2
  exit 1
fi

# The configuration's .stringsdata whose source file is still there, one
# per source and file name (each architecture writes the same strings).
list=$(mktemp)
trap 'rm -f "$list"; [ -z "${tmp:-}" ] || rm -rf "$tmp"' EXIT
find "$intermediates" -path "*/$config-*/*" -name '*.stringsdata' -print0 \
  | python3 -c '
import json, os, sys
seen = set()
for path in sorted(p for p in sys.stdin.buffer.read().decode().split("\0") if p):
    try:
        source = json.load(open(path)).get("source", "")
    except (OSError, ValueError):
        continue
    # One per source and kind: a Swift file can have two, its own strings
    # and, for an AppShortcutsProvider, the Siri phrases the App Intents
    # tool extracts (ExtractedAppShortcutsMetadata.stringsdata).
    key = (source, os.path.basename(path))
    if source and os.path.exists(source) and key not in seen:
        seen.add(key)
        print(path)
' > "$list"
if [ ! -s "$list" ]; then
  echo "ios-strings: no $config .stringsdata in $intermediates: is SWIFT_EMIT_LOC_STRINGS on, and was the build $config?" >&2
  exit 1
fi
args=()
while IFS= read -r f; do args+=(--stringsdata "$f"); done < "$list"

if [ -z "$check" ]; then
  xcrun xcstringstool sync "$catalog" "${args[@]}"
  echo "ios-strings: $(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["strings"]))' "$catalog") keys in ${catalog#"$here"/} ($(wc -l < "$list" | tr -d ' ') Swift files read)"
  exit 0
fi

# The check syncs a copy, named as the catalog is (sync matches a strings
# table to the catalog by its file name), and compares.
tmp=$(mktemp -d)
cp "$catalog" "$tmp/Localizable.xcstrings"
xcrun xcstringstool sync "$tmp/Localizable.xcstrings" "${args[@]}"
if cmp -s "$catalog" "$tmp/Localizable.xcstrings"; then
  echo "ios-strings: ${catalog#"$here"/} is up to date"
  exit 0
fi
python3 - "$catalog" "$tmp/Localizable.xcstrings" <<'EOF'
import json, sys
old, new = (json.load(open(p))["strings"] for p in sys.argv[1:3])
added = sorted(set(new) - set(old))
gone = sorted(set(old) - set(new))
stale = sorted(k for k in new if new[k].get("extractionState") == "stale" and old.get(k, {}).get("extractionState") != "stale")
for label, keys in (("new", added), ("no longer in the code", gone), ("now stale", stale)):
    if keys:
        print(f"  {label} ({len(keys)}): " + ", ".join(repr(k) for k in keys[:20]) + (" ..." if len(keys) > 20 else ""))
EOF
echo "::error title=String catalog out of date::apps/ios/Wingtip/Localizable.xcstrings is not what the Swift says: run scripts/build/ios-strings.sh after a build and commit it"
exit 1
