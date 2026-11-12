#!/bin/bash
# Full throttle without swapping (the owner, 2026-11-12: "Make it permanent
# rule full throttle while avoiding swapping memory").
#
# Holds one-at-a-time.sh's heavy-turn limit (ONE_AT_A_TIME_SLOTS in
# ~/.config/wingtip/one-at-a-time) as high as the Mac takes without
# swapping: MAX turns while calm, MIN the moment the Mac writes more than
# THRESHOLD pages a minute to swap, back up one turn after each CALM calm
# minutes. Swap-outs, not memory_pressure's "free" percentage, are the
# signal: on 2026-11-12 the Mac swapped ~35 MB/s while that read 44% free,
# because it counts compressed memory as free.
#
# Runs for ever as a LaunchAgent (scripts/dev/launchd/app.wingtipmaps.swap-watch.plist;
# docs/LOCAL-DEV.md says how to install it). Settings, from the environment:
#   SWAP_WATCH_MAX        most turns while calm (6)
#   SWAP_WATCH_MIN        turns while swapping (3)
#   SWAP_WATCH_THRESHOLD  swap-out pages a minute that count as swapping (2000, about 31 MB)
#   SWAP_WATCH_CALM       calm minutes before one more turn (3)
set -u
max=${SWAP_WATCH_MAX:-6} min=${SWAP_WATCH_MIN:-3}
threshold=${SWAP_WATCH_THRESHOLD:-2000} calm_needed=${SWAP_WATCH_CALM:-3}
conf=${ONE_AT_A_TIME_CONF:-$HOME/.config/wingtip/one-at-a-time}
mkdir -p "$(dirname "$conf")"; touch "$conf"

set_slots() {
  if grep -q '^ONE_AT_A_TIME_SLOTS=' "$conf"; then
    sed -i '' "s/^ONE_AT_A_TIME_SLOTS=.*/ONE_AT_A_TIME_SLOTS=$1/" "$conf"
  else
    echo "ONE_AT_A_TIME_SLOTS=$1" >>"$conf"
  fi
  echo "$(date '+%F %T') turns $1${2:+ ($2)}"
}
swapouts() { vm_stat | awk '/Swapouts/ {gsub("\\.", "", $2); print $2}'; }

slots=$max calm=0
set_slots "$slots" "start"
prev=$(swapouts)
while :; do
  sleep 60
  now=$(swapouts); rate=$((now - prev)); prev=$now
  if [ "$rate" -gt "$threshold" ]; then
    calm=0
    [ "$slots" -ne "$min" ] && { slots=$min; set_slots "$slots" "swapping $rate pages/min"; }
  else
    calm=$((calm + 1))
    if [ "$slots" -lt "$max" ] && [ "$calm" -ge "$calm_needed" ]; then
      slots=$((slots + 1)); calm=0; set_slots "$slots" "calm"
    fi
  fi
done
