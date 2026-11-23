#!/usr/bin/env bash
# The browser specs this branch's change reaches, run against its own page
# before it is pushed (decision 0048; the owner, 2026-11-19: "make it a
# hard rule so we don't waste time"). The web audit's three days of
# redesign ran no browser test until the end, where the suite found about
# 25 app bugs; each piece now answers for the specs it reaches when its
# code is done.
#
#   scripts/dev/branch-specs.sh [--list] [--from-base]
#
# What changed since this branch's last pass (the newest commit recorded in
# the git dir's branch-specs-passed that HEAD descends from), or, with no
# pass yet or --from-base, since the branch it builds on (main, or
# claude/integration when that is nearer, as the pre-push hook judges a
# push): apps/web/scripts/reached-specs.mjs names the specs it reaches, and
# with --list it stops there. Each pass answers for its own commits, so a
# fix after a pass runs the specs the fix reaches, not the branch's whole
# set again (the owner, 2026-11-19: that cost 15 minutes a push); the
# whole set is the pull request's, as before. Otherwise it builds this
# checkout's page into apps/web/dist-branch, serves it on a free port (the
# server's own pick, so two worktrees' runs never share one;
# BRANCH_SPECS_PORT fixes one) with the API passed to the local stack's
# gateway on :8080, which must be up (scripts/dev/go-live.sh --up), and
# runs the specs on the phone project with CI's waits, each heavy step in
# its turn of one-at-a-time.sh.
# A clean pass adds "<commit> <tree>" to branch-specs-passed; the pre-push
# hook asks for the pushed tree there before a push that changes the web
# app. Every line is a pass from the base or from an earlier line, so the
# chain back to the base covers everything the branch changed.
set -euo pipefail

here=$(cd "$(dirname "$0")/../.." && pwd)
PATH=$PATH:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin
turn="$here/scripts/dev/one-at-a-time.sh"
port=${BRANCH_SPECS_PORT:-}
list="" from_base=""
for a in "$@"; do
  case $a in
    --list) list=1 ;;
    --from-base) from_base=1 ;;
    *) sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'; exit 64 ;;
  esac
done
stamp="$(git -C "$here" rev-parse --git-dir)/branch-specs-passed"
case "$stamp" in /*) ;; *) stamp="$here/$stamp" ;; esac

main=$(git -C "$here" merge-base origin/main HEAD)
wave=$(git -C "$here" merge-base origin/claude/integration HEAD 2>/dev/null || true)
base=$main
if [ -n "$wave" ] && git -C "$here" merge-base --is-ancestor "$main" "$wave"; then base=$wave; fi
# The newest pass this commit descends from: the diff starts there.
from=$base since="the base, ${base:0:12}"
if [ -z "$from_base" ] && [ -f "$stamp" ]; then
  while read -r commit _; do
    if git -C "$here" merge-base --is-ancestor "$commit" HEAD 2>/dev/null; then
      from=$commit since="the last pass, ${commit:0:12}"
      break
    fi
  done < <(tail -r "$stamp")
fi
record() {
  { tail -n 49 "$stamp" 2>/dev/null || true; echo "$(git -C "$here" rev-parse HEAD) $tree"; } > "$stamp.new"
  mv "$stamp.new" "$stamp"
}

# The web's check image (node and its packages), as scripts/dev/check.sh builds it.
NODE=$("$here/scripts/build/toolchain.sh" get nodejs)
# shellcheck source=scripts/dev/check-images.sh
. "$here/scripts/dev/check-images.sh"
web_image=$(web_image)
in_web() { docker run --rm -i -v "$here:/repo" -w /repo/apps/web "$web_image" "$@"; }

echo "branch-specs: what changed since $since"
specs=$(git -C "$here" diff --name-only "$from" HEAD | in_web node scripts/reached-specs.mjs)
tree=$(git -C "$here" rev-parse 'HEAD^{tree}')
if [ -z "$specs" ]; then
  echo "branch-specs: the change reaches no browser spec"
  record
  exit 0
fi
echo "branch-specs: $(wc -w <<<"$specs" | tr -d ' ') specs: $specs"
# A change to shared ground (lib/text.ts, the map's layers) reaches most of
# the suite, which the Mac never runs whole (decision 0042): past
# BRANCH_SPECS_MAX, the @smoke ones among them, and the pull request runs all.
if [ "$(wc -w <<<"$specs")" -gt "${BRANCH_SPECS_MAX:-30}" ]; then
  # The specs the branch itself changed (since that start) stay, whatever their tier.
  own=$(git -C "$here" diff --name-only "$from" HEAD -- 'apps/web/e2e/*.spec.ts' | sed 's|^apps/web/||')
  specs=$(for s in $specs; do
    if grep -qE "[\"']@smoke[\"']" "$here/apps/web/$s" || grep -qx "$s" <<<"$own"; then echo "$s"; fi
  done | xargs)
  echo "branch-specs: over ${BRANCH_SPECS_MAX:-30}, so the $(wc -w <<<"$specs" | tr -d ' ') @smoke ones; the pull request runs the rest"
fi
[ -n "$list" ] && exit 0
if [ -n "$(git -C "$here" status --porcelain --untracked-files=no)" ]; then
  echo "branch-specs: commit first; the pass is recorded against the commit's tree" >&2
  exit 2
fi
curl -sf -o /dev/null http://localhost:8080/app/ || {
  echo "branch-specs: the local stack is not up on :8080 (scripts/dev/go-live.sh --up)" >&2
  exit 2
}

"$turn" "branch-specs build ($(basename "$here"))" docker run --rm -v "$here:/repo" -w /repo/apps/web "$web_image" \
  npx vite build --outDir dist-branch --emptyOutDir --logLevel warn
image=$(sed -nE 's/^ *PLAYWRIGHT_IMAGE: *([^ ]+).*/\1/p' "$here/.github/workflows/ci.yml" | head -1)
vol=wingtip-npm-branch-specs-$({ cat "$here/apps/web/package-lock.json"; echo "$image"; } | shasum -a 256 | cut -c1-12)
auth=$(sed -n 's/^MAILPIT_UI_AUTH=//p' "$HOME/Developer/wingtip/.env" 2>/dev/null || true)
# shellcheck disable=SC2086 # one argument per spec file
"$turn" "branch-specs e2e ($(basename "$here"))" docker run --rm --network host -e CI=1 ${port:+-e PORT="$port"} \
  -e MAILPIT_URL=http://localhost:8025 -e MAILPIT_UI_AUTH="$auth" \
  -v "$here/apps/web:/w" -v "$vol:/w/node_modules" -w /w "$image" sh -c '
    [ -f node_modules/.package-lock.json ] || npm ci --no-audit --no-fund --loglevel=error
    # The page on the port its server was given (serve-dist.mjs), and the
    # tests at that one: another worktree may be running its own beside it.
    node scripts/serve-dist.mjs dist-branch > /tmp/serve.log 2>&1 &
    for _ in $(seq 1 100); do
      port=$(sed -n "s/^serve-dist: .* on :\([0-9]*\),.*/\1/p" /tmp/serve.log)
      [ -n "$port" ] && break
      sleep 0.1
    done
    [ -n "$port" ] || { cat /tmp/serve.log; exit 1; }
    echo "branch-specs: the page on :$port"
    BASE_URL=http://localhost:$port npx playwright test --project=mobile --reporter=list "$@"' sh $specs
record
echo "branch-specs: passed; recorded for commit $(git -C "$here" rev-parse --short=12 HEAD), tree ${tree:0:12}"
