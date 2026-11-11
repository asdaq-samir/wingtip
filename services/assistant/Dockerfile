# syntax=docker/dockerfile:1

# wingtip's base (services/Dockerfile.base): Python and the appuser, as
# every Python image here is built. The assistant imports nothing of
# wingtip itself -- every figure it states is the planner's, over HTTP
# (app.generated.planner_client) -- so its own few packages go on top and its code beside
# them. The build context `wingtip-base` names the base.
FROM wingtip-base

WORKDIR /workspace/services/assistant

COPY services/assistant/requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt

COPY services/assistant/app ./app

# The data folder is the user's: the stacks mount theirs over it, where
# the regulations and the AIM are kept once fetched (app.references).
RUN mkdir -p /workspace/data && chown appuser:appuser /workspace/data

USER appuser

ENV PYTHONPATH=/workspace/services/assistant DATA_DIR=/workspace/data
# The build fails here if a package this image's code imports is missing,
# rather than the container on its next start.
RUN python -B -c "import app.main, anthropic"
# glibc's default of one malloc arena per thread grows a threaded server
# well past what it uses; the planner's image says why (MALLOC_ARENA_MAX).
ENV MALLOC_ARENA_MAX=2
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
