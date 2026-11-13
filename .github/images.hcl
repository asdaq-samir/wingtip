# Every image this repository ships, for `docker buildx bake` in the
# build-images job (workflows/ci.yml): the contexts and Dockerfiles
# docker-compose.yml builds them from, built together by one BuildKit,
# in parallel. They were a job each, three runners at a time, and each
# runner spent 8 to 19 seconds starting a builder before a build of 8 to
# 12 -- on a run that changed them all, the last one ended two minutes
# in, behind the rest of the run.
#
# REGISTRY: ghcr.io/<owner>/<repo>, where each image's layer cache lives
# (`<image>:buildcache`, every stage's layers, written from main only)
# and where main pushes the image under this commit's tag,
# `<image>:sha-<SHA>`, never `latest`: the Promote workflow
# (workflows/promote.yml) gives it that name once CI has passed. PUSH is "true" on main; anywhere else the
# images are built and not pushed, the build being the check that each
# Dockerfile still builds.
variable "REGISTRY" {
  default = ""
}
variable "SHA" {
  default = ""
}
variable "PUSH" {
  default = "false"
}

# Every image, for a bake with no target named -- and the list the
# Promote workflow walks, promoting each this commit built.
group "default" {
  targets = ["base", "ml", "retrain", "charts", "planner", "ingest", "weather", "gateway"]
}

function "image" {
  params = [name]
  result = {
    tags       = ["${REGISTRY}/${name}:sha-${SHA}"]
    # The base's cache too: every image that imports wingtip is built
    # FROM it (services/Dockerfile.base), so the engine and wingtip's
    # requirements an earlier run built are found by each image, not
    # built again for each image's own cache.
    cache-from = ["type=registry,ref=${REGISTRY}/${name}:buildcache",
                  "type=registry,ref=${REGISTRY}/base:buildcache"]
    cache-to   = PUSH == "true" ? ["type=registry,ref=${REGISTRY}/${name}:buildcache,mode=max,image-manifest=true,oci-mediatypes=true"] : []
    output     = PUSH == "true" ? ["type=registry"] : ["type=cacheonly"]
  }
}

# wingtip's Python base (services/Dockerfile.base): Python, wingtip's own
# requirements and its Rust extension. Each image below that imports
# wingtip names it as its `wingtip-base` context, `target:base`, so one
# bake builds it once for all of them; main also pushes it as an image of
# its own (`base:sha-<SHA>`, promoted to `base:latest`), which the ECR
# push builds the planner on (workflows/promote.yml).
target "base" {
  context    = "."
  dockerfile = "services/Dockerfile.base"
  target     = "base"
  tags       = image("base").tags
  cache-from = image("base").cache-from
  cache-to   = image("base").cache-to
  output     = image("base").output
}

target "ml" {
  context    = "."
  dockerfile = "ml/Dockerfile.ml"
  contexts   = { wingtip-base = "target:base" }
  tags       = image("ml").tags
  cache-from = image("ml").cache-from
  cache-to   = image("ml").cache-to
  output     = image("ml").output
}

# The jobs (services/jobs): the training run, and the charts job the
# AWS refresh task and the server's cron run.
target "retrain" {
  context    = "."
  dockerfile = "services/jobs/retrain/Dockerfile"
  contexts   = { wingtip-base = "target:base" }
  tags       = image("retrain").tags
  cache-from = image("retrain").cache-from
  cache-to   = image("retrain").cache-to
  output     = image("retrain").output
}

target "charts" {
  context    = "."
  dockerfile = "services/jobs/charts/Dockerfile"
  contexts   = { wingtip-base = "target:base" }
  tags       = image("charts").tags
  cache-from = image("charts").cache-from
  cache-to   = image("charts").cache-to
  output     = image("charts").output
}

target "planner" {
  context    = "."
  dockerfile = "services/planner/Dockerfile"
  contexts   = { wingtip-base = "target:base" }
  tags       = image("planner").tags
  cache-from = image("planner").cache-from
  cache-to   = image("planner").cache-to
  output     = image("planner").output
}

# The live feeds (services/ingest), on the same base as the planner.
target "ingest" {
  context    = "."
  dockerfile = "services/ingest/Dockerfile"
  contexts   = { wingtip-base = "target:base" }
  tags       = image("ingest").tags
  cache-from = image("ingest").cache-from
  cache-to   = image("ingest").cache-to
  output     = image("ingest").output
}


# The weather service (services/weather), on the same base as the planner.
target "weather" {
  context    = "."
  dockerfile = "services/weather/Dockerfile"
  contexts   = { wingtip-base = "target:base" }
  tags       = image("weather").tags
  cache-from = image("weather").cache-from
  cache-to   = image("weather").cache-to
  output     = image("weather").output
}

target "gateway" {
  context    = "."
  dockerfile = "services/gateway/Dockerfile"
  tags       = image("gateway").tags
  cache-from = image("gateway").cache-from
  cache-to   = image("gateway").cache-to
  output     = image("gateway").output
}
