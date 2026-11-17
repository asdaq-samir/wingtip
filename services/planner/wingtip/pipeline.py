"""Callable, non-interactive versions of the notebook 01->02->03 sequence:
collect, engineer_features, retrain. (evaluate/promote moved to
wingtip.model_registry -- see that module's docstring for why.) run() is
the whole training run, every stage in order, which the developer
console's Retrain starts (`python -m wingtip.pipeline run`, in the
retrain job's image, services/jobs/retrain). The notebooks stay the human-facing/
exploratory versions of this same logic (plots, the folium map, the
interactive hand-labeling cell); this module is the automatable subset --
everything except labeling itself, which is still a human judgment call.

The stages are one module each (pipeline_collect, pipeline_labels,
pipeline_retrain, pipeline_run, and pipeline_shared for what they share);
this one is the command line over them, and the name the notebooks import
them by. scikit-learn/joblib are imported lazily, inside retrain() only,
rather than at module level: the planner imports pipeline_shared (app.
chart_model, for _publish) and loads scikit-learn only when it first scores.
"""

from __future__ import annotations

import json
from pathlib import Path

from wingtip.config import (  # noqa: F401  (re-exported: callers import these from here)
    CANDIDATES_PATH,
    DATA_DIR,
    FEATURES_PATH,
    LABELS_PATH,
    MIN_LABELED_ROWS,
    PROJECT_ROOT,
    corridor_paths,
)
from wingtip.model_registry import CANDIDATE_MODEL_DIR

# The stages, re-exported: the notebooks and the training run ask for them here.
from .pipeline_collect import collect, engineer_features
from .pipeline_labels import holdout_split, labeled_split, training_readiness  # noqa: F401
from .pipeline_retrain import retrain
from .pipeline_run import SKIPPED_EXIT_CODE, RunGoing, run
from .pipeline_shared import FEATURE_COLS_BASE, InsufficientLabelsError  # noqa: F401


def _cli() -> None:
    """Run the whole training run (`docker compose up retrain`)
    or one stage standalone, e.g. `docker compose run --rm retrain retrain`
    or `docker compose run --rm retrain collect`.

    One stage per invocation, paths as arguments with the local defaults,
    the result printed to stdout: the pipeline independent of any
    orchestrator.
    """
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="stage", required=True)

    # The paths default to the corridor the idents name.
    p = sub.add_parser("collect")
    p.add_argument("--dep-ident", default="C81")
    p.add_argument("--dest-ident", default="KDLH")
    p.add_argument("--out-path", type=Path)
    p.add_argument("--refresh", action="store_true", help="download the corridor again, though it has been collected")

    p = sub.add_parser("engineer-features")
    p.add_argument("--dep-ident", default="C81")
    p.add_argument("--dest-ident", default="KDLH")
    p.add_argument("--in-path", type=Path)
    p.add_argument("--out-path", type=Path)

    p = sub.add_parser("retrain")
    p.add_argument("--features-path", type=Path, default=FEATURES_PATH)
    p.add_argument("--labels-path", type=Path, default=LABELS_PATH)
    p.add_argument("--out-dir", type=Path, default=CANDIDATE_MODEL_DIR)
    p.add_argument("--min-labeled-rows", type=int, default=MIN_LABELED_ROWS)

    # Whether retrain has enough ratings, before collect and the
    # elevation lookups are spent on a run that cannot train:
    # SKIPPED_EXIT_CODE when not.
    sub.add_parser("readiness")

    # The chart reader's scorer (wingtip.chartmodel), from the table the
    # planner writes; SKIPPED_EXIT_CODE with too few ratings in it.
    sub.add_parser("chart-retrain")

    # Every stage in order, both models (run()); exits 1 if any failed.
    sub.add_parser("run")

    args = parser.parse_args()
    kwargs = {k: v for k, v in vars(args).items() if k != "stage"}

    if args.stage == "run":
        try:
            result = run()
        except RunGoing as err:
            print(err)
            raise SystemExit(2) from err
        print(json.dumps(result, indent=2))
        raise SystemExit(1 if result["state"] == "failed" else 0)
    if args.stage == "collect":
        result = collect(**kwargs)
    elif args.stage == "engineer-features":
        candidates, features = corridor_paths(args.dep_ident, args.dest_ident)
        result = engineer_features(in_path=args.in_path or candidates, out_path=args.out_path or features)
    elif args.stage == "retrain":
        result = retrain(**kwargs)
    elif args.stage == "readiness":
        readiness = training_readiness()
        if not readiness["ready"]:
            print(readiness["message"])
            raise SystemExit(SKIPPED_EXIT_CODE)
        result = readiness["message"]
    elif args.stage == "chart-retrain":
        from wingtip import chartmodel

        try:
            result = chartmodel.retrain()
        except InsufficientLabelsError as err:
            print(err)
            raise SystemExit(SKIPPED_EXIT_CODE) from err

    print(result)


if __name__ == "__main__":
    _cli()
