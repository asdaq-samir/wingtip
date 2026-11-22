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
# Heavy turns wait while swap in use is over 2 GB (ONE_AT_A_TIME_SWAP_MAX_MB,
# one-at-a-time.sh's own check), so the campaign never pushes the Mac into
# swapping. The stack is stopped at the end, and the load test's pilots'
# accounts (@load.wingtip.invalid) deleted.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=scripts/dev/after-merge/lib.sh
source "$here/after-merge/lib.sh"
export AFTER_MERGE_OUT=$OUT ONE_AT_A_TIME_SWAP_MAX_MB=${ONE_AT_A_TIME_SWAP_MAX_MB:-2048}
queue=$here/one-at-a-time.sh
pieces="drill transcode stress soak spike chaos changeover lockfiles images zap"

run_piece() {
  local piece=$1 log=$OUT/$1.txt
  case $piece in
    drill) "$queue" "after-merge restore drill" "$here/restore-drill.sh" ${RESTORE_BACKUP:+"$RESTORE_BACKUP"} ;;
    transcode)
      local cycle=${TRANSCODE_CYCLE:-10-29-2026}
      "$queue" "after-merge transcode" docker compose -p wingtip --project-directory "$repo" run --rm charts transcode --cycle "$cycle" --workers 4
      if [ -n "${CHART_TILES_BUCKET:-}" ]; then
        "$queue" "after-merge publish" docker compose -p wingtip --project-directory "$repo" run --rm charts publish --cycle "$cycle"
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
  say "$piece: starting"
  started=$SECONDS
  status=0
  run_piece "$piece" || status=$?
  echo "$status $((SECONDS - started))" > "$OUT/state/$piece.exit"
  # Stopped by a signal (Ctrl-C, a reboot): not done, so the next run
  # starts it again. Any other end is the piece's result, for the report.
  if [ "$status" -ge 128 ]; then
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
