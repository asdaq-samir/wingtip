# syntax=docker/dockerfile:1

# wingtip's base (services/Dockerfile.base): Python, wingtip's own
# requirements, its Rust extension and the appuser, built once for every
# image that imports wingtip. The build context `wingtip-base` names it.
FROM wingtip-base

WORKDIR /workspace/services/planner

# rasterio's wheel bundles GDAL, which links libexpat for its XML
# (GeoTIFF metadata, VRTs) and does not bundle it; without this the
# import fails on the slim image.
# apt's package cache in a cache mount, like pip's below: the layer is
# what CI restores, the mount only saves a local rebuild the download.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update && apt-get install -y --no-install-recommends libexpat1
# The service's own list includes wingtip's (-r requirements-wingtip-charts.txt,
# which takes requirements-wingtip.txt), all three beside each other.
COPY services/planner/requirements.txt services/planner/requirements-wingtip.txt services/planner/requirements-wingtip-charts.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

COPY services/planner/app ./app
COPY services/planner/wingtip ./wingtip

USER appuser

ENV PYTHONPATH=/workspace/services/planner
# The build fails here if a package this image's code imports is
# missing, rather than the container on its next start: on 2026-09-22 a
# new import in wingtip left both agents and both pipeline stages unable to
# start, and every build passed. The lazy imports are named too, as
# importing the entry module does not reach them.
RUN python -B -c "import app.main, wingtip_native, rasterio.vrt, rasterio.warp, rasterio.features, affine, scipy.ndimage, pyarrow.parquet, shapely.ops, sklearn, joblib"
# GDAL's block cache defaults to 5% of the machine's RAM and holds
# decoded chart raster blocks across tile renders; bounded, so that
# rendering a screenful of zoomed-out tiles (each reading a wide window
# of several sheets) cannot grow this process past what the compose
# stack's VM can spare. Once the pyramid is pre-rendered the cache is
# idle anyway. MALLOC_ARENA_MAX for the same reason: tiles render on
# uvicorn's worker threads, and glibc's default of one 64 MB malloc
# arena per thread let the process fragment its way to 3 GB resident
# after a few screenfuls of zoomed-out tiles that a single-threaded
# render of the same tiles does in 300 MB.
ENV GDAL_CACHEMAX=128 MALLOC_ARENA_MAX=2
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
