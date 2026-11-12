#!/usr/bin/env bash
# The X-Plane 12 trial on the Mac (docs/XPLANE-TRIAL.md): the free demo
# replays a Studio flight through tools/xplane-driver (an XPPython3 plugin),
# runs a shot list of cameras and records it with X-Plane's own recorder.
#
#   scripts/dev/xplane-trial.sh check              X-Plane, XPPython3 and AutoOrtho there? (install steps if not)
#   scripts/dev/xplane-trial.sh sample             the sample flight in Studio, then its .fdr from your Downloads
#   scripts/dev/xplane-trial.sh install [SOURCE]   the plugin, the .fdr and shots.json into X-Plane (SOURCE: drive, menu, auto)
#   scripts/dev/xplane-trial.sh launch             start X-Plane
#   scripts/dev/xplane-trial.sh collect LABEL      the videos and logs since `install`, into ~/Movies/wingtip-xplane-trial
#   scripts/dev/xplane-trial.sh screen SECONDS     record the screen instead (macOS screencapture), if X-Plane's recorder fails
#
# XPLANE_DIR is the X-Plane folder (found in the usual places otherwise),
# PLANNER_URL the planner (http://127.0.0.1:8084, the live stack's),
# XPLANE_ACFT an airplane for the .fdr's ACFT line (a path from the X-Plane
# folder; the export names the Cessna 172 SP), FDR an exported file to use
# in place of the Downloads.
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
driver=$here/tools/xplane-driver
PLANNER_URL=${PLANNER_URL:-http://127.0.0.1:8084}
OUT=${XPLANE_TRIAL_OUT:-$HOME/Movies/wingtip-xplane-trial}
STATE=$OUT/.state

# The sample: Kenmore Air's DHC-2 Beaver N17598 from Kenmore (north Lake
# Washington) to Lake Union, 2026-11-11 20:23 to 20:34 UTC, inside the
# demo's Seattle scenery, with no gap over 33 s. A scheduled flight, not an
# accident. adsb.lol's reports (ODbL 1.0), kept in the fixture for when
# adsb.lol's history no longer has the day.
SAMPLE_TAIL=N17598
SAMPLE_DAY=2026-11-11
SAMPLE_AT="20:28 UTC"
SAMPLE_TRACE=$driver/sample/N17598-2026-11-11.trace.json

say() { printf '%s\n' "$*"; }
die() { printf 'xplane-trial: %s\n' "$*" >&2; exit 1; }

xplane_dir() {
  local d
  for d in "${XPLANE_DIR:-}" "$HOME/X-Plane 12 Demo" "$HOME/X-Plane 12" "$HOME/Desktop/X-Plane 12 Demo" \
    "$HOME/Desktop/X-Plane 12" "/Applications/X-Plane 12 Demo" "/Applications/X-Plane 12"; do
    [ -n "$d" ] && [ -d "$d/X-Plane.app" ] && { printf '%s\n' "$d"; return 0; }
  done
  d=$(find "$HOME" /Applications -maxdepth 3 -name X-Plane.app -type d 2>/dev/null | head -1)
  [ -n "$d" ] && { dirname "$d"; return 0; }
  return 1
}

check() {
  local xp ok=1
  if ! xp=$(xplane_dir); then
    say "X-Plane 12 is not installed. The free demo:"
    say "  1. Download the X-Plane 12 installer from https://www.x-plane.com/desktop/try-it/ (needs about 25 GB of disk)."
    say "  2. Open it, choose the free demo, and install to ~/X-Plane 12 Demo (or set XPLANE_DIR)."
    say "  3. Start X-Plane once, fly a minute at any Seattle airport, and quit, so it writes its folders."
    return 1
  fi
  say "X-Plane: $xp"
  if [ -d "$xp/Resources/plugins/XPPython3" ]; then
    say "XPPython3: there"
  else
    ok=0
    say "XPPython3 is not installed:"
    say "  1. Download XPPython3 for X-Plane 12 (4.7.1 or newer) from"
    say "     https://xppython3.readthedocs.io/en/latest/usage/installation_plugin.html"
    say "  2. Unzip it into \"$xp/Resources/plugins\", so there is a folder Resources/plugins/XPPython3."
    say "  3. Run: xattr -dr com.apple.quarantine \"$xp/Resources/plugins/XPPython3\""
    say "     (XPPython3's own \"Drop Quarantine\" app does the same; macOS blocks the plugin without it)."
    say "  4. Start X-Plane once: XPPython3 makes Resources/plugins/PythonPlugins."
  fi
  if grep -qi autoortho "$xp/Custom Scenery/scenery_packs.ini" 2>/dev/null; then
    say "AutoOrtho: in scenery_packs.ini (stop its streaming for the run without it)"
  else
    say "AutoOrtho: not installed (the first run is without it; docs/XPLANE-TRIAL.md, \"Adding AutoOrtho\")"
  fi
  [ "$ok" = 1 ]
}

planner_track() {
  curl -fsS -m 120 "$PLANNER_URL/api/studio/track?q=$SAMPLE_TAIL&day=$SAMPLE_DAY" 2>/dev/null |
    python3 -c 'import json, sys; print(len(json.load(sys.stdin)["points"]))' 2>/dev/null
}

sample() {
  local n hex marker fdr deadline
  mkdir -p "$STATE"
  curl -fsS -m 10 "$PLANNER_URL/" >/dev/null 2>&1 || die "the planner is not at $PLANNER_URL: start the stack (scripts/dev/go-live.sh)"
  if ! n=$(planner_track) || [ "${n:-0}" = 0 ]; then
    # adsb.lol's history keeps about six weeks (and answers 502 at times):
    # put the fixture's trace in the planner's store, where the Studio
    # reads a kept day from (wingtip.traffic.day_tracks).
    hex=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["icao"])' "$SAMPLE_TRACE")
    say "Studio has no $SAMPLE_TAIL on $SAMPLE_DAY from adsb.lol now: keeping the fixture's trace in the planner's store."
    docker compose -p wingtip exec -T planner python -c \
      "import json, sys; from wingtip.traffic import day_tracks; day_tracks._keep(sys.argv[1], sys.argv[2], json.load(sys.stdin))" \
      "$hex" "$SAMPLE_DAY" <"$SAMPLE_TRACE"
    n=$(planner_track) || die "the planner still has no track for $SAMPLE_TAIL on $SAMPLE_DAY"
  fi
  say "Studio's API: $SAMPLE_TAIL on $SAMPLE_DAY, $n reports."
  if [ -n "${FDR:-}" ]; then
    fdr=$FDR
  else
    marker=$STATE/sample-started
    touch "$marker"
    say ""
    say "In the Studio, signed in as the developer:"
    say "  1. Open https://localhost:8443/app/studio?q=$SAMPLE_TAIL&day=$SAMPLE_DAY"
    say "  2. Move the replay to $SAMPLE_AT (the flight from Kenmore to Lake Union)."
    say "  3. Export for simulator > X-Plane 12 > Flight data recorder (FDR). Where the browser"
    say "     offers a share sheet instead of a download, save the file and run FDR=<file> $0 sample."
    say "Waiting up to 15 minutes for the .fdr in ~/Downloads ..."
    deadline=$((SECONDS + 900))
    fdr=""
    while [ -z "$fdr" ] && [ "$SECONDS" -lt "$deadline" ]; do
      fdr=$(find "$HOME/Downloads" -maxdepth 1 -name "$SAMPLE_TAIL-*.fdr" -newer "$marker" 2>/dev/null | head -1)
      [ -n "$fdr" ] || sleep 3
    done
    [ -n "$fdr" ] || die "no $SAMPLE_TAIL-*.fdr came to ~/Downloads in 15 minutes; run again, or FDR=<file> $0 sample"
  fi
  [ -f "$fdr" ] || die "no file $fdr"
  cp "$fdr" "$STATE/sample.fdr"
  if [ -n "${XPLANE_ACFT:-}" ]; then
    python3 - "$STATE/sample.fdr" "$XPLANE_ACFT" <<'EOF'
import re, sys
path, acft = sys.argv[1], sys.argv[2]
text = open(path, encoding="utf-8").read()
open(path, "w", encoding="utf-8").write(re.sub(r"(?m)^ACFT, .*$", "ACFT, " + acft.replace("\\", "/"), text, count=1))
EOF
  fi
  say "The flight: $STATE/sample.fdr ($(grep -c '^[0-9]' "$STATE/sample.fdr") rows; $(grep -m1 '^ACFT' "$STATE/sample.fdr"))"
}

