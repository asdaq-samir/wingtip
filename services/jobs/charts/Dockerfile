# syntax=docker/dockerfile:1

# The charts job (services/jobs/charts): the FAA chart cycle's raster tiles
# (wingtip.charts' refresh) and the map's overlay tiles (charts.overlays,
# tippecanoe), built once a cycle in a container of their own, so the
# planner only serves them. `python -m charts <command>` is the entry
# point; services/jobs/README.md says how each is run.

# tippecanoe (felt/tippecanoe), which makes the map's FAA overlays into
# vector tiles: built from its tagged release, the tarball checked against
# its sum, on the same Debian as the image below so the binaries find the
# same sqlite and zlib there. Only the two programs are copied on:
# tippecanoe, and tippecanoe-decode, which the tests read an archive back
# with. It was the planner's until the jobs split (#535).
FROM python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928 AS tippecanoe
ARG TIPPECANOE_VERSION=2.79.0
ARG TIPPECANOE_SHA256=b0fd9df49b6efc988288ea48774822c6de19eb48428017f27ee0b3b01d44f05d
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update && apt-get install -y --no-install-recommends build-essential libsqlite3-dev zlib1g-dev curl ca-certificates
RUN curl -fsSL -o /tmp/tippecanoe.tar.gz "https://github.com/felt/tippecanoe/archive/refs/tags/${TIPPECANOE_VERSION}.tar.gz" \
    && echo "${TIPPECANOE_SHA256}  /tmp/tippecanoe.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/tippecanoe.tar.gz -C /tmp \
    && make -C "/tmp/tippecanoe-${TIPPECANOE_VERSION}" -j"$(nproc)" tippecanoe tippecanoe-decode \
    && install -m 755 "/tmp/tippecanoe-${TIPPECANOE_VERSION}/tippecanoe" "/tmp/tippecanoe-${TIPPECANOE_VERSION}/tippecanoe-decode" /usr/local/bin/

# wingtip's base (services/Dockerfile.base): Python, wingtip's own
# requirements, its Rust extension and the appuser, built once for every
# image that imports wingtip. The build context `wingtip-base` names it.
FROM wingtip-base

WORKDIR /workspace/services/jobs

# rasterio's wheel bundles GDAL, which links libexpat for its XML
# (GeoTIFF metadata, VRTs) and does not bundle it; tippecanoe links
# sqlite, zlib and the C++ runtime.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update && apt-get install -y --no-install-recommends libexpat1 libsqlite3-0 zlib1g libstdc++6
COPY --from=tippecanoe /usr/local/bin/tippecanoe /usr/local/bin/tippecanoe-decode /usr/local/bin/
# The data folder is the user's (the base made appuser): the stacks mount
# theirs over it, but the chart refresh task on Fargate mounts nothing and
# writes the cycle's sheets and tiles there.
RUN mkdir -p /workspace/data && chown appuser:appuser /workspace/data

# Copied at the paths they have in the repo, so the job's list finds
# wingtip's through its -r, and wingtip finds the data folder
# (wingtip.config's PROJECT_ROOT) where the stacks mount it.
COPY services/planner/requirements-wingtip.txt services/planner/requirements-wingtip-charts.txt /workspace/services/planner/
COPY services/jobs/charts/requirements.txt charts/
RUN --mount=type=cache,target=/root/.cache/pip pip install -r charts/requirements.txt

COPY services/planner/wingtip /workspace/services/planner/wingtip
COPY services/jobs/charts ./charts

USER appuser

ENV PYTHONPATH=/workspace/services/jobs:/workspace/services/planner
# GDAL's block cache and glibc's arenas bounded as the planner's are, and
# for its reasons (services/planner/Dockerfile): the pyramid's renders
# warp the same wide windows of several sheets its tiles do.
ENV GDAL_CACHEMAX=128 MALLOC_ARENA_MAX=2
# The build fails here if a package the job imports is missing, rather
# than the task on its next scheduled night. The lazy imports are named
# too, as importing the entry module does not reach them.
RUN python -B -c "import charts.cli, wingtip_native, rasterio.vrt, rasterio.warp, rasterio.features, affine, scipy.ndimage, boto3, shapely" \
    && tippecanoe --version
ENTRYPOINT ["python", "-m", "charts"]
CMD ["run"]
