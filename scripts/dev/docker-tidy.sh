#!/usr/bin/env bash
# Reclaims Docker disk on the Mac: what a rebuild or a re-pull makes again,
# never data and never a container.
#
# - Images no container uses (`docker image prune -a`): a check's old tags,
#   superseded stack images, pulled bases. An image any container uses,
#   running, stopped or only created, stays, so the live stack (compose
#   project wingtip) and the dev-services sidecar's stopped jobs (ml,
#   retrain, charts) keep theirs.
# - BuildKit's cache unused for 24 hours. A day's builds stay warm.
# - Volumes no container uses, except the caches the scripts name and every
#   compose project's: wingtip-cargo-* (Cargo's downloads and the engine
#   tests' builds), wingtip-sccache* (the shared Rust compile cache),
#   wingtip-npm*, wingtip-format-npm, wingtip-m2, fp-m2
#   (Maven's), wingtip-check-raw (the FAA files the tests fetch), and
#   wingtip_* and fpam_* (the stacks' own, pgdata_pg18's rows among them,
#   kept even while the stack is down), and any compose project's that
#   still has a container (another session's scratch stack). What goes is
#   anonymous volumes and the one-off scratch ones an agent made by hand.
#
# Then the shared build caches (scripts/dev/tidy-build-caches.sh): the
# engine store's older engines, and the DerivedData and Cargo targets of
# worktrees that are gone.
#
# No container is removed or stopped (tidy-local.sh removes the scratch
# stacks' stopped ones). Never `docker system prune --volumes`: it would
# take the database with the rest. It prints the space each part freed and
# Docker's total before and after.
#
#   scripts/dev/docker-tidy.sh             do it
#   scripts/dev/docker-tidy.sh --dry-run   say what it would remove
set -euo pipefail
PATH=$PATH:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin

dry=""
case "${1:-}" in
  "") ;;
  --dry-run) dry=1 ;;
  *) echo "usage: scripts/dev/docker-tidy.sh [--dry-run]" >&2; exit 2 ;;
esac

# The volumes kept whether or not a container uses them (shell patterns).
KEEP=(wingtip-cargo-* "wingtip-sccache*" wingtip-npm* wingtip-format-npm wingtip-m2 fp-m2 wingtip-check-raw "wingtip_*" "fpam_*")
kept() {
  local p
  for p in "${KEEP[@]}"; do
    # shellcheck disable=SC2053  # the pattern is meant to match, unquoted
    [[ $1 == $p ]] && return 0
  done
  return 1
}

# Docker's own total of images, containers, volumes and build cache, in
# bytes, from `docker system df`'s human sizes (kB, MB, GB are 1000s).
total_bytes() {
  docker system df --format '{{.Size}}' | awk '
    { n = $1 + 0; u = $1; sub(/^[0-9.]+/, "", u)
      m = (u == "kB") ? 1e3 : (u == "MB") ? 1e6 : (u == "GB") ? 1e9 : (u == "TB") ? 1e12 : 1
      s += n * m }
    END { printf "%.0f\n", s }'
}
human() { awk -v b="$1" 'BEGIN { if (b >= 1e9) printf "%.2f GB", b / 1e9; else printf "%.0f MB", b / 1e6 }'; }

running_before=$(docker ps -q | sort)
# The compose projects that still have a container, in any state: another
# session's scratch stack, brought down for a moment without -v, keeps its
# volumes.
projects=$(docker ps -a --format '{{.Label "com.docker.compose.project"}}' | sort -u)
volumes=()
while IFS= read -r v; do
  [ -n "$v" ] || continue
  if kept "$v"; then continue; fi
  project=$(docker volume inspect --format '{{index .Labels "com.docker.compose.project"}}' "$v" 2>/dev/null || true)
  if [ -n "$project" ] && grep -qxF "$project" <<<"$projects"; then continue; fi
  volumes+=("$v")
done < <(docker volume ls -q --filter dangling=true)

if [ -n "$dry" ]; then
  echo "Would remove:"
  echo "  images no container uses:"
  # An image is in use when any container, in any state, was made from it.
  used=$(docker ps -a --format '{{.Image}}' | sort -u | while read -r i; do docker image inspect --format '{{.Id}}' "$i" 2>/dev/null || true; done | sort -u)
  docker image ls --format '{{.ID}} {{.Repository}}:{{.Tag}} {{.Size}}' --no-trunc \
    | while read -r id name size; do grep -qxF "$id" <<<"$used" || echo "    $name ($size)"; done
  echo "  build cache unused for 24 hours"
  echo "  volumes no container uses, not a kept cache: ${volumes[*]:-(none)}"
  "$(dirname "$0")/tidy-build-caches.sh" --dry-run
  docker system df
  exit 0
fi

before=$(total_bytes)
echo "== images no container uses =="
docker image prune -a -f | tail -1
echo "== build cache unused for 24 hours =="
docker builder prune -a -f --filter until=24h | tail -1
echo "== volumes no container uses, not a kept cache =="
if [ ${#volumes[@]} -gt 0 ]; then
  for v in "${volumes[@]}"; do
    # A container may have taken it since the list: rm refuses one in use.
    docker volume rm "$v" >/dev/null 2>&1 && echo "removed $v" || echo "kept $v (in use now)"
  done
else
  echo "none"
fi
echo "== the shared build caches =="
"$(dirname "$0")/tidy-build-caches.sh"
after=$(total_bytes)

echo
docker system df
echo
echo "docker-tidy: freed $(human $((before - after))) ($(human "$before") -> $(human "$after"))"
if [ "$(docker ps -q | sort)" != "$running_before" ]; then
  echo "docker-tidy: the running containers changed while it ran (docker ps):" >&2
  docker ps --format '  {{.Names}} {{.Status}}' >&2
fi
df -h /System/Volumes/Data 2>/dev/null | tail -1 || df -h / | tail -1
