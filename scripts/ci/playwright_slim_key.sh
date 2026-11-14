#!/usr/bin/env bash
# The tag of the slim Playwright image (.github/ci-images.hcl's `playwright`
# target): what PLAYWRIGHT_IMAGE's name points at and the recipe that slims
# it, so a change to either makes the copy again. Keyed on the digest alone,
# the recipe's change that kept WebKit would have gone on pulling
# the copy without it. Prints `<key> <digest>`; ci.yml's e2e-images job makes
# the copy for it, and scripts/ci/e2e_public_images.sh pulls it. Needs
# PLAYWRIGHT_IMAGE; run from the repository root.
set -euo pipefail
digest=$(docker buildx imagetools inspect --raw "$PLAYWRIGHT_IMAGE" | sha256sum | cut -d' ' -f1)
recipe=$(sed -n '/^target "playwright"/,/^}/p' .github/ci-images.hcl)
key=$(printf '%s\n%s\n' "$digest" "$recipe" | sha256sum | cut -c1-16)
echo "$key $digest"
