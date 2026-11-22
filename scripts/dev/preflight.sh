#!/usr/bin/env bash
# Before a push, the checks the pull request's tier 1 will run for this
# change, narrowly, on the Mac, so the push passes first time (the owner,
# 2026-11-21: "a smarter CI so it passes on first push"). PR #589 went red
# that day on the simplicity ratchet (RootView 183 lines against 175),
# then on two browser specs; every guard that failed is here.
#
#   scripts/dev/preflight.sh [--base B] [--specs] [--heavy] [--no-tests]
#
# It asks CI's own scripts what CI will do, from the files changed since B
# (by default the branch this one builds on: main, or claude/integration
# where that is nearer, as the pre-push hook judges a push):
#   scripts/areas.py filters      the paths filter's matches (ci.yml's block is generated from the same table)
#   scripts/ci/plan.py            which jobs run, as the `changes` job decides (EVENT=pull_request)
#   scripts/ci/guards.sh          the guards' `repo` leg itself: the ratchet, file sizes, tokens, toolchain,
#                                 brand, one home, copy-paste, links, workflows, ruff, the phones' lint
#   scripts/build/regen-all.sh    --check on every generator the change reaches (screens, tokens, wording,
#                                 web rules, the phones' calls and models, the MCP calls)
#   scripts/ci/wasm_size.py       the WebAssembly's budget, and the engine's layering, where engine/ changed
#   scripts/ci/browser_specs.py   the specs the pull request will run, and whether branch-specs.sh passed them
# and the change's own unit tests (decision 0042): Vitest --changed, and
# pytest on the Python test files it changed.
#
# What it leaves to GitHub it names: tsc and ESLint over the whole web app
# (the pre-push hook lints the files changed), clippy and the engine's
# tests, the gateway's, the phones' builds, and the generators that need
# cargo, Maven or the planner's Python (--heavy runs those too). --specs
# runs scripts/dev/branch-specs.sh where the specs have no pass yet (it
# needs the local stack up); without it a missing pass fails, as decision
# 0048 asks. Every Docker run takes a turn of scripts/dev/one-at-a-time.sh.
# The pre-push hook runs it (scripts/dev/hooks/pre-push); a minute or two.
set -uo pipefail
here=$(cd "$(dirname "$0")/../.." && pwd)
cd "$here" || exit 1
PATH=$PATH:$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$HOME/.local/bin:$HOME/.cargo/bin
# Node in apps/web, in check.sh's web image (the Mac has none): `preflight.sh --in-web <command>...`,
# which is how the steps below run it in a turn of one-at-a-time.sh.
if [ "${1:-}" = --in-web ]; then
  shift
  NODE=$(scripts/build/toolchain.sh get nodejs)
  # shellcheck source=scripts/dev/check-images.sh
  . scripts/dev/check-images.sh
  exec docker run --rm -i -v "$here:/repo" --tmpfs /repo/apps/web/node_modules -w /repo/apps/web "$(web_image)" \
    sh -c 'ln -s /node_modules/* /node_modules/.bin node_modules/ && "$@"' sh "$@"
fi
base="" specs="" heavy="" tests=1
while [ $# -gt 0 ]; do
  case $1 in
    --base) base=${2:?--base needs a commit}; shift ;;
    --specs) specs=1 ;;
    --heavy) heavy=1 ;;
    --no-tests) tests="" ;;
    *) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 64 ;;
  esac
  shift
done
turn() { scripts/dev/one-at-a-time.sh "preflight $1 ($(basename "$here"))" "${@:2}"; }
say() { echo "preflight: $*"; }
failed=() left=() began=$SECONDS
run() {   # run <label> <command>...: its output, then pass or fail; 3 is "its tool is not here"
  local label=$1 t=$SECONDS status
  shift
  say "$label"
  "$@"
  status=$?
  case $status in
    0) say "$label: passed ($((SECONDS - t)) s)" ;;
    3) left+=("$label (no tool here)") ;;
    *) failed+=("$label"); say "$label: FAILED ($((SECONDS - t)) s)" ;;
  esac
}

if [ -z "$base" ]; then
  main=$(git merge-base origin/main HEAD)
  wave=$(git merge-base origin/claude/integration HEAD 2>/dev/null || true)
  base=$main
  if [ -n "$wave" ] && git merge-base --is-ancestor "$main" "$wave"; then base=$wave; fi
fi
changed=$(git diff --name-only --diff-filter=d "$base" HEAD)
[ -z "$(git status --porcelain --untracked-files=no)" ] || say "uncommitted changes are not what a push sends: checking the commits only"
if [ -z "$changed" ]; then say "nothing changed since ${base:0:9}"; exit 0; fi
say "$(wc -l <<<"$changed" | tr -d ' ') file(s) changed since ${base:0:9}"

# What tier 1 runs: the `changes` job's own decision, from the same table.
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
filters=$(python3 scripts/areas.py filters <<<"$changed")
# Words alone (ci.yml's docsonly filter): no browser suite and no flight-critical.
code=false
grep -qvE '^(docs/|ml/notebooks/|\.claude/)|\.md$|^LICENSE$' <<<"$changed" && code=true
CHANGED=$filters EVENT=pull_request FORK=false CODE=$code GITHUB_OUTPUT=$out/plan python3 scripts/ci/plan.py >/dev/null || exit 1
want() { grep -qx "$1=$2" "$out/plan"; }
val() { sed -n "s/^$1=//p" "$out/plan"; }
jobs=$(grep -E '=true$' "$out/plan" | cut -d= -f1 | xargs)
say "tier 1 will run: guards ${jobs:-} python:$(val python)"

