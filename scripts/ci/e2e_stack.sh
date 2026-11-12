#!/usr/bin/env bash
# ci.yml's e2e job, "The stack, in the background": the three images this
# commit runs, each the one e2e-images built for its key
# (.github/e2e-keys.sh), nearly always by an earlier commit's run. A new key:
# pull the last `e2e` image (most of its layers) and then the new one the
# moment it is pushed. Once the planner is warm, the corridor's nav log is
# asked for, so no test waits on it. Needs REGISTRY, REPOSITORY, RUN_ID,
# GH_TOKEN and T0 (set by e2e_public_images.sh); run from the repository
# root on a CI runner, after e2e_public_images.sh.
set -e
cat > /tmp/e2e-out/stack.sh <<'EOF'
mark() { echo "$(($(date +%s) - T0)) $*" >> /tmp/e2e-out/timeline; }
there() { docker buildx imagetools inspect --raw "$1" > /dev/null 2>&1; }
# Until e2e-images has pushed $1. After a minute, ask after that
# job every twenty seconds: once it has ended, it never will.
await() {
  local built
  until there "$1"; do
    sleep 2
    if [ "$SECONDS" -ge 60 ]; then
      built=$(gh api "repos/$REPOSITORY/actions/runs/$RUN_ID/jobs?per_page=100" \
        --jq '.jobs[] | select(.name == "build (e2e)") | .conclusion // "running"')
      if [ "$built" != running ] && [ -n "$built" ] && ! there "$1"; then
        echo "no $1, and build (e2e) ended: $built"
        return 1
      fi
      sleep 18
    fi
  done
}
# Until Postgres and Mailpit are pulled, which go first.
small() { until [ -f /tmp/e2e-out/small.pulled ]; do sleep 0.5; done; }
# One image, $1, for its key, $2.
fetch() {
  local ref=$REGISTRY/$1 built=yes
  there "$ref:e2e-$2" || built=""
  small
  if [ -z "$built" ]; then
    docker pull -q "$ref:e2e" > /dev/null 2>&1
    await "$ref:e2e-$2" || return 1
  fi
  docker pull -q "$ref:e2e-$2" > /dev/null || return 1
  docker tag "$ref:e2e-$2" "wingtip-$1:ci"
  mark "$1 pulled"
}
# The page, for its key, $1: copied out of the image e2e-images
# made of it into apps/web/dist, which the gateway serves.
page() {
  local ref=$REGISTRY/gateway:e2e-page-$1
  await "$ref" || return 1
  docker pull -q "$ref" > /dev/null || return 1
  docker create --name e2e-page "$ref" none > /dev/null || return 1
  docker cp e2e-page:/page/. apps/web/dist/ > /dev/null || return 1
  docker rm e2e-page > /dev/null
  mark "the page copied"
}
start() {
  local after=net
  if [ "$1" = planner ]; then
    until [ -f /tmp/e2e-out/data.ready ]; do sleep 1; done
  elif [ "$1" = gateway ]; then
    after=db
  fi
  until [ -f /tmp/e2e-out/$after.exit ]; do sleep 1; done
  [ "$(cat /tmp/e2e-out/$after.exit)" = 0 ] || return 1
  mark "$1 starting"
  docker compose -f docker-compose.yml -f infra/docker-compose.ci.yml up -d --no-build "$1" || return 1
  mark "$1 started"
  if [ "$1" = planner ]; then
    nohup bash /tmp/e2e-out/first-reads.sh > /tmp/e2e-out/first-reads.log 2>&1 < /dev/null &
  fi
}
keys=$(bash .github/e2e-keys.sh) || exit 1
while read -r name key; do
  if [ "$name" != page ]; then
    { fetch "$name" "$key" && start "$name"; } &
  else
    page "$key" &
  fi
done <<< "$keys"
failed=0
for job in $(jobs -p); do wait "$job" || failed=1; done
exit "$failed"
EOF
cat > /tmp/e2e-out/first-reads.sh <<'EOF'
until curl -sf http://localhost:8084/ | grep -q '"warm":true'; do sleep 1; done
curl -sf -o /dev/null --max-time 600 "http://localhost:8084/api/navlog?dep=C81&dest=KDLH"
echo "$(($(date +%s) - T0)) the nav log read, the first time (curl $?)" >> /tmp/e2e-out/timeline
EOF
# shellcheck disable=SC2016  # the inner shell expands its own $?
nohup bash -c 'bash /tmp/e2e-out/stack.sh > /tmp/e2e-out/stack.log 2>&1; echo $? > /tmp/e2e-out/stack.exit' > /dev/null 2>&1 < /dev/null &
