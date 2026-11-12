# syntax=docker/dockerfile:1

# The crash-leads job (services/jobs/crash): stages 1 to 3 of the Studio's
# crash films (docs/STUDIO-PIPELINE.md) -- the FAA's statements and
# notices read into leads, each lead's identity checked by the engine
# against the FAA's registry and an ADS-B track, and a kit made for each
# confirmed one, into the shared store the planner serves. `python -m
# crash` is the entry point; `every` (the compose service's command) is
# its own schedule, a run each half hour.
#
# No browser: the FAA's preliminary notices' CSV refuses a scripted
# request and a headless Chromium's alike (403), so Chromium's 400 MB
# would buy nothing. The notices come in as files a person saves
# (crash/notices.py).

# wingtip's base (services/Dockerfile.base): Python, wingtip's own
# requirements, its Rust extension and the appuser, built once for every
# image that imports wingtip. The build context `wingtip-base` names it.
FROM wingtip-base

WORKDIR /workspace/services/jobs

# Copied at the paths they have in the repo, so the job's list finds
# wingtip's own through its -r.
COPY services/planner/requirements-wingtip.txt /workspace/services/planner/
COPY services/jobs/crash/requirements.txt crash/
RUN --mount=type=cache,target=/root/.cache/pip pip install -r crash/requirements.txt

COPY services/planner/wingtip /workspace/services/planner/wingtip
COPY services/jobs/crash ./crash

USER appuser

ENV PYTHONPATH=/workspace/services/jobs:/workspace/services/planner
# The build fails here if a package the job imports is missing, rather
# than the job on its next run.
RUN python -B -c "import crash.cli, bs4, tzfpy, us, wingtip_native, zoneinfo; zoneinfo.ZoneInfo('America/Chicago')"
ENTRYPOINT ["python", "-m", "crash"]
CMD ["poll"]
