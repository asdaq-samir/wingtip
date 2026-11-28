"""The pipeline's first two stages: collect the candidate landmarks along a
corridor (FAA data and OSM) and engineer their features."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from wingtip import airports, elevation, faa_data, geo, geo_boxes, ml_features, osm, osm_resolvers

from wingtip.config import CANDIDATES_PATH, DATA_DIR, FEATURES_PATH, corridor_paths
from .pipeline_shared import FEATURE_COLS_BASE, ROUTE_POSITION_COLS, _publish


PREFERRED_HALF_WIDTH_NM = 0.25  # "essentially on the line"
FALLBACK_HALF_WIDTH_NM = 1.0  # outer bound, fills gaps later
MARGIN_NM = 5
RIVER_FILTER = '["waterway"="river"]["intermittent"!="yes"]'
RAILROAD_FILTER = '["railway"="rail"]["service"!~".*"]'


def collect(dep_ident: str = "C81", dest_ident: str = "KDLH", out_path: Path | None = None, refresh: bool = False) -> Path:
    """Notebook 01: pull candidate checkpoints along the route corridor from
    OSM (Overpass) + FAA NASR data, filter to the corridor, dedupe, and save
    -- by default to the corridor's own candidates file. (The default used
    to be C81->KDLH's file whatever route was asked for, so collecting
    another route without naming a path wrote over that corridor's.)

    A corridor already collected is kept, not downloaded again, unless
    `refresh` says to: a training run (run()) collects first, and every retrain
    downloaded the same corridor from Overpass -- a free, shared service
    that answers 504s for minutes at a time, which is what failed the
    retrain of 2026-09-30 -- for candidates that had not moved.
    """
    out_path = out_path or corridor_paths(dep_ident, dest_ident)[0]
    if not refresh and Path(out_path).exists():
        return Path(out_path)
    dep = airports.get_airport(dep_ident)
    dest = airports.get_airport(dest_ident)
    route_distance_nm = geo.distance_nm(dep["lat"], dep["lon"], dest["lat"], dest["lon"])
    route_start = (dep["lat"], dep["lon"])
    route_end = (dest["lat"], dest["lon"])

    bbox_pad_nm = FALLBACK_HALF_WIDTH_NM + 2
    # The short way over 180 (geo_boxes): each reader splits it there.
    bbox = geo_boxes.corridor_box(route_start, route_end, bbox_pad_nm)

    raw = osm.query_overpass(bbox)
    raw_df = osm.parse_overpass_response(raw)

    river_ways = osm.query_line_features(bbox, RIVER_FILTER)
    river_df = osm_resolvers.find_line_crossings(river_ways, route_start, route_end)
    river_df["category"] = "river"

    rail_ways = osm.query_line_features(bbox, RAILROAD_FILTER)
    rail_df = osm_resolvers.find_line_crossings(rail_ways, route_start, route_end)
    rail_df["category"] = "railroad"

    highway_ways, node_coords = osm_resolvers.query_major_highways(bbox)
    intersection_df = osm_resolvers.find_intersections(highway_ways, node_coords)

    turbine_df = osm_resolvers.query_wind_turbines(bbox)
    windfarm_df = osm_resolvers.find_wind_farms(turbine_df)

    raw_df = pd.concat([raw_df, river_df, rail_df, intersection_df, windfarm_df], ignore_index=True)

    faa_cache_dir = DATA_DIR / "raw" / "faa_nasr"
    nav_csv_path, apt_csv_path, _dof_dat_path = faa_data.ensure_nasr_data(faa_cache_dir)
    vor_df = faa_data.load_vor_navaids(nav_csv_path, bbox)
    # DOF obstacles (faa_data.load_obstacles) are deliberately not
    # collected as candidates. A sectional draws every obstacle with the
    # same symbol regardless of what the structure actually is, so from
    # the chart there's nothing to distinguish one from another -- and a
    # tower is a small, easily-missed target in flight next to the things
    # pilotage actually leans on: water bodies, road intersections, wind
    # farms, towns. Keeping them only added candidates that couldn't be
    # rated consistently.
    #
    # Note this removes towers from consideration rather than teaching
    # the model to score them low -- the model will never see one. Same
    # outcome for recommendations, without spending labeling effort.
    # load_obstacles itself is untouched; notebook 08's terrain/obstacle
    # clearance still uses the DOF for altitude selection.
    # Airports from the FAA's own APT data (see
    # faa_data.load_route_airports). A runway is among the most
    # unambiguous things on a sectional, so a field in the corridor is a
    # strong checkpoint -- but only a charted one, and FAA registration
    # is what tracks with being drawn, which is why this comes from
    # APT_BASE rather than from every strip OSM or OurAirports lists. The
    # two route endpoints are excluded, being where the flight starts and
    # ends rather than marks along the way.
    airport_df = faa_data.load_route_airports(apt_csv_path, bbox, exclude_idents=(dep_ident, dest_ident))
    raw_df = pd.concat([raw_df, vor_df, airport_df], ignore_index=True)

    def add_route_distances(df):
        df = df.copy()
        # The whole corridor in one call rather than a row at a time:
        # the engine works both distances for every candidate in one
        # crossing (geo.track_distances_nm).
        cross, along = geo.track_distances_nm(df["lat"].to_numpy(), df["lon"].to_numpy(), route_start, route_end)
        df["cross_track_nm"] = cross
        df["along_track_nm"] = along
        return df

    candidates_df = add_route_distances(raw_df)
    in_corridor = (candidates_df["cross_track_nm"].abs() <= FALLBACK_HALF_WIDTH_NM) & (
        candidates_df["along_track_nm"].between(-MARGIN_NM, route_distance_nm + MARGIN_NM)
    )
    candidates_df = candidates_df[in_corridor].reset_index(drop=True)
    candidates_df["within_preferred_corridor"] = candidates_df["cross_track_nm"].abs() <= PREFERRED_HALF_WIDTH_NM
    candidates_df = candidates_df.drop_duplicates(subset=["lat", "lon"]).reset_index(drop=True)

    # Unnamed water bodies are dropped outright, whatever their size.
    # The label is a judgment made against the chart, and an unnamed lake
    # gives you nothing to make it with: at 1:500,000 the chart draws
    # water in blue with no label, so a marker on one blue shape among
    # several identical blue shapes cannot be confirmed as the right
    # shape -- which is a different failure from "hard to spot" and would
    # teach the model noise. A size floor was tried first (250,000 m2,
    # about a millimetre of chart) and still left ponds that were either
    # undrawn or unidentifiable. A charted name is the identification, so
    # named water stays regardless of size.
    is_unnamed_water = candidates_df["category"].isin(["lake_or_pond", "reservoir"]) & candidates_df["name"].isna()
    candidates_df = candidates_df[~is_unnamed_water].reset_index(drop=True)

    out_df = candidates_df.copy()
    out_df["tags"] = out_df["tags"].apply(json.dumps)
    return _publish(out_path, lambda tmp: out_df.to_csv(tmp, index=False))


def engineer_features(in_path: Path = CANDIDATES_PATH, out_path: Path = FEATURES_PATH) -> Path:
    """Notebook 02: turn raw candidates into the model's feature table."""
    df = pd.read_csv(in_path)
    df["tags"] = df["tags"].apply(json.loads)

    df["log_size"] = ml_features.log_size_feature(df["bbox_area_m2"])
    category_dummies = pd.get_dummies(df["category"], prefix="category")
    df = pd.concat([df, category_dummies], axis=1)

    candidate_points = list(zip(df["lat"], df["lon"]))
    df["elevation_prominence_m"] = elevation.elevation_prominence_m(candidate_points)
    df["name_uniqueness"] = ml_features.name_uniqueness(df["name"])
    df["nn_dist_nm"] = ml_features.nearest_neighbor_distance_nm(df["lat"], df["lon"])

    feature_cols = FEATURE_COLS_BASE + list(category_dummies.columns)
    id_cols = ["osm_id", "osm_type", "category", "name", "lat", "lon"] + ROUTE_POSITION_COLS
    out_df = df[id_cols + feature_cols].copy()

    return _publish(out_path, lambda tmp: out_df.to_parquet(tmp, index=False))
