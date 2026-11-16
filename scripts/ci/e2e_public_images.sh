#!/usr/bin/env bash
# ci.yml's e2e job, "The public images, in the background": the caches' tmpfs
# mounts, then Postgres, Mailpit and the Playwright image pulled and started
# in the background, each logging when it was done to /tmp/e2e-out/timeline
# (the shard's annotation lists it). Needs REGISTRY, PLAYWRIGHT_IMAGE and, at
# night, FULL_BROWSERS; run from the repository root, on a CI runner only
# (it mounts tmpfs with sudo).
set -e
# apps/web/dist: where the page will be built, mounted into the
# gateway -- made now, so that Docker does not make it, as root.
mkdir -p /tmp/e2e-out apps/web/dist
# The caches are restored into tmpfs: on a runner whose disk writes
# about 230 MB/s they competed with the images for it.
mkdir -p data/raw apps/web/node_modules
sudo mount -t tmpfs -o "size=8g,mode=0777,uid=$(id -u),gid=$(id -g)" tmpfs data/raw
sudo mount -t tmpfs -o "size=2g,mode=0777,uid=$(id -u),gid=$(id -g)" tmpfs apps/web/node_modules
# Write-back kept small, so a container start's fsync does not wait
# behind gigabytes of unpacked images (20-27 s a service, run 36743209328).
sudo sysctl -q -w vm.dirty_bytes=$((256 << 20)) vm.dirty_background_bytes=$((64 << 20))
T0=$(date +%s)
export T0
echo "T0=$T0" >> "$GITHUB_ENV"
nohup vmstat -n 1 180 > /tmp/e2e-out/vmstat.log 2>&1 < /dev/null &
echo "0 the runner's disk: $(lsblk -e 7 -dno NAME,MODEL | xargs)" >> /tmp/e2e-out/timeline
cat > /tmp/e2e-out/playwright.sh <<'EOF'
read -r slim _ < <(scripts/ci/playwright_slim_key.sh)
until [ -f /tmp/e2e-out/small.pulled ]; do sleep 0.5; done
if [ -z "$FULL_BROWSERS" ] && docker pull -q "$REGISTRY/e2e-playwright:$slim" > /dev/null 2>&1; then
  docker tag "$REGISTRY/e2e-playwright:$slim" "$PLAYWRIGHT_IMAGE" && echo "its slim copy"
else
  docker pull -q "$PLAYWRIGHT_IMAGE" > /dev/null && echo "the image itself"
fi
EOF
cat > /tmp/e2e-out/public.sh <<'EOF'
mark() { echo "$(($(date +%s) - T0)) $*" >> /tmp/e2e-out/timeline; }
compose() { docker compose -f docker-compose.yml -f infra/docker-compose.ci.yml "$@"; }
compose pull -q db > /tmp/e2e-out/db.log 2>&1 &
db=$!
compose pull -q mailpit > /tmp/e2e-out/net.log 2>&1
wait $db
mark "Postgres and Mailpit pulled"
touch /tmp/e2e-out/small.pulled
compose up -d mailpit >> /tmp/e2e-out/net.log 2>&1
r=$?; mark "Mailpit up"; echo $r > /tmp/e2e-out/net.exit
compose up -d db >> /tmp/e2e-out/db.log 2>&1
r=$?; mark "Postgres up"; echo $r > /tmp/e2e-out/db.exit
EOF
nohup bash /tmp/e2e-out/public.sh > /dev/null 2>&1 < /dev/null &
# shellcheck disable=SC2016  # the inner shell expands its own $r and $T0
nohup bash -c 'bash /tmp/e2e-out/playwright.sh > /tmp/e2e-out/playwright.log 2>&1; r=$?; echo "$(($(date +%s) - T0)) the Playwright image, $(tail -1 /tmp/e2e-out/playwright.log)" >> /tmp/e2e-out/timeline; echo $r > /tmp/e2e-out/playwright.exit' > /dev/null 2>&1 < /dev/null &
