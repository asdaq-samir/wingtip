#!/usr/bin/env bash
# The after-merge test campaign, once a wave is merged and live
# (docs/TESTING-AFTER-MERGE.md says what each piece does, its limits and
# how long it takes): one piece at a time, each in a turn of
# scripts/dev/one-at-a-time.sh (the measurements --alone), resumable, and
# one report at the end.
#
#   cd ~/Developer/wingtip-live && scripts/dev/after-merge.sh            all, from where it stopped
#   scripts/dev/after-merge.sh --only stress,spike                       some (done ones again too)
#   scripts/dev/after-merge.sh --redo chaos                              one again, then what is left
#   scripts/dev/after-merge.sh --list | --report                         the pieces; the report alone
#
# In order: drill (scripts/dev/restore-drill.sh, RESTORE_BACKUP or the
# newest local dump), transcode (the charts job's WebP transcode of
# TRANSCODE_CYCLE, then publish where CHART_TILES_BUCKET is set), stress,
# soak, spike, chaos, changeover, lockfiles, images, zap. Each piece's
# results go to ~/wingtip-after-merge/<date>/<piece>/ (AFTER_MERGE_OUT
# another), a piece that ran to its end is marked done there and skipped
# next time, and report.md is written again after each.
#
# Heavy turns wait while the Mac's free memory is under 30%
# (ONE_AT_A_TIME_FREE_MIN, one-at-a-time.sh's own memory_pressure check),
# not on swap in use, which macOS keeps high long after a spike has passed
# (the coordinator's rule, 2026-11-21). Each piece wants 15 GB free on the
# Mac (the transcode 20) or the campaign stops there and says so. The stack is stopped at the end, and the load test's pilots'
# accounts (@load.wingtip.invalid) deleted.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=scripts/dev/after-merge/lib.sh
source "$here/after-merge/lib.sh"
export AFTER_MERGE_OUT=$OUT ONE_AT_A_TIME_FREE_MIN=${ONE_AT_A_TIME_FREE_MIN:-30}
queue=$here/one-at-a-time.sh
pieces="drill transcode stress soak spike chaos changeover lockfiles images zap"

run_piece() {
  local piece=$1 log=$OUT/$1.txt
  case $piece in
    drill) "$queue" "after-merge restore drill" "$here/restore-drill.sh" ${RESTORE_BACKUP:+"$RESTORE_BACKUP"} ;;
    transcode)
      # In place on the live tree (the charts agent's pick, 2026-11-21): the
      # staged copy beside it is deleted first for its 6 GB, and the run
      # wants 20 GB free, sec@2x's peak being about 17.
      local cycle=${TRANSCODE_CYCLE:-10-29-2026}
      rm -rf "${TRANSCODE_STAGING:-$HOME/Developer/wingtip/data/raw/chart_tiles.nosync.webp-staging}"
      disk_free 20 || return 4
      "$queue" "charts transcode" docker compose -p wingtip --project-directory "$repo" --profile jobs \
        run --rm -T --no-deps charts transcode --cycle "$cycle" --workers 4
      if [ -n "${CHART_TILES_BUCKET:-}" ]; then
        "$queue" "charts publish" docker compose -p wingtip --project-directory "$repo" --profile jobs \
          run --rm -T --no-deps charts publish --cycle "$cycle" --bucket "$CHART_TILES_BUCKET"
      else
        echo "publish: skipped, no CHART_TILES_BUCKET (the cycle is served from this disk)"
      fi
      ;;
    stress | soak | spike) "$queue" --alone "after-merge $piece" "$here/after-merge/load.sh" "$piece" ;;
    chaos) "$queue" --alone "after-merge chaos" "$here/after-merge/chaos.sh" ;;
    changeover) "$queue" "after-merge changeover" "$here/after-merge/changeover.sh" ;;
    lockfiles | images | zap) "$queue" "after-merge $piece" "$here/after-merge/scans.sh" "$piece" ;;
  esac > "$log" 2>&1
}

# The Mac's disk, in GB free, at least $1: a heavy piece on a nearly full
# disk (5.5 GB free on 2026-11-21) fails half-way or takes the stack down.
disk_free() {
  local free
  free=$(df -Pk /System/Volumes/Data | awk 'NR==2 {print int($4 / 1048576)}')
  [ "$free" -ge "$1" ] && return 0
  say "only $free GB free on the Mac, under the $1 GB this needs: stopped"
  return 1
}

report() { python3 "$here/after-merge/report.py" "$OUT" > "$OUT/report.md"; }

only="" redo=""
case ${1:-} in
  --list) echo "$pieces"; exit 0 ;;
  --report) report; echo "$OUT/report.md"; exit 0 ;;
  --only) only=${2//,/ } ;;
  --redo) redo=$2 ;;
  "") ;;
  *) sed -n '2,25p' "$0"; exit 2 ;;
esac
[ -z "$redo" ] || rm -f "$OUT/state/$redo.done"

ln -sfn "$OUT" "$HOME/wingtip-after-merge/current"
say "campaign in $OUT"
for piece in ${only:-$pieces}; do
  if [ -z "$only" ] && is_done "$piece"; then
    say "$piece: done before, skipped"
    continue
  fi
  # Every piece is heavy: 15 GB free first, or the campaign stops and
  # says so (the report has what ran).
  if ! disk_free 15; then
    report
    exit 4
  fi
  say "$piece: starting"
  started=$SECONDS
  status=0
  run_piece "$piece" || status=$?
  echo "$status $((SECONDS - started))" > "$OUT/state/$piece.exit"
  # Stopped by a signal (Ctrl-C, a reboot), or not started for want of
  # disk (4): not done, so the next run starts it again. Any other end is
  # the piece's result, for the report.
  if [ "$status" -ge 128 ] || [ "$status" = 4 ]; then
    say "$piece: interrupted ($status)"
    exit "$status"
  fi
  done_mark "$piece"
  say "$piece: finished ($status) in $(((SECONDS - started) / 60)) min"
  report
done

docker exec "$(c db)" psql -U wingtip -d wingtip -qc \
  "DELETE FROM magic_links WHERE email LIKE '%@load.wingtip.invalid'; DELETE FROM pilots WHERE email LIKE '%@load.wingtip.invalid'" 2> /dev/null || true
stack_down
report
[ -n "$only" ] || date -u +%FT%TZ > "$OUT/finished"
say "report: $OUT/report.md"
