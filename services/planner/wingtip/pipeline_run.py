"""A training run: the landmark model's stages, then the chart model's, in
order, each one's start and end written to the status file the planner
reads, one run at a time."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


from wingtip.atomic import atomic_path

from .pipeline_shared import InsufficientLabelsError
from .pipeline_labels import training_readiness
from .pipeline_collect import collect, engineer_features
from .pipeline_retrain import retrain


# The exit code of a stage that has nothing to do -- too few ratings to
# train on -- when one stage is run alone (`readiness`, `chart-retrain`):
# skipped, not failed. run() treats the same news the same way, skipping
# the stages after it in that model's branch.
SKIPPED_EXIT_CODE = 99


class _Skip(Exception):
    """A stage with nothing to do: the rest of its branch is skipped, and
    the run still ends a success."""


def _write_run_status(status: dict, path: Path) -> None:
    """The run's status file, renamed into place so the planner never
    reads half of one."""
    with atomic_path(path) as tmp:
        tmp.write_text(json.dumps(status, indent=2))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _landmark_branch() -> list:
    """The landmark model's stages, in the order the retired Airflow DAG ran
    them: whether its ratings are enough, collect, engineer features,
    retrain, evaluate, promote."""
    from wingtip import model_registry

    def landmarks_ready():
        readiness = training_readiness()
        if not readiness["ready"]:
            raise _Skip(readiness["message"])
        return readiness["message"]

    def evaluate():
        if not model_registry.evaluate():
            raise _Skip("The candidate did not beat the promoted model on the held-out ratings; the promoted model stays.")
        return "The candidate beats the promoted model."

    return [
        ("landmarks_ready", landmarks_ready),
        ("collect", lambda: str(collect())),
        ("feature_engineer", lambda: str(engineer_features())),
        ("retrain", lambda: f"cv_mae {retrain()['cv_mae']:.4f}"),
        ("evaluate", evaluate),
        ("promote", lambda: str(model_registry.promote())),
    ]


def _chart_branch() -> list:
    """The chart reader's scorer: retrain from the table the planner wrote
    when it started the run, evaluate, promote -- through the same gate
    into data/models/chart/current."""
    from wingtip import chartmodel, model_registry

    def chart_retrain():
        try:
            metrics = chartmodel.retrain()
        except InsufficientLabelsError as err:
            raise _Skip(str(err)) from err
        return f"held-out MAE {metrics.get('held_out_mae')}"

    def chart_evaluate():
        if not model_registry.evaluate(model_registry.CHART_CANDIDATE_DIR, model_registry.CHART_CURRENT_DIR):
            raise _Skip("The candidate did not beat the promoted chart model on the held-out ratings; the promoted one stays.")
        return "The candidate beats the promoted chart model."

    return [
        ("chart_retrain", chart_retrain),
        ("chart_evaluate", chart_evaluate),
        ("chart_promote", lambda: str(model_registry.promote(model_registry.CHART_CANDIDATE_DIR, model_registry.CHART_CURRENT_DIR))),
    ]


class RunGoing(RuntimeError):
    """Another training run holds the lock."""


def run(status_path: Path | None = None, branches: list | None = None) -> dict:
    """One training run, every stage in order: the landmark model's branch
    (landmarks_ready, collect, feature_engineer, retrain, evaluate,
    promote), then the chart model's (chart_retrain, chart_evaluate,
    chart_promote). What Airflow's wingtip_pipeline DAG ran, without
    Airflow: it was started by hand anyway (it had no schedule), and a
    scheduler, a web server and a metadata database to run nine functions
    in order on request was not worth keeping (the owner, 2026-11-06).

    The promotion rule is model_registry's, unchanged: a candidate goes
    live only if evaluate() says it beats the promoted model on the
    held-out ratings; otherwise promote is skipped and the promoted model
    keeps serving. A stage with nothing to do (too few ratings) skips the
    rest of its branch, and a stage that fails fails only its branch, as
    the DAG's two branches did: the run carries on to the other model and
    ends "failed" if any stage did.

    One run at a time, as the DAG's max_active_runs=1 kept it: evaluate
    reads the candidate and promote copies it later, both from one fixed
    place, so an overlapping run's retrain between the two would promote
    a model that never passed the gate. A second run does not queue: it
    raises RunGoing before touching the status file, which still belongs
    to the first (a queued run would leave the console showing the
    previous run's end while one waits).

    Each stage's start and end is written to `status_path`
    (model_registry.RUN_STATUS_PATH), which the planner reads for the
    console's Training group.
    """
    import fcntl
    import traceback

    from wingtip import model_registry

    status_path = Path(status_path or model_registry.RUN_STATUS_PATH)
    branches = branches if branches is not None else [_landmark_branch(), _chart_branch()]
    status = {
        "run_id": datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"),
        "state": "running",
        "stage": None,
        "started_at": _now(),
        "finished_at": None,
        "error": None,
        "stages": [{"name": name, "state": "pending", "detail": None} for branch in branches for name, _ in branch],
    }
    by_name = {stage["name"]: stage for stage in status["stages"]}
    status_path.parent.mkdir(parents=True, exist_ok=True)
    with open(status_path.with_name(f".{status_path.name}.lock"), "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as err:
            raise RunGoing("A training run is going already.") from err
        for branch in branches:
            skipping = None
            for name, stage_fn in branch:
                stage = by_name[name]
                if skipping:
                    stage.update(state="skipped", detail=skipping)
                    continue
                stage["state"], status["stage"] = "running", name
                _write_run_status(status, status_path)
                print(f"[{name}] started", flush=True)
                try:
                    stage.update(state="success", detail=stage_fn())
                except _Skip as skip:
                    stage.update(state="skipped", detail=str(skip))
                    skipping = f"Skipped: {skip}"
                except Exception as err:  # noqa: BLE001 -- reported, and the other branch still runs
                    traceback.print_exc()
                    message = f"{type(err).__name__}: {err}"[:400]
                    stage.update(state="failed", detail=message)
                    status["error"] = status["error"] or f"{name}: {message}"
                    skipping = f"Skipped: {name} failed"
                print(f"[{name}] {stage['state']}: {stage['detail']}", flush=True)
        status.update(state="failed" if status["error"] else "success", stage=None, finished_at=_now())
        _write_run_status(status, status_path)
    return status
