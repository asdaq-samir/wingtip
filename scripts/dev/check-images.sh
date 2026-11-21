# shellcheck shell=bash disable=SC2154
# The images and the engine's wheel scripts/dev/check.sh runs its areas in,
# sourced by it, with its $here, $NODE, $PYTHON and $RUST_IMAGE and
# scripts/build/shared-cache.sh's engine store set. Split from check.sh
# (2026-11-18), which had grown past the 400-line budget: what is built
# here, what each area runs there.
#
# Every agent's worktree used to start cold: npm ci in a fresh node
# container, the engine compiled from nothing, pip into a fresh container,
# Maven's downloads again. What is kept between runs, and shared by every
# worktree:
# - wingtip-check-web:<hash>: node (.tool-versions') with web's node_modules for this
#   package-lock, installed at /node_modules, which Node, TypeScript and
#   ESLint all find by walking up from /repo/apps/web. Built when the lock
#   changes; npm's downloads in BuildKit's cache (id wingtip-npm).
# - wingtip-check-py-<requirements-dev file>:<hash>: python with that file's
#   requirements and the wingtip_native wheel for this engine/ (CI's `ci`
#   profile), the wheel from the shared engine store (below). Built when
#   either changes; uv's downloads in BuildKit's cache.
# - The engine store and sccache (scripts/build/shared-cache.sh,
#   docs/LOCAL-DEV.md "Shared build caches"): each engine build for an app
#   kept once per engine hash in ~/Library/Caches/wingtip/engine, and Rust's
#   compiles in sccache, in Docker one cache volume per turn of
#   one-at-a-time.sh (wingtip-sccache-turn-<n>), since it allows one server.
# - Volumes: wingtip-cargo-registry and wingtip-cargo-git (Cargo's
#   downloads), wingtip-cargo-target-tests-<rust>-<arch>-<hash of the worktree's path>
#   (the engine tests' build, one per worktree; tidy-build-caches.sh removes
#   those of worktrees that are gone), wingtip-cargo-tools (cargo-machete),
#   wingtip-check-raw-<leg> (the FAA files each Python leg's tests fetch
#   into data/raw, as CI's cache keeps them, one volume a leg), fp-m2 (Maven's repository).
# Every worktree is mounted at /w in the engine's container, so sccache
# shares the engine's own crates between worktrees by their content; the
# target stays the worktree's own, since Cargo's freshness is by mtime.
# CHECK_NO_CACHE=1 builds the images again without BuildKit's layer cache
# (its cache mounts stay), for an image whose key missed a change.
# Each image keeps its newest tag alone; `docker volume rm` any of the
# volumes at any time costs one cold run.

sha() { shasum -a 256 | cut -c1-16; }

# Keeps a check image's tags used lately, and always the one just built.
# It once kept only the newest tag by creation time, which broke two ways
# (2026-11-17): the name is shared by every worktree, so one worktree's build
# deleted the image another was about to run; and a rebuild that came wholly
# from BuildKit's cache keeps its old creation time, so the image just built
# looked oldest and was deleted, and the run fell back to a stale image with
# an older engine wheel. Creation time says nothing about use, so each use
# stamps the tag (use_tag) and a tag goes only when it is not the one just
# built and unused for WINGTIP_CHECK_IMAGE_HOURS (24). Disk stays bounded,
# the reason this prunes (old tags filled it, 2026-11-10), while a worktree
# that used a tag a few hours ago still finds it. A tag a running container
# holds is left too: `docker image rm` without -f refuses it.
stamp_dir=${WINGTIP_CHECK_STAMPS:-$HOME/Library/Caches/wingtip/check-images}
use_tag() {
  mkdir -p "$stamp_dir" && touch "$stamp_dir/$(echo "$1" | tr '/:' '__')" || true
}
prune_tags() {
  local name=$1 keep=$2 tag stamp
  use_tag "$keep"
  docker image ls "$name" --format '{{.Repository}}:{{.Tag}}' | while read -r tag; do
    [ "$tag" = "$keep" ] && continue
    stamp="$stamp_dir/$(echo "$tag" | tr '/:' '__')"
    [ -n "$(find "$stamp" -mmin "-$(( ${WINGTIP_CHECK_IMAGE_HOURS:-24} * 60 ))" 2>/dev/null)" ] && continue
    docker image rm "$tag" >/dev/null 2>&1 || true
  done
}

web_image() {
  local tag ctx
  tag=wingtip-check-web:$({ echo "node $NODE"; cat "$here/apps/web/package.json" "$here/apps/web/package-lock.json"; } | sha)
  if [ -n "${CHECK_NO_CACHE:-}" ] || ! docker image inspect "$tag" >/dev/null 2>&1; then
    ctx=$(mktemp -d)
    cp "$here/apps/web/package.json" "$here/apps/web/package-lock.json" "$ctx/"
    echo "check: building $tag (web's packages changed)" >&2
    docker build -q ${CHECK_NO_CACHE:+--no-cache} -t "$tag" --build-arg NODE="$NODE" -f - "$ctx" >/dev/null <<'EOF'
ARG NODE
FROM node:${NODE}-slim
COPY package.json package-lock.json /
RUN --mount=type=cache,id=wingtip-npm,target=/root/.npm \
    cd / && npm ci --no-audit --no-fund --loglevel=error
ENV PATH=/node_modules/.bin:$PATH
EOF
    rm -rf "$ctx"
    prune_tags wingtip-check-web "$tag"
  fi
  use_tag "$tag"
  echo "$tag"
}

