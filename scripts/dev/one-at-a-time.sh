#!/usr/bin/env bash
# Heavy runs on the owner's Mac take turns -- a test suite, an image build,
# a browser run, a speed measurement -- however many Claude sessions are at
# work on it. On the 2016 MacBook (four cores) two suites at once took the
# load to 9 to 11 and their tests timed out (2026-10-15), so there was one
# turn. The Mac mini (12 cores, Docker given 16 GB) runs a few at once: the
# owner asked to make full use of it (2026-11-06), so there are
# ONE_AT_A_TIME_SLOTS turns, set by the swap watcher (scripts/dev/swap-watch.sh:
# 6 while the Mac is not swapping, 3 once it is; docs/LOCAL-DEV.md); with no
# setting, 3 while the live stack is down and 2 while it is up; it was 2 always, since three at once with Xcode or
# Gradle on the host swapped the 24 GB Mac (12 GB of it Docker's) and cost
# more time than they saved (2026-11-08). A speed measurement needs a quiet
# machine: `--alone` waits until no other turn is held and then holds them
# all. Waits for its turn, says whose turn it is, runs the command, and gives
# the turn back however the command ends.
#
#   scripts/dev/one-at-a-time.sh [--alone] "<who and what>" <command> [args...]
#
# Each turn is a directory (mkdir is atomic) holding the runner's pid and
# label: a turn whose runner has gone -- killed, its shell closed -- is
# taken back by the next in line. The first turn is the lock's own path, as
# the one-turn script had it, so a copy of the old script in another
# checkout still holds a turn the new one sees.
#
# And it waits for memory before it takes a turn (macOS): while the system's
# free memory is under ONE_AT_A_TIME_FREE_MIN percent (memory_pressure; 20
# by default) or swap in use is over ONE_AT_A_TIME_SWAP_MAX_MB (sysctl
# vm.swapusage; off by default, 0, as macOS keeps swap long after the
# pressure has passed). Either set to 0 leaves that check out.
set -u
alone=${ONE_AT_A_TIME_ALONE:-}
if [ "${1:-}" = "--alone" ]; then alone=1; shift; fi
usage='usage: one-at-a-time.sh [--alone] "<label>" <command> [args...]'
label=${1:?$usage}
shift
# The label comes first. A first word that is a program -- a path to one, or
# a command on the PATH -- was meant as the command: `one-at-a-time.sh
# ./x.sh` had no command left, and `one-at-a-time.sh bash x.sh` ran x.sh
# under the label "bash", without bash.
case "$label" in
  *[[:space:]]*) ;;
  *)
    if { [[ "$label" == */* ]] && [ -f "$label" ] && [ -x "$label" ]; } || type -P "$label" >/dev/null; then
      echo "one-at-a-time: \"$label\" is a command, not a label" >&2
      echo "$usage" >&2
      exit 64
    fi ;;
esac
[ $# -gt 0 ] || { echo "one-at-a-time: no command to run after the label" >&2; echo "$usage" >&2; exit 64; }
# Already inside a turn (check.sh, run by one-at-a-time.sh, asks for its
# own turn per area): run at once. Waiting there held one slot while asking
# for another, and with two slots every runner waited on another for ever
# -- the whole Mac's queue stood still for 25 minutes (2026-11-09).
if [ -n "${ONE_AT_A_TIME_HELD:-}" ]; then exec "$@"; fi
lock=${ONE_AT_A_TIME_LOCK:-/tmp/flight-plan-heavy.lock}
# The owner's own settings, read on every call so a change reaches runs
# already waiting in other worktrees' copies of this script too:
# ~/.config/wingtip/one-at-a-time, lines like ONE_AT_A_TIME_SLOTS=3.
conf=${ONE_AT_A_TIME_CONF:-${HOME:-/nonexistent}/.config/wingtip/one-at-a-time}
# shellcheck disable=SC1090
[ -f "$conf" ] && . "$conf"
# Turns at once: three while the owner's live stack (compose project
# wingtip) is down, two while it is up -- it holds some 4.5 GB the builds
# would otherwise have (the owner, 2026-11-09: "use the Mac effectively";
# "because the stack is not live"). The free-memory check below still holds
# every turn back while memory is short, so a third turn only starts when
# there is room.
if [ -z "${ONE_AT_A_TIME_SLOTS:-}" ]; then
  if PATH="$PATH:${HOME:-/nonexistent}/.docker/bin" docker ps -q -f name=^wingtip-planner-1$ 2>/dev/null | grep -q .; then
    ONE_AT_A_TIME_SLOTS=2
  else
    ONE_AT_A_TIME_SLOTS=3
  fi
fi
slots=$ONE_AT_A_TIME_SLOTS
free_min=${ONE_AT_A_TIME_FREE_MIN:-20}
# Off by default: macOS keeps swap in use long after the pressure has
# passed, and a swap ceiling held every turn for an hour with 39 % of memory
# free (2026-11-09). The free-memory check is the live signal.
swap_max=${ONE_AT_A_TIME_SWAP_MAX_MB:-0}
# At most this long in line, in seconds: a turn held longer than a suite
# and its reruns take is something wrong to look at, not to wait out.
wait_max=${ONE_AT_A_TIME_WAIT:-2700}
started=$(date +%s)
said=""
held=()
# In line in the order asked, not whoever looks first as a turn ends: a
# ticket each, named by when it was taken, and the next turn goes to the
# oldest whose runner is still there. Without it two sessions' agents,
# asking every five seconds, took turn after turn while the other session's
# run waited 40 minutes and more, twice (2026-10-28). It also keeps an
# `--alone` run from waiting for ever behind a stream of short ones: while it
# is first in line, no one behind it takes a turn.
line="$lock.line"
mkdir -p "$line"
ticket="$line/$(date +%s)$(printf '%05d' $((RANDOM % 100000))).$$"
: > "$ticket"
release() { local d; for d in "${held[@]+"${held[@]}"}"; do rm -rf "$d"; done; rm -f "$ticket"; }
trap release EXIT
trap 'exit 130' INT TERM HUP

slot() { if [ "$1" -eq 1 ]; then echo "$lock"; else echo "$lock.$1"; fi; }

first_in_line() {
  local t pid
  for t in $(ls "$line" 2>/dev/null | sort); do
    pid=${t##*.}
    if ! kill -0 "$pid" 2>/dev/null; then rm -f "$line/$t"; continue; fi
    [ "$line/$t" = "$ticket" ] && return 0
    return 1
  done
  return 0
}

# A turn whose runner has gone is free again; so is one made but never
# named (its runner gone between the two), a minute on.
reclaim() {
  local dir=$1 holder pid
  [ -d "$dir" ] || return 0
  holder=$(cat "$dir/owner" 2>/dev/null || true)
  pid=${holder%% *}
  if [ "$pid" = container ]; then
    # A turn a container holds (the charts job's next chart cycle,
    # services/jobs/charts/turn.py, through this lock mounted from /tmp)
    # names no pid the Mac can see: it touches its owner file each minute,
    # and one untouched for five has gone.
    if [ -n "$(find "$dir/owner" -mmin +5 2>/dev/null)" ]; then
      echo "one-at-a-time: taking back the turn of ${holder#* }, untouched for five minutes" >&2
      rm -rf "$dir"
    fi
  elif [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
    echo "one-at-a-time: taking back the turn of ${holder#* }, which has gone" >&2
    rm -rf "$dir"
  elif [ -z "$holder" ] && [ -n "$(find "$dir" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then
    rm -rf "$dir"
  fi
}

name() { echo "$$ $label (since $(date +%H:%M))" > "$1/owner"; }

# One free turn, or with --alone every turn; gives back what it took when it
# cannot have all it needs.
take() {
  local i dir
  for i in $(seq 1 "$slots"); do reclaim "$(slot "$i")"; done
  if [ -n "$alone" ]; then
    for i in $(seq 1 "$slots"); do
      dir=$(slot "$i")
      if mkdir "$dir" 2>/dev/null; then name "$dir"; held+=("$dir"); else
        for dir in "${held[@]+"${held[@]}"}"; do rm -rf "$dir"; done
        held=()
        return 1
      fi
    done
    return 0
  fi
  for i in $(seq 1 "$slots"); do
    dir=$(slot "$i")
    if mkdir "$dir" 2>/dev/null; then name "$dir"; held=("$dir"); return 0; fi
  done
  return 1
}

# Why memory is short, or nothing when there is enough (or no way to tell,
# as on Linux, where each container's own limit holds it).
memory_short() {
  local free used
  if [ "$free_min" -gt 0 ] && command -v memory_pressure >/dev/null; then
    free=$(memory_pressure -Q 2>/dev/null | sed -nE 's/.*free percentage: ([0-9]+)%.*/\1/p')
    if [ -n "$free" ] && [ "$free" -lt "$free_min" ]; then echo "${free}% free, under ${free_min}%"; return; fi
  fi
  if [ "$swap_max" -gt 0 ] && [ "$(uname -s)" = Darwin ]; then
    used=$(sysctl -n vm.swapusage 2>/dev/null | sed -nE 's/.*used = ([0-9]+)(\.[0-9]+)?M.*/\1/p')
    if [ -n "$used" ] && [ "$used" -gt "$swap_max" ]; then echo "${used} MB of swap in use, over ${swap_max} MB"; return; fi
  fi
}

holders() {
  local i o
  for i in $(seq 1 "$slots"); do
    if [ -d "$(slot "$i")" ]; then o=$(cat "$(slot "$i")/owner" 2>/dev/null || true); echo "${o#* }"; fi
  done | paste -sd ';' -
}

while ! { short=""; first_in_line && short=$(memory_short) && [ -z "$short" ] && take; }; do
  if [ -n "$short" ]; then
    now="memory"
    msg="waiting for memory: $short"
  elif ! first_in_line; then
    now="line"
    msg="in line behind $(( $(ls "$line" | sort | sed -n "/$(basename "$ticket")/=" ) - 1 )) earlier"
  else
    now="busy:$(holders)"
    msg="waiting for ${now#busy:}${alone:+ (alone: for every turn to be free)}"
  fi
  if [ "$now" != "$said" ]; then echo "one-at-a-time: $msg" >&2; said=$now; fi
  if [ $(( $(date +%s) - started )) -ge "$wait_max" ]; then
    echo "one-at-a-time: not my turn after ${wait_max}s; giving up ($msg)" >&2
    exit 75
  fi
  sleep 5
done
rm -f "$ticket"
export ONE_AT_A_TIME_HELD="$label"
# Which turn it is, 1 to ONE_AT_A_TIME_SLOTS (1 for --alone, which holds
# them all): a build keeps state of its own per turn, as
# scripts/dev/xcodebuild.sh keeps one DerivedData per turn, that no two
# builds can then share at once. A nested call passes it on unchanged.
slot_of() { local i; for i in $(seq 1 "$slots"); do [ "$(slot "$i")" = "$1" ] && echo "$i"; done; }
ONE_AT_A_TIME_SLOT=$(slot_of "${held[0]}")
export ONE_AT_A_TIME_SLOT
"$@"