# The guards' repo leg, as CI runs it (its web and engine legs are tsc,
# ESLint, Prettier, clippy: the pre-push hook's, and CI's in full).
run "guards (scripts/ci/guards.sh, repo leg)" env BASE="$base" PART=repo ARCH="$(val arch)" SITE="$(val site)" \
  IOS="$(val ios)" ANDROID="$(val android)" API="$(val api)" WEB=false ENGINE=false FLIGHT=false scripts/ci/guards.sh

# The generated files: regen-all's --check on what the change reaches.
# The heavy generators (cargo, Maven, the planner's Python) only with --heavy.
regen=(--check --base "$base")
[ -n "$heavy" ] || regen+=(--light)
run "generated files (scripts/build/regen-all.sh --check)" scripts/build/regen-all.sh "${regen[@]}"

if want test-engine true; then
  run "the WebAssembly's size budget" python3 scripts/ci/wasm_size.py
  if command -v cargo >/dev/null; then
    run "the engine's layering" python3 scripts/ci/engine_layers.py
    if [ -n "$heavy" ] && [ -n "$tests" ]; then
      read -ra pkgs <<<"$(python3 scripts/ci/engine_affected.py --base "$base" 2>/dev/null | tail -1)"
      run "the engine's tests the change reaches" turn engine cargo test --profile ci --manifest-path engine/Cargo.toml "${pkgs[@]}"
    else
      left+=("the engine's tests and clippy (--heavy runs the tests)")
    fi
  fi
fi

# The change's own unit tests (decision 0042).
if [ -n "$tests" ] && want test-web true; then
  if command -v npx >/dev/null && [ -d apps/web/node_modules ]; then
    run "Vitest on what the change reaches" sh -c "cd apps/web && npm run -s types >/dev/null && npx vitest run --changed '$base' --passWithNoTests"
  else
    run "Vitest on what the change reaches" turn vitest "$here/scripts/dev/preflight.sh" --in-web sh -c "npm run -s types >/dev/null && npx vitest run --changed '$base' --passWithNoTests"
  fi
fi
legs=$(val python | tr -d '[]"' | tr ',' ' ')
for leg in $legs; do
  [ -n "$tests" ] || break
  [ "$leg" = flight ] && continue
  read -r dir dev <<<"$(scripts/ci/python_suite.sh --where "$leg")"
  mine=$(grep -E "^$dir/.*test_[^/]*\.py$" <<<"$changed" | sed "s|^$dir/||" | xargs)
  if [ -z "$mine" ]; then left+=("test-$leg's whole suite (the change edits none of its tests)"); continue; fi
  image=wingtip-check-py-$(basename "${dev:-requirements-dev.txt}" .txt)
  [ "$dir" = services/planner ] || image=wingtip-check-py-$(basename "$dir")-$(basename "${dev:-x}" .txt)
  id=$(docker image ls -q "$image" 2>/dev/null | head -1)
  if [ -z "$id" ]; then left+=("test-$leg (no $image: scripts/dev/check.sh builds it)"); continue; fi
  # shellcheck disable=SC2086 # one argument a test file
  run "pytest on test-$leg's changed tests" turn "pytest $leg" docker run --rm -v "$here:/repo" -v wingtip-check-raw:/repo/data/raw \
    -w "/repo/$dir" "$id" pytest -q -p no:cacheprovider $mine
done
for job in test-gateway ios android; do want "$job" true && left+=("$job"); done

# The browser specs the pull request will run (browser_specs.py, as CI picks them).
if want e2e true && [ "${PREFLIGHT_SPECS:-1}" != 0 ]; then
  if command -v node >/dev/null && [ -d apps/web/node_modules ]; then reached=$(python3 scripts/ci/browser_specs.py --list "$base")
  else reached=$(REACHED_SPECS_NODE="$here/scripts/dev/one-at-a-time.sh preflight-specs $here/scripts/dev/preflight.sh --in-web node" python3 scripts/ci/browser_specs.py --list "$base"); fi
  if [ -z "$reached" ]; then
    say "the change reaches no browser spec"
  else
    say "the pull request will run $(wc -l <<<"$reached" | tr -d ' ') spec(s): $(xargs <<<"$reached")"
    # The checkout's record (the hook names it: it may check a temporary worktree).
    stamp=${PREFLIGHT_STAMP:-$(git rev-parse --absolute-git-dir)/branch-specs-passed}
    if grep -qE "(^| )$(git rev-parse 'HEAD^{tree}')$" "$stamp" 2>/dev/null; then
      say "branch-specs.sh passed this tree"
    elif [ -n "$specs" ]; then
      run "the reached specs (scripts/dev/branch-specs.sh)" scripts/dev/branch-specs.sh
    else
      failed+=("the reached specs: scripts/dev/branch-specs.sh runs them against the local stack (or preflight.sh --specs)")
    fi
  fi
fi

[ ${#left[@]} -eq 0 ] || say "left to GitHub: $(printf '%s; ' "${left[@]}")"
if [ ${#failed[@]} -gt 0 ]; then
  say "$((SECONDS - began)) s, failed: $(printf '%s; ' "${failed[@]}")"
  say "each failure's narrow command is above; CI's would say the same minutes later"
  exit 1
fi
say "$((SECONDS - began)) s, every check tier 1 runs here passed"
