# syntax=docker/dockerfile:1

# The weather service (services/weather/README.md): fetches the weather the
# planner reads, on a schedule, into the weather store on the data volume
# both mount. Built FROM wingtip's base (services/Dockerfile.base): Python,
# wingtip's own requirements and the engine's wheel, which reads the
# products' ceilings, categories and validity. The build context
# `wingtip-base` names it.
FROM wingtip-base

WORKDIR /workspace/services/weather

# The data folder is the user's (the base made appuser): the stacks mount
# theirs over it.
RUN mkdir -p /workspace/data && chown appuser:appuser /workspace/data

COPY services/weather/requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

COPY services/weather/app ./app
# wingtip, beside app: the store, the readers' helpers and the settings
# both services share. At /workspace/services/weather/wingtip its
# config finds the project root, and so the data folder, at /workspace, as
# the planner's does.
COPY services/planner/wingtip ./wingtip

USER appuser

ENV PYTHONPATH=/workspace/services/weather
# The build fails here if a package this image's code imports is missing,
# rather than the container on its next start.
RUN python -B -c "import app.main, gribberish, wingtip_native"
# glibc's default of one 64 MB malloc arena per thread, with three fetches
# at once and the health check's, would let the process fragment well past
# what it holds; two keep it near its working set (a GLMP issue's two
# grids at their largest, decoded).
ENV MALLOC_ARENA_MAX=2
EXPOSE 8000

CMD ["python", "-m", "app.main"]
