# syntax=docker/dockerfile:1

# The retrain job (services/jobs/retrain): the training run,
# `python -m wingtip.pipeline run` -- the chart model retrained, evaluated
# and promoted only if it beats the one serving, and the landmark model
# where the ratings are enough -- and each stage on its own
# (`collect`, `engineer-features`, `retrain`, ...). One image for every
# stage: the processing image beside it (collect and engineer-features
# without scikit-learn, shaped for a SageMaker Processing Job) went with
# the jobs split (#535), as nothing ran it but this run. The training
# run itself replaced an Airflow DAG (2026-11-06).

# wingtip's base (services/Dockerfile.base): Python, wingtip's own
# requirements, its Rust extension and the appuser, built once for every
# image that imports wingtip. The build context `wingtip-base` names it.
FROM wingtip-base

WORKDIR /workspace

# Copied at the paths they have in the repo, so the job's list finds
# wingtip's own through its -r ../../planner/requirements-wingtip.txt.
COPY services/planner/requirements-wingtip.txt services/planner/
COPY services/jobs/retrain/requirements.txt services/jobs/retrain/
RUN --mount=type=cache,target=/root/.cache/pip pip install -r services/jobs/retrain/requirements.txt

COPY services/planner/wingtip ./services/planner/wingtip

USER appuser

ENV PYTHONPATH=/workspace/services/planner
# The build fails here if a package this image's code imports is
# missing, rather than the container on its next start: on 2026-09-22 a
# new import in wingtip left both agents and both pipeline stages unable to
# start, and every build passed. The lazy imports are named too, as
# importing the entry module does not reach them.
RUN python -B -c "import wingtip.pipeline, wingtip.model_registry, sklearn.ensemble, sklearn.linear_model, sklearn.model_selection, sklearn.dummy, sklearn.metrics, joblib, shapely.ops, pyarrow.parquet"
ENTRYPOINT ["python3", "-m", "wingtip.pipeline"]
# The whole training run by default, which the developer console's
# Retrain starts (compose's `retrain`); a stage by name runs that stage.
CMD ["run"]
