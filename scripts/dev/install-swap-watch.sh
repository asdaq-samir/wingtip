#!/bin/bash
# Installs the swap watcher (swap-watch.sh) as a LaunchAgent that runs from
# login for ever, holding the heavy-turn limit as high as the Mac takes
# without swapping. `--remove` takes it out. Its log is
# ~/Library/Logs/wingtip-swap-watch.log.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
label=app.wingtipmaps.swap-watch
bin=$HOME/.local/bin/wingtip-swap-watch
plist=$HOME/Library/LaunchAgents/$label.plist
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
if [ "${1:-}" = "--remove" ]; then rm -f "$plist" "$bin"; echo "swap watcher removed"; exit 0; fi
mkdir -p "$(dirname "$bin")" "$(dirname "$plist")"
# A copy, so a checkout switched to another branch never stops the watcher.
install -m 755 "$here/swap-watch.sh" "$bin"
sed -e "s|__SCRIPT__|$bin|" -e "s|__HOME__|$HOME|g" "$here/launchd/$label.plist" >"$plist"
launchctl bootstrap "gui/$(id -u)" "$plist"
echo "swap watcher installed: $bin (log ~/Library/Logs/wingtip-swap-watch.log)"
