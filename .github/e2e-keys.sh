#!/usr/bin/env bash
# The key of each image the browser suite runs (.github/ci-images.hcl),
# and of the page its gateway serves: a hash of the files, as this commit
# has them, that decide what each does in the suite's stack. Each is
# built once per key, by the e2e-images job, and a shard pulls the one
# built by any earlier commit with the same key -- most commits change
# none of the images', and a shard then waits for no image to be built.
# One line each: "<name> <key>".
#
#   gateway            its jar: services/gateway's Dockerfile, pom and
#                     sources, and the planner's OpenAPI document
#                     built into it. Not apps/web/: the suite's stack serves the
#                     page below, mounted over the image's
#                     (infra/docker-compose.ci.yml).
#   planner  its packages: the Dockerfile, the base it is built
#                     FROM (services/Dockerfile.base), the requirements it
#                     installs and engine/, the engine the base builds
#                     into the image (a rule added there is missing from
#                     an image keyed without it: the planner answered "the
#                     engine has no rule called data_cycle"). Not its
#                     Python code, which the stack mounts from the
#                     checkout over the image's
#                     (docker-compose.yml).
#   page              the page: apps/web/ but its browser suite (apps/web/e2e),
#                     the two API documents its types are made from, and
#                     the Node it is built with.
#
# An image's key begins with how the images are pushed (ci-images.hcl's
# `pushed`), so that a change there is a new image for every key.
set -euo pipefail
key() { { echo "zstd"; git ls-tree -r HEAD -- "$@"; } | git hash-object --stdin | cut -c1-16; }
echo "gateway $(key services/gateway/Dockerfile services/gateway/pom.xml services/gateway/src/main services/planner/openapi.json)"
echo "planner $(key services/planner/Dockerfile services/Dockerfile.base services/planner/requirements.txt services/planner/requirements-wingtip.txt services/planner/requirements-wingtip-charts.txt engine)"
echo "weather $(key services/weather/Dockerfile services/weather/requirements.txt services/Dockerfile.base services/planner/requirements-wingtip.txt engine)"
echo "page $(git ls-tree -r HEAD -- apps/web services/planner/openapi.json services/gateway/openapi.json apps/web/.nvmrc \
  | grep -v $'\tapps/web/e2e/' | git hash-object --stdin | cut -c1-16)"
