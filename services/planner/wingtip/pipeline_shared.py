"""What the training pipeline's stages share: the model's feature columns,
the error for too few ratings, and the writers and scores every trainer
uses (the landmark model here and the chart model, wingtip.chartmodel)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path


from wingtip.atomic import atomic_path
from wingtip.model_registry import _reject_remote_uri


RANDOM_STATE = 42


# Properties of the landmark itself -- deliberately nothing about where it
# sits on the route.
#
# cross_track_nm, along_track_nm and within_preferred_corridor used to be
# in here and were removed 2026-09-10. They are corridor *filtering*
# inputs, and every candidate that survives collect() is already inside
# the corridor, so their leftover variance is just position along one
# route. The model was leaning on it hard: with all 206 labels, 25-fold
# repeated CV put the dummy-mean baseline at 1.1130 MAE, the full model
# at 0.9232 -- and a model given *only* those three position features at
# 0.9653, recovering 78% of the full model's gain over the baseline while
# knowing nothing whatever about the landmark. The C81->KDLH corridor
# runs from southern Wisconsin farmland into northern forest and lake
# country, so along-track distance was proxying for terrain type, which
# cannot transfer to a different route. Dropping them measured at 0.0165
# MAE against a paired std of 0.0587 -- indistinguishable from zero.
#
# They stay in the features parquet as identity/display columns (see
# engineer_features) because the serving API orders checkpoints by
# along-track distance; they are just not fed to the model.
FEATURE_COLS_BASE = ["log_size", "elevation_prominence_m", "name_uniqueness", "nn_dist_nm"]

# Carried through to the parquet for display and ordering, not as model
# inputs.
ROUTE_POSITION_COLS = ["cross_track_nm", "along_track_nm", "within_preferred_corridor"]


class InsufficientLabelsError(RuntimeError):
    """Raised by retrain() when fewer than min_labeled_rows candidates are
    labeled -- a train/test split and 5-fold CV aren't meaningful below
    that, so this fails loudly instead of letting scikit-learn raise an
    opaque stratify/fold-count error."""


def _ensure_local_output_dir(path) -> Path:
    """For a file path: ensure its parent directory exists locally."""
    _reject_remote_uri(path)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _publish(out_path, write) -> Path:
    """Writes `out_path` through `write(temp_path)` beside it, then renames
    it into place, so a reader sees the old file or the new one and never
    part of one.

    Every reader takes "the file exists" to mean "the corridor is built":
    the trainers read it, the Dev console lists it. A write cut short -- a full disk, a task
    killed part-way -- used to leave a torn file that read as built until
    someone deleted it by hand; now it leaves the previous file
    (wingtip.atomic, whose temp name no reader's glob picks up and no
    other of the three containers writing this directory shares).
    """
    out_path = _ensure_local_output_dir(out_path)
    with atomic_path(out_path) as tmp:
        write(tmp)
    return out_path


def held_out_scores(y_test, y_pred) -> dict:
    """The three numbers every trainer reports for its held-out split.

    sklearn is imported here rather than at the top for the same reason
    the trainers do it: importing this module must not drag in the
    training stack for a caller that only wants a route planned.
    """
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

    return {
        "held_out_mae": mean_absolute_error(y_test, y_pred),
        "held_out_rmse": mean_squared_error(y_test, y_pred) ** 0.5,
        "held_out_r2": r2_score(y_test, y_pred),
    }


def metrics_record(model_type: str, scores: dict, *, n_labeled: int, n_train: int, n_test: int, feature_cols: list, **extra) -> dict:
    """metrics.json, the same shape whichever library did the training.

    Two trainers write this file -- retrain() below and the chart model
    (wingtip.chartmodel) -- and `model_registry`'s promotion gate and the
    developer console both read it by key, so one shape keeps either
    from reporting something the registry cannot compare. `extra` is
    whatever that trainer has and the other does not, such as a
    cross-validation score.
    """
    return {
        "model_type": model_type,
        **extra,
        **scores,
        "n_labeled": n_labeled,
        "n_train": n_train,
        "n_test": n_test,
        "feature_cols": feature_cols,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }


def _ensure_local_dir(path) -> Path:
    """For a directory path (e.g. retrain's out_dir, which files get
    written *into*): ensure it exists locally, as itself, not its parent.
    """
    _reject_remote_uri(path)
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    return path
