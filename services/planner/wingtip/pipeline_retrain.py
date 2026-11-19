"""The landmark model's training: the grid search over the candidate
regressors and the retrain that writes the candidate model."""

from __future__ import annotations

import json
from pathlib import Path


from wingtip.model_registry import CANDIDATE_MODEL_DIR

from wingtip.config import FEATURES_PATH, LABELS_PATH, MIN_LABELED_ROWS
from .pipeline_shared import RANDOM_STATE, _ensure_local_dir, _publish, held_out_scores, metrics_record
from .pipeline_labels import labeled_split


def _score_current_model(X_test, y_test, feature_cols: list) -> float | None:
    """The promoted model's MAE on this run's holdout, or None when there
    is no promoted model, or it was trained on other features."""
    import joblib
    from sklearn.metrics import mean_absolute_error
    from wingtip.model_registry import CURRENT_MODEL_DIR

    model_path, metrics_path = CURRENT_MODEL_DIR / "model.joblib", CURRENT_MODEL_DIR / "metrics.json"
    if not model_path.exists() or not metrics_path.exists():
        return None
    if json.loads(metrics_path.read_text()).get("feature_cols") != feature_cols:
        return None
    try:
        return float(mean_absolute_error(y_test, joblib.load(model_path).predict(X_test)))
    except Exception:  # noqa: BLE001 -- an unreadable current model is "none to compare with"
        return None


def select_model(X_train, y_train) -> tuple[str, object, dict, float]:
    """Notebook 03's model selection: Ridge, RandomForest and
    GradientBoosting, each grid-searched on five folds of the training
    rows, and the one with the lowest cross-validated MAE refitted on all
    of them. Returns its name, the fitted model, every model's
    cross-validated MAE, and a predict-the-mean baseline's on the same
    folds. Shared by the landmark model (retrain) and the chart reader's
    (wingtip.chartmodel)."""
    from sklearn.dummy import DummyRegressor
    from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
    from sklearn.linear_model import Ridge
    from sklearn.model_selection import GridSearchCV, KFold, cross_val_score

    cv = KFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)

    param_grids = {
        "Ridge": (Ridge(random_state=RANDOM_STATE), {"alpha": [0.01, 0.1, 1.0, 10.0, 100.0]}),
        "RandomForest": (
            RandomForestRegressor(random_state=RANDOM_STATE),
            {"n_estimators": [100, 300], "max_depth": [3, 5, 10, None], "min_samples_leaf": [1, 3, 5]},
        ),
        "GradientBoosting": (
            GradientBoostingRegressor(random_state=RANDOM_STATE),
            {"n_estimators": [100, 300], "max_depth": [2, 3, 4], "learning_rate": [0.01, 0.05, 0.1]},
        ),
    }
    best_estimators, cv_mae = {}, {}
    for name, (estimator, grid) in param_grids.items():
        search = GridSearchCV(estimator, grid, cv=cv, scoring="neg_mean_absolute_error", n_jobs=-1)
        search.fit(X_train, y_train)
        best_estimators[name] = search.best_estimator_
        cv_mae[name] = -search.best_score_

    dummy_mae = -cross_val_score(DummyRegressor(strategy="mean"), X_train, y_train, cv=cv, scoring="neg_mean_absolute_error").mean()

    best_name = min(cv_mae, key=cv_mae.get)
    best_model = best_estimators[best_name]
    best_model.fit(X_train, y_train)
    return best_name, best_model, cv_mae, dummy_mae


def retrain(
    features_path: Path = FEATURES_PATH,
    labels_path: Path = LABELS_PATH,
    out_dir: Path = CANDIDATE_MODEL_DIR,
    min_labeled_rows: int = MIN_LABELED_ROWS,
) -> dict:
    """Notebook 03's model-selection logic, minus labeling and plots: compare
    Ridge/RandomForest/GradientBoosting (grid-searched) against a dummy
    baseline, refit the best on a train split, score on the held-out split,
    and save the fitted model + its held-out metrics as the "candidate".
    """
    import joblib

    split = labeled_split(features_path, labels_path, min_labeled_rows)
    feature_cols = split.feature_cols
    X_train, X_test, y_train, y_test = split.X_train, split.X_test, split.y_train, split.y_test
    best_name, best_model, cv_mae, dummy_mae = select_model(X_train, y_train)
    y_pred = best_model.predict(X_test)

    # cv_mae_by_model is the full comparison, not just the winner --
    # Ridge/GradientBoosting's own cv_mae used to be computed here and
    # thrown away the moment best_name was picked. Kept alongside
    # "cv_mae" (still the winner's score alone, still what
    # model_registry.PROMOTION_METRIC reads) rather than replacing it,
    # so the promotion gate's read path never has to change.
    # The promoted model scored on the very same holdout, now, so the
    # promotion gate compares two answers to one set of questions rather
    # than two cross-validation scores from whatever labels each run had.
    metrics = metrics_record(
        best_name,
        held_out_scores(y_test, y_pred),
        current_held_out_mae=_score_current_model(X_test, y_test, feature_cols),
        cv_mae=cv_mae[best_name],
        cv_mae_by_model={**cv_mae, "Dummy": dummy_mae},
        dummy_cv_mae=dummy_mae,
        n_labeled=len(split.labeled),
        n_train=len(X_train),
        n_test=len(X_test),
        feature_cols=feature_cols,
    )

    out_dir = _ensure_local_dir(out_dir)
    # The metrics last: promotion reads them to decide, and they name the
    # model beside them.
    _publish(out_dir / "model.joblib", lambda tmp: joblib.dump(best_model, tmp))
    _publish(out_dir / "metrics.json", lambda tmp: Path(tmp).write_text(json.dumps(metrics, indent=2)))
    return metrics
