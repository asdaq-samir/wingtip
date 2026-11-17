"""The pipeline's labelled table: the owner's ratings and the chart picks
joined to the candidates' features, the fixed held-out split, and whether
there are enough ratings to train on."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from wingtip import geo

from wingtip.config import FEATURES_PATH, LABELS_PATH, MIN_LABELED_ROWS
from .pipeline_shared import FEATURE_COLS_BASE, InsufficientLabelsError


def _route_of(features_path: Path) -> str | None:
    """ "C81->KDLH" from features_c81_kdlh.parquet -- the route key a chart
    pick carries -- or None for a file not named that way."""
    stem = Path(features_path).stem
    if not stem.startswith("features_") or stem.count("_") != 2:
        return None
    _, dep, dest = stem.split("_")
    return f"{dep.upper()}->{dest.upper()}"


def _match_picks(candidates_df: pd.DataFrame, route: str | None, picks_path: Path) -> tuple[list[dict], dict]:
    """The route's chart picks against the corridor's OSM candidates: each
    rated pick (1-5) claims the nearest candidate within SAME_PLACE_NM.
    Returns the labels that make, and why the rest do not: how many picks
    were rated at all, how many 0 (a 0 rejects a detection, which says
    nothing about a landmark), how many 1-5 had no candidate that close,
    and how many landed on a candidate a later pick also rated."""
    from wingtip import chartlabels, routecsv

    counts = {"rated": 0, "zeros": 0, "off_landmark": 0, "same_landmark": 0}
    rows: list[dict] = []
    if route is None:
        return rows, counts
    for pick in chartlabels.load_picks(route, path=picks_path):
        if pick.get("rating") is None:
            continue
        counts["rated"] += 1
        if not pick["rating"]:
            counts["zeros"] += 1
            continue
        gaps = pd.Series(
            geo.distance_nm(candidates_df["lat"].to_numpy(), candidates_df["lon"].to_numpy(), pick["lat"], pick["lon"]),
            index=candidates_df.index,
        )
        if gaps.empty or gaps.min() >= routecsv.SAME_PLACE_NM:
            counts["off_landmark"] += 1
            continue
        nearest = candidates_df.loc[gaps.idxmin()]
        rows.append({"osm_id": str(nearest["osm_id"]), "osm_type": nearest["osm_type"], "rating": int(pick["rating"])})
    distinct = {(r["osm_id"], r["osm_type"]) for r in rows}
    counts["same_landmark"] = len(rows) - len(distinct)
    return rows, counts


def _picks_as_labels(candidates_df: pd.DataFrame, route: str | None, picks_path: Path) -> pd.DataFrame:
    """The training workspace's chart picks as OSM-candidate labels (see
    _match_picks).

    Without this the labeling workspace fed nothing: training read only
    the older ratings file, so Retrain after a labeling session retrained
    on what it already had.
    """
    rows, _ = _match_picks(candidates_df, route, picks_path)
    # One label per candidate: the latest pick, as the file orders them.
    return pd.DataFrame(rows, columns=["osm_id", "osm_type", "rating"]).drop_duplicates(["osm_id", "osm_type"], keep="last")


def _load_labeled(features_path: Path, labels_path: Path, picks_path: Path | None = None) -> tuple[pd.DataFrame, list[str]]:
    """The candidates with a rating: the older ratings file, and the chart
    picks made in the training workspace on top of it -- a pick is the
    newer judgment, so it wins where both rate one candidate."""
    from wingtip.chartlabels import CHART_PICKS_PATH

    candidates_df = pd.read_parquet(features_path)
    labels_df = pd.read_csv(labels_path)
    # osm_id round-trips as str through the candidates CSV/parquet but as
    # int64 through a freshly-read labels CSV (plain numeric column) --
    # normalize both to str so the merge key types actually match.
    candidates_df["osm_id"] = candidates_df["osm_id"].astype(str)
    labels_df["osm_id"] = labels_df["osm_id"].astype(str)
    picks_df = _picks_as_labels(candidates_df, _route_of(features_path), picks_path or CHART_PICKS_PATH)
    ratings = pd.concat([labels_df[["osm_id", "osm_type", "rating"]], picks_df], ignore_index=True)
    ratings = ratings.drop_duplicates(["osm_id", "osm_type"], keep="last")
    labeled_df = candidates_df.merge(ratings, on=["osm_id", "osm_type"])
    category_cols = [c for c in candidates_df.columns if c.startswith("category_")]
    feature_cols = FEATURE_COLS_BASE + category_cols
    return labeled_df, feature_cols


def holdout_split(labeled_df: pd.DataFrame) -> pd.Series:
    """True for the rows every trainer holds out. Fixed by each
    candidate's own id rather than drawn at random, so the holdout is the
    same set of landmarks from one run to the next -- the only way a new
    model and the promoted one can be scored on the same questions when
    labels are added between runs. About a fifth of them."""
    import zlib

    return labeled_df.apply(lambda r: zlib.crc32(f"{r['osm_type']}/{r['osm_id']}".encode()) % 5 == 0, axis=1)


@dataclass(frozen=True)
class LabeledSplit:
    """The labelled candidates and the one holdout every trainer scores on.

    One place builds it -- the name_uniqueness fill, the rating as float,
    the split -- so retrain() and the notebooks score on the same
    landmarks. `labeled` is the whole table, for the notebooks; `held_out`
    marks holdout_split's rows."""

    labeled: pd.DataFrame
    held_out: pd.Series
    feature_cols: list

    @property
    def train(self) -> pd.DataFrame:
        return self.labeled[~self.held_out]

    @property
    def test(self) -> pd.DataFrame:
        return self.labeled[self.held_out]

    @property
    def X_train(self) -> pd.DataFrame:
        return self.train[self.feature_cols]

    @property
    def X_test(self) -> pd.DataFrame:
        return self.test[self.feature_cols]

    @property
    def y_train(self) -> pd.Series:
        return self.train["rating"].astype(float)

    @property
    def y_test(self) -> pd.Series:
        return self.test["rating"].astype(float)


