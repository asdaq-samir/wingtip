# syntax=docker/dockerfile:1

# ingest: the live feeds, read always, into the stores the planner reads
# (services/ingest/README.md). wingtip's base (services/Dockerfile.base):
# Python, wingtip's own requirements, its Rust extension and the appuser,
# built once for every image that imports wingtip. The build context
# `wingtip-base` names it.
FROM wingtip-base

WORKDIR /workspace/services/ingest

# The data folder is the user's (the base made appuser): the stacks mount
# theirs over it, the one the planner mounts, where the stores are.
RUN mkdir -p /workspace/data && chown appuser:appuser /workspace/data

COPY services/ingest/requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

# wingtip where the planner keeps it, so wingtip.config finds the data
# folder at /workspace/data as it does in the planner's image.
COPY services/planner/wingtip /workspace/services/planner/wingtip
COPY services/ingest/ingest ./ingest

USER appuser

ENV PYTHONPATH=/workspace/services/ingest:/workspace/services/planner
# The build fails here if a package this image's code imports is missing,
# the lazy Solace client included, rather than the container on its start.
RUN python -B -c "import ingest.main, ingest.health, wingtip_native, solace.messaging.messaging_service"

# Healthy while its beat in the live store is fresh (ingest.health).
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 CMD ["python", "-m", "ingest.health"]

CMD ["python", "-m", "ingest.main"]
