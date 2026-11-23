#!/usr/bin/env bash
# native-ios.yml's night: what each device shows on launch (an iPad its
# search too), to $RUNNER_TEMP/screens, a picture for a reader, not a check.
# Env: SIM (the simulator's id), DEVICE (the matrix's device), RUNNER_TEMP
# and WINGTIP_BUNDLE_ID; the app from the leg's Build/Products.
set -euo pipefail
app="$RUNNER_TEMP/derived/Build/Products/Debug-iphonesimulator/Wingtip.app"
name=$(echo "$DEVICE" | tr 'A-Z ' 'a-z-')
mkdir -p "$RUNNER_TEMP/screens"
xcrun simctl boot "$SIM" 2>/dev/null || true
xcrun simctl bootstatus "$SIM" -b > /dev/null
xcrun simctl install "$SIM" "$app"
xcrun simctl privacy "$SIM" grant location "$WINGTIP_BUNDLE_ID" || true
xcrun simctl launch "$SIM" "$WINGTIP_BUNDLE_ID"
sleep 25
xcrun simctl io "$SIM" screenshot "$RUNNER_TEMP/screens/$name.png"
[ "$name" = ipad ] || exit 0
xcrun simctl terminate "$SIM" "$WINGTIP_BUNDLE_ID" || true
xcrun simctl launch "$SIM" "$WINGTIP_BUNDLE_ID" -screen airport
sleep 15
xcrun simctl io "$SIM" screenshot "$RUNNER_TEMP/screens/ipad-search.png"
