#!/usr/bin/env bash
# ci.yml's e2e-images job, "The keys nothing has been built for yet": each
# image of the browser suite (.github/e2e-keys.sh) and the slim Playwright
# copy (scripts/ci/playwright_slim_key.sh) looked up in the registry by its
# key, and those not there yet written to GITHUB_OUTPUT for the job's build
# steps (`missing`, `page`, `playwright`), each key to GITHUB_ENV. Needs
# REGISTRY and PLAYWRIGHT_IMAGE; run from the repository root, on a CI
# runner signed in to the registry.
set -euo pipefail
there() { docker buildx imagetools inspect --raw "$1" > /dev/null 2>&1; }
keys=$(bash .github/e2e-keys.sh)
missing=""
while read -r name key; do
  if [ "$name" = page ]; then
    if there "$REGISTRY/gateway:e2e-page-$key"; then
      echo "the page: gateway:e2e-page-$key is there"
    else
      echo "the page: gateway:e2e-page-$key to build"
      echo "page=$REGISTRY/gateway:e2e-page-$key" >> "$GITHUB_OUTPUT"
    fi
    continue
  fi
  echo "$(echo "$name" | tr 'a-z-' 'A-Z_')_KEY=$key" >> "$GITHUB_ENV"
  if there "$REGISTRY/$name:e2e-$key"; then
    echo "$name: e2e-$key is there"
  else
    echo "$name: e2e-$key to build"
    missing="$missing $name"
  fi
done <<< "$keys"
echo "missing=${missing# }" >> "$GITHUB_OUTPUT"
# And the slim copy of the Playwright image, made again whenever
# what its name points at or the recipe slimming it changes.
slim_key=$(scripts/ci/playwright_slim_key.sh)
read -r slim digest <<< "$slim_key"
if there "$REGISTRY/e2e-playwright:$slim"; then
  echo "Playwright: e2e-playwright:$slim is there"
else
  echo "Playwright: e2e-playwright:$slim to make"
  echo "playwright=$REGISTRY/e2e-playwright:$slim" >> "$GITHUB_OUTPUT"
  echo "PLAYWRIGHT_FROM=$PLAYWRIGHT_IMAGE@sha256:$digest" >> "$GITHUB_ENV"
fi