# A requirements file and every file it names with -r or -c, from the repo
# root, each once.
requirements_of() {
  local file=$1 dir line
  echo "$file"
  dir=$(dirname "$file")
  sed -nE 's/^-[rc][[:space:]]*([^[:space:]#]+).*/\1/p' "$here/$file" | while read -r line; do
    requirements_of "$(cd "$here/$dir" && python3 -c 'import os,sys; print(os.path.relpath(os.path.abspath(sys.argv[1]), sys.argv[2]))' "$line" "$here")"
  done
}

# The engine's wheel (wingtip_native, CI's `ci` profile) for Docker's
# machine, into <dest>: from the shared engine store when any worktree has
# built this engine, else built and put there (scripts/build/shared-cache.sh).
# Built at one path, /engine, through sccache in a BuildKit cache that one
# build holds at a time (sharing=locked: sccache's disk cache wants a single
# server), so a changed file recompiles its crate and those above it; the
# target is the build's own and goes with it.
engine_wheel() {
  local dest=$1 kind ctx wrapper=""
  kind=py-wheel-linux-$(docker version -f '{{.Server.Arch}}')
  engine_store_restore "$kind" "$dest" scripts/dev/check.sh && return 0
  ctx=$(mktemp -d)
  (cd "$here" && git ls-files -z -co --exclude-standard -- engine | xargs -0 tar cf - 2>/dev/null) | tar xf - -C "$ctx"
  mkdir -p "$ctx/bin"
  if shared_cache_on && cp "$(sccache_bin "$(sccache_linux_triple)")" "$ctx/bin/sccache" 2>/dev/null; then
    wrapper=/bin-sccache/sccache
  fi
  cat > "$ctx/Dockerfile" <<WHEEL
FROM python:$PYTHON-slim AS native
COPY --from=$RUST_IMAGE /usr/local/cargo /usr/local/cargo
COPY --from=$RUST_IMAGE /usr/local/rustup /usr/local/rustup
ENV PATH=/usr/local/cargo/bin:\$PATH CARGO_HOME=/usr/local/cargo RUSTUP_HOME=/usr/local/rustup
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \\
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \\
    rm -f /etc/apt/apt.conf.d/docker-clean \\
    && apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev
RUN --mount=type=cache,id=wingtip-uv,target=/root/.cache/uv pip install -q uv && uv pip install --system -q maturin==1.16.0
COPY bin /bin-sccache
COPY engine /engine
RUN --mount=type=cache,id=wingtip-cargo-registry,target=/usr/local/cargo/registry \\
    --mount=type=cache,id=wingtip-sccache-buildkit,target=/sccache,sharing=locked \\
    export SCCACHE_DIR=/sccache SCCACHE_CACHE_SIZE=$SCCACHE_CACHE_SIZE CARGO_INCREMENTAL=0 RUSTC_WRAPPER=$wrapper \\
    && CARGO_TARGET_DIR=/tmp/target maturin build --profile ci --compatibility linux -m /engine/bindings/py/Cargo.toml -o /wheels \\
    && { [ -z "$wrapper" ] || $wrapper --stop-server >/dev/null; }

FROM scratch
COPY --from=native /wheels /
WHEEL
  echo "check: building the engine's wheel (engine/ changed)" >&2
  rm -rf "$dest" && docker build -q -o "type=local,dest=$dest" "$ctx" >/dev/null
  rm -rf "$ctx"
  engine_store_publish "$kind" "$dest" scripts/dev/check.sh
}

# python for that directory with one of its requirements-dev files and the
# native wheel.
py_image() {
  local dir=$1 dev=$2 name tag ctx req
  name=wingtip-check-py-$(basename "$dev" .txt)
  # Another service's suite keeps an image name of its own, so its tags
  # never prune the planner's.
  [ "$dir" = services/planner ] || name=wingtip-check-py-$(basename "$dir")-$(basename "$dev" .txt)
  ctx=$(mktemp -d)
  mkdir -p "$ctx/reqs"
  for req in $(requirements_of "$dir/$dev" | sort -u); do
    mkdir -p "$ctx/reqs/$(dirname "$req")"
    cp "$here/$req" "$ctx/reqs/$req"
  done
  engine_wheel "$ctx/wheels"
  cat > "$ctx/Dockerfile" <<EOF
FROM python:$PYTHON-slim
ENV PYTHONDONTWRITEBYTECODE=1
# rasterio's wheel links libexpat, which GitHub's runner has and slim lacks.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \\
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \\
    rm -f /etc/apt/apt.conf.d/docker-clean \\
    && apt-get update && apt-get install -y --no-install-recommends libexpat1
RUN --mount=type=cache,id=wingtip-uv,target=/root/.cache/uv pip install -q uv
COPY reqs /reqs
RUN --mount=type=cache,id=wingtip-uv,target=/root/.cache/uv \\
    uv pip install --system -q -r /reqs/$dir/$dev
RUN --mount=type=cache,id=wingtip-uv,target=/root/.cache/uv \\
    --mount=type=bind,source=wheels,target=/wheels \\
    uv pip install --system -q /wheels/*.whl
EOF
  tag=$name:$( (cd "$ctx" && find . -type f | LC_ALL=C sort | xargs shasum -a 256) | sha)
  if [ -n "${CHECK_NO_CACHE:-}" ] || ! docker image inspect "$tag" >/dev/null 2>&1; then
    echo "check: building $tag ($dir's requirements or engine/ changed${CHECK_NO_CACHE:+, or CHECK_NO_CACHE})" >&2
    docker build -q ${CHECK_NO_CACHE:+--no-cache} -t "$tag" "$ctx" >/dev/null
    prune_tags "$name" "$tag"
  fi
  use_tag "$tag"
  rm -rf "$ctx"
  echo "$tag"
}