install() {
  local xp source=${1:-drive} plugins
  case "$source" in drive | menu | auto) ;; *) die "SOURCE is drive, menu or auto, not $source" ;; esac
  xp=$(xplane_dir) || die "no X-Plane folder: run $0 check"
  [ -d "$xp/Resources/plugins/XPPython3" ] || die "XPPython3 is not installed: run $0 check"
  [ -f "$STATE/sample.fdr" ] || die "no sample flight yet: run $0 sample"
  plugins=$xp/Resources/plugins/PythonPlugins
  mkdir -p "$plugins/wingtip_replay" "$xp/Output/wingtip"
  cp "$driver/PI_wingtip_replay.py" "$plugins/"
  cp "$driver"/wingtip_replay/*.py "$plugins/wingtip_replay/"
  cp "$STATE/sample.fdr" "$xp/Output/wingtip/sample.fdr"
  python3 - "$driver/shots.json" "$xp/Output/wingtip/shots.json" "$source" <<'EOF'
import json, sys
spec = json.load(open(sys.argv[1]))
spec["source"] = sys.argv[3]
json.dump(spec, open(sys.argv[2], "w"), indent=2)
EOF
  touch "$STATE/installed"
  date +%s >"$STATE/installed-at"
  say "Installed into $xp (source: $source)."
  say ""
  say "Before the first run, once: File > Configure video recording (X-Plane 12 may list it under"
  say "Settings): 30 frames a second, width 1920. Then:"
  say "  1. $0 launch, then New Flight: the Cessna 172 SP at Kenmore Air Harbor (S60) or Seattle"
  say "     Seaplanes (W55), any start, Start Flight."
  if [ "$source" = menu ]; then
    say "  2. File > Load Flight (Load Saved Flight) > Open Saved Flight Not Listed: pick"
    say "     $xp/Output/wingtip/sample.fdr, then Load Flight. Note whether it replays."
    say "  3. Plugins > Wingtip replay > Play the shot list."
  else
    say "  2. Plugins > Wingtip replay > Play the shot list (or set \"autostart\": true in Output/wingtip/shots.json)."
  fi
  say "  3. Hands off until the log says \"stopped: finished\" (about 6 minutes of footage), then quit X-Plane."
  say "  4. $0 collect <label>, e.g. $source-plain or $source-autoortho."
  say "The plugin's log: $xp/Output/wingtip/replay-log.txt"
}

launch() {
  local xp
  xp=$(xplane_dir) || die "no X-Plane folder: run $0 check"
  open -a "$xp/X-Plane.app"
}

collect() {
  local xp label=${1:-run} dest started files
  xp=$(xplane_dir) || die "no X-Plane folder"
  [ -f "$STATE/installed" ] || die "nothing installed yet: run $0 install"
  dest=$OUT/$(date +%Y-%m-%d-%H%M)-$label
  mkdir -p "$dest"
  started=$(cat "$STATE/installed-at")
  files=$(find "$xp/Output" -maxdepth 2 -type f \( -iname '*.mov' -o -iname '*.avi' -o -iname '*.mp4' \) -newer "$STATE/installed" 2>/dev/null || true)
  if [ -n "$files" ]; then
    while IFS= read -r f; do
      mv "$f" "$dest/"
      say "video: $dest/$(basename "$f") ($(du -h "$dest/$(basename "$f")" | cut -f1), $(mdls -raw -name kMDItemDurationSeconds "$dest/$(basename "$f")" 2>/dev/null || echo "?") s)"
    done <<<"$files"
  else
    say "No video in $xp/Output since the install: X-Plane's recorder wrote nothing (try $0 screen)."
  fi
  for f in "$xp/Output/wingtip/replay-log.txt" "$xp/XPPython3Log.txt" "$xp/Log.txt" "$xp/Output/wingtip/shots.json"; do
    [ -f "$f" ] && cp "$f" "$dest/"
  done
  say "From install to collect: $(($(date +%s) - started)) s. Everything is in $dest"
}

screen() {
  local seconds=${1:?how many seconds}
  mkdir -p "$OUT"
  say "Recording the main screen for $seconds s (Terminal needs Screen Recording in System Settings > Privacy & Security)."
  screencapture -v -V "$seconds" -x "$OUT/screen-$(date +%Y-%m-%d-%H%M%S).mov"
}

case "${1:-}" in
  check) check ;;
  sample) sample ;;
  install) install "${2:-drive}" ;;
  launch) launch ;;
  collect) collect "${2:-run}" ;;
  screen) screen "${2:-}" ;;
  *) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 64 ;;
esac
