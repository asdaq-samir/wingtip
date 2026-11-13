#!/usr/bin/env bash
# The App Store build (native-ios.yml, testflight, main only): archived,
# signed with the App Store Connect key, exported and uploaded to
# TestFlight, then the export's push entitlement read where an .ipa is
# left. Env: KEY_ID, KEY_P8, ISSUER, TEAM, WINGTIP_URL, WINGTIP_BUNDLE_ID,
# RUN_NUMBER, RUNNER_TEMP.
set -euo pipefail
key="$RUNNER_TEMP/AuthKey_$KEY_ID.p8"
trap 'rm -f "$key"' EXIT
printf '%s' "$KEY_P8" > "$key"
host=$(python3 -c "from urllib.parse import urlparse; print(urlparse('$WINGTIP_URL').hostname)")
auth=(-allowProvisioningUpdates -authenticationKeyPath "$key" -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER")
xcodebuild -project apps/ios/Wingtip.xcodeproj -scheme Wingtip -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$RUNNER_TEMP/Wingtip.xcarchive" "${auth[@]}" \
  DEVELOPMENT_TEAM="$TEAM" WINGTIP_BUNDLE_ID="$WINGTIP_BUNDLE_ID" WINGTIP_HOST="$host" \
  CURRENT_PROJECT_VERSION="$RUN_NUMBER" archive | tail -40
cat > "$RUNNER_TEMP/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>automatic</string>
</dict></plist>
PLIST
xcodebuild -exportArchive -archivePath "$RUNNER_TEMP/Wingtip.xcarchive" \
  -exportOptionsPlist "$RUNNER_TEMP/ExportOptions.plist" -exportPath "$RUNNER_TEMP/export" "${auth[@]}"
# Push in the App Store build is production: project.yml keeps
# aps-environment development, which the archive's development
# signing needs, and the export re-signs with the distribution
# profile, whose aps-environment (production) Xcode writes in.
# Where the export left the .ipa, its entitlements are read to
# be sure; an upload-only export leaves none, and App Store
# Connect's build metadata shows the same (docs/NATIVE.md).
ipa=$(ls "$RUNNER_TEMP"/export/*.ipa 2>/dev/null | head -1)
if [ -n "$ipa" ]; then
  rm -rf "$RUNNER_TEMP/ipa" && mkdir -p "$RUNNER_TEMP/ipa" && unzip -q "$ipa" -d "$RUNNER_TEMP/ipa"
  codesign -d --entitlements - --xml "$RUNNER_TEMP"/ipa/Payload/*.app 2>/dev/null | plutil -extract aps-environment raw -o - - | grep -qx production \
    || { echo "::error::the exported app's aps-environment is not production"; exit 1; }
else
  echo "::notice::upload-only export: check aps-environment in App Store Connect's build metadata"
fi
