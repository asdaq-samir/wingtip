# The three images the browser suite runs against in CI (the e2e job in
# workflows/ci.yml), for `docker buildx bake`: the same contexts and
# Dockerfiles docker-compose.yml builds them from. A bake file rather
# than the compose files themselves, which bake reads too: its parser
# refuses their `networks: [default, …]`, which compose itself takes as
# read.
#
# REGISTRY (ghcr.io/<owner>/<repo>, from the workflow): where the
# registry cache build-images writes on main lives, one `:buildcache` tag
# per image, and where the e2e-images job pushes these two. Empty, as
# on a machine of one's own, nothing is read.
variable "REGISTRY" {
  default = ""
}

# Each image's key (.github/e2e-keys.sh, from the e2e-images job): the
# tag it is pushed under, `e2e-<key>`, for the shards to pull, and `e2e`
# beside it, which always names the last one pushed -- what a shard pulls
# first, for the layers a new key's image will share with it. Pushed
# with their cache inline, so the next build finds its own last layers
# too. Empty (a pull request's shard
# building one itself): tagged the name infra/docker-compose.ci.yml runs it
# by, and loaded, not pushed.
variable "GATEWAY_KEY" {
  default = ""
}
variable "PLANNER_KEY" {
  default = ""
}
variable "WEATHER_KEY" {
  default = ""
}

function "cache" {
  params = [image]
  result = REGISTRY == "" ? [] : ["type=registry,ref=${REGISTRY}/${image}:buildcache", "type=registry,ref=${REGISTRY}/${image}:e2e"]
}

# Each image goes by its compose service's name, in the registry
# (gateway, planner) and locally (wingtip-gateway:ci, wingtip-planner:ci).
function "tags" {
  params = [name, key]
  result = key == "" ? ["wingtip-${name}:ci"] : ["${REGISTRY}/${name}:e2e-${key}", "${REGISTRY}/${name}:e2e"]
}

# Pushed (with a key) with every layer zstd rather than gzip, the base
# image's too: zstd unpacks several times faster, and on the faster
# runners a shard's setup is its processors' -- 85 to 93% busy, a tenth
# of it waiting on the disk -- most of it unpacking images. Recompressing
# costs the build, which is once per key. Without a key, loaded
# (`--load`), which sets its own output.
function "pushed" {
  params = [key]
  result = key == "" ? [] : ["type=registry,compression=zstd,force-compression=true,oci-mediatypes=true"]
}

group "ci" {
  targets = ["gateway", "planner", "weather"]
}

target "gateway" {
  context    = "."
  dockerfile = "services/gateway/Dockerfile"
  tags       = tags("gateway", GATEWAY_KEY)
  cache-from = cache("gateway")
  cache-to   = GATEWAY_KEY == "" ? [] : ["type=inline"]
  output     = pushed(GATEWAY_KEY)
}

# wingtip's Python base, which the planner is built FROM
# (services/Dockerfile.base): built in the same bake, from images.hcl's
# cache of it.
target "base" {
  context    = "."
  dockerfile = "services/Dockerfile.base"
  target     = "base"
  cache-from = cache("base")
}

target "planner" {
  context    = "."
  dockerfile = "services/planner/Dockerfile"
  contexts   = { wingtip-base = "target:base" }
  tags       = tags("planner", PLANNER_KEY)
  cache-from = cache("planner")
  cache-to   = PLANNER_KEY == "" ? [] : ["type=inline"]
  output     = pushed(PLANNER_KEY)
}

# The weather service (services/weather), since 2026-11-08 the only
# fetcher of the weather the planner reads (wingtip.weather_store): with
# no weather service the suite's planner would read an empty store. Built
# FROM the same base as the planner; its code, like the planner's, is the
# checkout, mounted by docker-compose.yml.
target "weather" {
  context    = "."
  dockerfile = "services/weather/Dockerfile"
  contexts   = { wingtip-base = "target:base" }
  tags       = tags("weather", WEATHER_KEY)
  cache-from = cache("weather")
  cache-to   = WEATHER_KEY == "" ? [] : ["type=inline"]
  output     = pushed(WEATHER_KEY)
}

# The image the suite's tests run in: the Playwright image (PLAYWRIGHT_FROM,
# by its digest) without the two browsers the suite never launches --
# Chromium itself and Firefox; the suite's headless Chromium is the
# headless shell -- as one layer, so they are not pulled, unpacked and
# written on every shard. WebKit stays: main's push runs the webkit-phone
# smoke in it (sheet-webkit.spec.ts), and the iPhone's bugs are WebKit's;
# deleting it failed that test in 2 ms on every push (run 43552072818).
# Its tag is keyed on this target's text too (scripts/ci/playwright_slim_key.sh). Every other file is the
# image's own, byte for byte; the same page drawn in both came out the
# same, pixel for pixel. FROM scratch carries none of the image's
# settings, so its four are set again, as `docker image inspect` gives
# them. Pushed with zstd layers, which unpack several times faster than
# gzip, under PLAYWRIGHT_TAG (the e2e-images job's).
variable "PLAYWRIGHT_FROM" {
  default = ""
}
variable "PLAYWRIGHT_TAG" {
  default = ""
}

target "playwright" {
  dockerfile-inline = <<-EOT
    FROM ${PLAYWRIGHT_FROM} AS full
    RUN rm -rf /ms-playwright/chromium-[0-9]* /ms-playwright/firefox-*
    FROM scratch
    COPY --from=full / /
    ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
        LANG=C.UTF-8 LC_ALL=C.UTF-8 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
    CMD ["/bin/bash"]
  EOT
  platforms         = ["linux/amd64"]
  tags              = [PLAYWRIGHT_TAG]
  output            = ["type=registry,compression=zstd,force-compression=true,oci-mediatypes=true"]
}
