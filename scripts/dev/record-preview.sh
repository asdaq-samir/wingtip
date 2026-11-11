#!/usr/bin/env bash
# Records an App Preview from the iOS app in a simulator, driven by one UI
# test (docs/store/preview-video.md has the plan and the shots):
#
#   scripts/dev/record-preview.sh "<simulator name>" <Class/test> [out dir]
#   WINGTIP_HOST=localhost:18443 scripts/dev/record-preview.sh \
#     "iPhone 18 Pro Max" FlowTests/testTheBriefOpens docs/store/preview
#
# Boots the simulator, sets the status bar to Apple's marketing look,
# starts `simctl io recordVideo`, runs the test with xcodebuild, stops the
# recording with SIGINT (which makes recordVideo finish the file), then
# trims and scales it with ffmpeg in Docker to what App Store Connect
# takes for a 6.9" or 6.5" iPhone: 886 x 1920, 30 fps, H.264, a silent
# stereo track, at most 30 s. Writes <out>/<test>-raw.mov and
# <out>/<test>-886x1920.mp4.
#
# Not run in CI; on the owner's Mac run it through
# scripts/dev/one-at-a-time.sh (it builds and tests in Xcode), against a
# throwaway stack, never the owner's live one. Needs xcodegen, Xcode and
# Docker. The film is not committed.
set -euo pipefail

if [ $# -lt 2 ]; then
  sed -n '2,8p' "$0" >&2
  exit 2
fi
device_name=$1
test_id=$2
here=$(cd "$(dirname "$0")/../.." && pwd)
out=${3:-$here/docs/store/preview}
mkdir -p "$out"
out=$(cd "$out" && pwd)
name=${test_id##*/}
raw="$out/$name-raw.mov"
final="$out/$name-886x1920.mp4"
# A pinned ffmpeg image, so the same input gives the same film anywhere.
ffmpeg_image=${FFMPEG_IMAGE:-jrottenberg/ffmpeg:6.1-ubuntu}
max_seconds=${PREVIEW_SECONDS:-30}

# The simulator by its name, the newest runtime's first.
udid=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
name = sys.argv[1]
found = [d["udid"] for _, ds in sorted(json.load(sys.stdin)["devices"].items(), reverse=True)
         for d in ds if d["name"] == name]
print(found[0] if found else "")' "$device_name")
if [ -z "$udid" ]; then
  echo "record-preview: no available simulator named \"$device_name\" (xcrun simctl list devices)" >&2
  exit 1
fi
echo "record-preview: $device_name ($udid), $test_id"

xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b >/dev/null
# 9:41, full battery and bars, as Apple's own marketing shows a phone.
xcrun simctl status_bar "$udid" override --time 9:41 --dataNetwork wifi \
  --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 \
  --batteryState charged --batteryLevel 100

(cd "$here/apps/ios" && xcodegen --quiet)

rm -f "$raw"
xcrun simctl io "$udid" recordVideo --codec=h264 --force "$raw" &
recorder=$!
# recordVideo takes a moment to start writing; a test that starts first
# loses its opening seconds.
sleep 2

status=0
xcodebuild -project "$here/apps/ios/Wingtip.xcodeproj" -scheme Wingtip \
  -destination "id=$udid" \
  -only-testing:"WingtipUITests/$test_id" \
  test WINGTIP_HOST="${WINGTIP_HOST:-wingtipmaps.app}" -quiet || status=$?

kill -INT "$recorder"
wait "$recorder" || true
xcrun simctl status_bar "$udid" clear || true

if [ ! -s "$raw" ]; then
  echo "record-preview: no film was written ($raw)" >&2
  exit 1
fi
if [ "$status" -ne 0 ]; then
  echo "record-preview: the test failed ($status); the film is kept, check it before using it" >&2
fi

# Scaled to fill 886 x 1920 and cropped to it (the simulator's screen is
# a little taller than 886:1920), 30 fps, the first $max_seconds s, H.264
# High at yuv420p as Connect wants, with a silent stereo AAC track.
docker run --rm -v "$out:/work" "$ffmpeg_image" \
  -y -i "/work/$(basename "$raw")" \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -t "$max_seconds" -r 30 \
  -vf "scale=886:1920:force_original_aspect_ratio=increase,crop=886:1920,setsar=1" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 18 \
  -c:a aac -b:a 128k -shortest -movflags +faststart \
  "/work/$(basename "$final")"

echo "record-preview: $final"
exit "$status"
