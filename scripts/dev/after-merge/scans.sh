#!/usr/bin/env bash
# The after-merge campaign's security scans, stock tools in their own
# images, their findings as JSON in $OUT/scans/ for report.py to triage:
#
#   scripts/dev/after-merge/scans.sh lockfiles   osv-scanner over every lockfile the repo tracks
#   scripts/dev/after-merge/scans.sh images      trivy over the built images and the ones compose pulls
#   scripts/dev/after-merge/scans.sh zap         OWASP ZAP's baseline on the web, and on the
#                                                gateway's API from its document (safe mode,
#                                                passive only), against the running stack
#
# The first two need no stack and change nothing; ZAP needs the stack up
# and measures the code that is live, so it waits for the merge.
set -euo pipefail
# shellcheck source=scripts/dev/after-merge/lib.sh
source "$(dirname "$0")/lib.sh"
dir=$OUT/scans
mkdir -p "$dir"

lockfiles() {
  mkdir -p "$dir/osv"
  # Each lockfile alone: a format osv-scanner cannot read fails its own
  # line, not the scan. node_modules and the like are never tracked.
  git -C "$repo" ls-files | grep -E '(^|/)(package-lock\.json|Cargo\.lock|requirements[^/]*\.txt|pom\.xml|libs\.versions\.toml|packages\.lock\.json)$' |
    while read -r f; do
      out=$dir/osv/$(echo "$f" | tr / _).json
      docker run --rm -v "$repo:/src:ro" "$OSV_IMAGE" scan source --format json -L "/src/$f" > "$out" 2> "$out.err" || true
      echo "$f"
    done > "$dir/osv/scanned.txt"
  say "osv-scanner: $(wc -l < "$dir/osv/scanned.txt" | tr -d ' ') lockfiles"
}

images() {
  mkdir -p "$dir/trivy"
  {
    docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^wingtip-(planner|gateway|weather|ingest|base|charts|crash-leads|retrain):latest$' || true
    # The third-party images the stack runs, as compose names them.
    grep -hoE 'image: [a-z0-9./_-]+:[A-Za-z0-9._-]+(@sha256:[0-9a-f]+)?' "$repo/docker-compose.yml" "$repo/infra/docker-compose.prod.yml" | cut -d' ' -f2 | sort -u
  } > "$dir/trivy/images.txt"
  while read -r image; do
    out=$dir/trivy/$(echo "${image%@*}" | tr '/:' '__').json
    docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v wingtip-trivy-cache:/root/.cache \
      "$TRIVY_IMAGE" image --quiet --scanners vuln --severity HIGH,CRITICAL --format json "$image" > "$out" 2> "$out.err" || true
  done < "$dir/trivy/images.txt"
  say "trivy: $(wc -l < "$dir/trivy/images.txt" | tr -d ' ') images"
}

zap() {
  mkdir -p "$dir/zap"
  chmod 777 "$dir/zap"
  stack_up
  cp "$repo/services/gateway/openapi.json" "$dir/zap/gateway-openapi.json"
  # -I: a warning is a finding to triage, not a failed run.
  docker run --rm --network "$NET" -v "$dir/zap:/zap/wrk:rw" "$ZAP_IMAGE" \
    zap-baseline.py -t http://gateway:8080/ -J web.json -r web.html -I > "$dir/zap/web.txt" 2>&1 || true
  docker run --rm --network "$NET" -v "$dir/zap:/zap/wrk:rw" "$ZAP_IMAGE" \
    zap-api-scan.py -t /zap/wrk/gateway-openapi.json -f openapi -O http://gateway:8080 -S -J api.json -r api.html -I > "$dir/zap/api.txt" 2>&1 || true
  say "zap: baseline on the web and the gateway's API"
}

case ${1:-} in
  lockfiles | images | zap) "$1" ;;
  *) echo "scans.sh lockfiles|images|zap" >&2; exit 2 ;;
esac
