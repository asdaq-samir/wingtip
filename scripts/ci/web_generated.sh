#!/usr/bin/env bash
# ci.yml's test-web: the files generated and committed -- the phones' API
# models and engine calls, the design tokens, the screens' links, the app
# icons -- each checked against what its generator makes, but on a pull
# request only where the change touched the generator, its source or its
# output. They took 1.5 of test-web's 3.8 minutes on every web change
# (PR #577's runs), though a change to apps/web/src alone can change none
# of them. Main's push and the night check all four (no base given), so an
# input missing from a list below is caught after merge, not shipped.
#
#   scripts/ci/web_generated.sh [BASE]   BASE: the commit the pull request lands on
set -euo pipefail
cd "$(dirname "$0")/../.."
base=${1:-}
A=apps/android/app/src/main/kotlin/app/wingtipmaps/android

# Whether the change touched any of the paths (git pathspecs); always, with no base.
touched() { [ -z "$base" ] || [ -n "$(git diff --name-only "$base" HEAD -- "$@")" ]; }

check() { # name, command, then -- and its paths
  local name=$1 command=$2
  shift 3
  if touched "$@"; then
    echo "::group::$name"
    $command
    echo "::endgroup::"
  else
    echo "$name: untouched by this change, not checked"
  fi
}

check "The phones' generated models and engine calls" scripts/ci/phones_generated.sh -- \
  .tool-versions services/planner/openapi.json services/gateway/openapi.json engine/contract \
  'scripts/build/api-models-apps.*' 'scripts/build/engine-contract-apps.*' scripts/ci/phones_generated.sh \
  apps/ios/Wingtip/API/Generated apps/ios/WingtipAPI apps/ios/Wingtip/Engine/Generated \
  "$A/api/generated" "$A/engine/generated"
check "The design tokens" "scripts/build/design-tokens.sh --check" -- \
  design/tokens.json 'scripts/build/design-tokens.sh' 'scripts/build/design_tokens*' \
  apps/web/src/styles/tokens.css apps/web/src/lib/tokens.ts apps/ios/Wingtip/Design/Generated "$A/design/generated"
check "The screens and their links" "scripts/build/screens.sh --check" -- \
  design/screens.json 'scripts/build/screens.*' docs/navigation.md \
  apps/web/src/lib/navigation/generated apps/ios/Wingtip/Navigation/Generated "$A/navigation/generated"
check "The app icons" "scripts/build/app-icons.sh --check" -- \
  docs/brand docs/store design/tokens.json 'scripts/build/app-icons.sh' 'scripts/build/app_icons*' \
  'scripts/build/brand-render*' apps/ios/Wingtip/Assets.xcassets apps/ios/WingtipWatch/Assets.xcassets \
  apps/android/app/src/main/res apps/web/public apps/site/assets