def training_readiness(
    features_path: Path = FEATURES_PATH,
    labels_path: Path = LABELS_PATH,
    picks_path: Path | None = None,
    min_labeled_rows: int = MIN_LABELED_ROWS,
) -> dict:
    """Whether a retrain would have enough to learn from, and why not:
    what the trainer would get (`usable`), what it needs, and what became
    of the ratings that do not count. Asked before a run is started, so
    the developer is told in the console rather than by a run failing
    minutes later; and by labeled_split, whose refusal says the
    same. Reads the corridor's candidates as last engineered: the run
    collects them again first, so this is the count as it stands now."""
    from wingtip.chartlabels import CHART_PICKS_PATH

    route = _route_of(features_path)
    if not Path(features_path).exists():
        return {
            "route": route,
            "usable": 0,
            "needed": min_labeled_rows,
            "ready": False,
            "rated": 0,
            "zeros": 0,
            "off_landmark": 0,
            "same_landmark": 0,
            "older": 0,
            "message": f"No landmarks collected for {route or 'the route'} yet: collect the route first.",
        }
    labeled_df, _ = _load_labeled(features_path, labels_path, picks_path)
    candidates_df = pd.read_parquet(features_path)
    candidates_df["osm_id"] = candidates_df["osm_id"].astype(str)
    _, counts = _match_picks(candidates_df, route, picks_path or CHART_PICKS_PATH)
    labels_df = pd.read_csv(labels_path)
    usable = len(labeled_df)
    ready = usable >= min_labeled_rows
    lost = []
    if counts["zeros"]:
        lost.append(f"{counts['zeros']} rated 0, which says the detection is no feature, not how findable a landmark is")
    if counts["off_landmark"]:
        lost.append(f"{counts['off_landmark']} with no landmark the model knows within 0.2 nm")
    if counts["same_landmark"]:
        lost.append(f"{counts['same_landmark']} on a landmark already rated")
    message = (
        f"{usable} of the {min_labeled_rows} ratings training needs."
        + (f" Of your {counts['rated']}: " + "; ".join(lost) + "." if lost else "")
        + ("" if ready else f" Rate {min_labeled_rows - usable} more on landmarks the model knows.")
    )
    return {
        "route": route,
        "usable": usable,
        "needed": min_labeled_rows,
        "ready": ready,
        **counts,
        "older": int(len(labels_df)),
        "message": message,
    }


def labeled_split(features_path: Path, labels_path: Path, min_labeled_rows: int = MIN_LABELED_ROWS) -> LabeledSplit:
    """Every trainer's labelled data, checked and split one way. Raises
    InsufficientLabelsError below `min_labeled_rows`, saying why the
    ratings fall short (training_readiness)."""
    labeled_df, feature_cols = _load_labeled(features_path, labels_path)
    if len(labeled_df) < min_labeled_rows:
        raise InsufficientLabelsError(training_readiness(features_path, labels_path, min_labeled_rows=min_labeled_rows)["message"])
    labeled = labeled_df.fillna({"name_uniqueness": 0.0})
    return LabeledSplit(labeled, holdout_split(labeled), feature_cols)
