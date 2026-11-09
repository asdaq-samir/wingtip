#!/usr/bin/env bash
# Installs the nightly database dump (backup-db.sh) as a launchd agent of
# the user running it: 03:30 each night, logged to
# ~/Library/Logs/wingtip-db-backup.log. Run again after backup-db.sh or the
# plist changes; it replaces what it installed before.
#
#   scripts/dev/install-backup.sh            install (or reinstall) and load it
#   scripts/dev/install-backup.sh --now      and run a dump at once, to see it work
#   scripts/dev/install-backup.sh --remove   unload and delete it
#
# The script is copied to ~/Library/Application Support/Wingtip, outside
# any checkout: the agent would otherwise point into a worktree that is
# deleted on merge, or a checkout switched to a branch without the file.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
label=app.wingtipmaps.db-backup
agents=$HOME/Library/LaunchAgents
plist=$agents/$label.plist
support="$HOME/Library/Application Support/Wingtip"
script="$support/backup-db.sh"
domain=gui/$(id -u)

unload() { launchctl bootout "$domain/$label" 2>/dev/null || true; }

if [ "${1:-}" = "--remove" ]; then
  unload
  rm -f "$plist" "$script"
  echo "install-backup: $label removed (the dumps in ~/Developer/branch-backup are kept)"
  exit 0
fi

mkdir -p "$agents" "$support" "$HOME/Library/Logs"
install -m 755 "$here/backup-db.sh" "$script"
# Filled in with | as sed's separator: the paths have slashes, and
# "Application Support" a space, which the plist's string keeps as is.
sed -e "s|__SCRIPT__|$script|" -e "s|__HOME__|$HOME|" "$here/launchd/$label.plist" > "$plist.tmp"
plutil -lint "$plist.tmp" >/dev/null
mv "$plist.tmp" "$plist"
unload
launchctl bootstrap "$domain" "$plist"
echo "install-backup: $label loaded ($plist), nightly at 03:30, running $script"
if [ "${1:-}" = "--now" ]; then
  launchctl kickstart -k "$domain/$label"
  echo "install-backup: started a dump now; its line goes to ~/Library/Logs/wingtip-db-backup.log"
fi
