"""The FAA's airports and VOR navaids as the route's candidates: operational
fields out of NASR's APT_BASE and VOR/VOR-DME/VORTAC navaids out of
NAV_BASE, within a box, in the shared candidate schema. wingtip.faa_data
downloads the files and the pipeline reads these from the paths it gives."""

from pathlib import Path

import numpy as np
import pandas as pd

from . import field_status, geo_boxes
from .faa_apt_base import _read_apt_base_cached
from .single_flight import once


VOR_NAV_TYPES = {"VOR", "VOR/DME", "VORTAC"}


# Facility types the sectional draws as a landable airport. A heliport is
# a rooftop-sized target, a balloonport/ultralight strip is not charted as
# an airport at all, and a seaplane base is an anchor symbol on a lake
# that is already a candidate on its own.
CHARTED_FACILITY_TYPES = {"AIRPORT"}


def load_route_airports(apt_csv_path, bbox: tuple, exclude_idents: tuple = ()) -> pd.DataFrame:
    """Operational airports from the NASR APT_BASE.csv extract, within
    bbox, in the shared candidate schema.

    FAA rather than OSM or OurAirports for the same reason
    load_vor_navaids is: the FAA is the authority on its own airport
    data. Here that authority is the filter itself -- being listed in
    APT_BASE at all is what tracks with being drawn on the sectional.
    OurAirports was tried first and its "small_airport" type pulled in
    unregistered private strips; checking Barker Strip (35WI) and Rox
    (WS09) against the chart tile found nothing drawn at their
    coordinates, and neither appears in APT_BASE. A candidate the chart
    does not draw cannot be rated, which is why towers, water towers,
    quarries and unnamed lakes were dropped too.

    Private-use fields are kept but are not all on the chart: the Chart
    User's Guide charts one (the circled magenta "R", as at Wag-Aero,
    WI92) only where it has emergency or landmark value, so the planner's
    checkpoints score one down unless a chart pick confirms it (app.
    checkpoint_scoring PRIVATE_UNCHARTED_SCORE); the 1-5 rating says the rest.

    exclude_idents drops the departure and destination fields -- both sit
    in the corridor by construction, and neither is a checkpoint: you are
    taking off from one and landing at the other.
    """
    fields, lat, lon, ident, icao = _charted_open_airports(str(apt_csv_path), Path(apt_csv_path).stat().st_mtime)
    # The box read as its one or two halves either side of 180 (geo_boxes).
    inside = geo_boxes.in_box(bbox, lat, lon)

    excluded = {i.strip().upper() for i in exclude_idents}
    if excluded:
        at = np.flatnonzero(inside)
        inside[at[[a in excluded or c in excluded for a, c in zip(ident[at], icao[at])]]] = False

    found = fields[inside].reset_index(drop=True)
    # Each its own tags, as when they were made for each call: a caller
    # may add to a candidate's.
    return found.assign(tags=[dict(t) for t in found["tags"]])


@once(maxsize=2)
def _charted_open_airports(path: str, _mtime: float) -> tuple:
    """APT_BASE's charted, open fields as load_route_airports gives them,
    with their positions and upper-cased identifiers to pick them by, once
    per file version as the table itself is (`_read_apt_base`): made again
    on every route's checkpoints -- the type mapped, matched and the
    status compared over all 19,400 rows, two columns turned to numbers
    and each name title-cased -- it was a second of the planner's time
    each call while other threads held the interpreter, where only the box
    and the route's own two fields are the route's (py-spy on the live
    planner, 2026-10-28)."""
    df = _read_apt_base_cached(path, _mtime)
    df = df[df["SITE_TYPE_CODE"].map(_SITE_TYPE_NAMES).isin(CHARTED_FACILITY_TYPES) & field_status.open_mask(df["ARPT_STATUS"].fillna(""))]
    lat = df["LAT_DECIMAL"].astype(float)
    lon = df["LONG_DECIMAL"].astype(float)
    fields = pd.DataFrame(
        {
            "osm_id": df["ARPT_ID"],
            "osm_type": "faa_airport",
            "category": "airport",
            # The chart labels a field by name and identifier, so the
            # candidate carries both -- that is what you read off it.
            "name": df["ARPT_NAME"].str.title() + " (" + df["ARPT_ID"] + ")",
            "lat": lat,
            "lon": lon,
            "bbox_area_m2": 0.0,
            "tags": [
                {"arpt_id": a, "city": c if isinstance(c, str) else "", "use": u}
                for a, c, u in zip(df["ARPT_ID"], df["CITY"], df["FACILITY_USE_CODE"])
            ],
        }
    )
    return (
        fields,
        lat.to_numpy(),
        lon.to_numpy(),
        df["ARPT_ID"].str.upper().to_numpy(dtype=object),
        df["ICAO_ID"].fillna("").str.upper().to_numpy(dtype=object),
    )


# APT_BASE encodes the facility type as a single letter.
_SITE_TYPE_NAMES = {"A": "AIRPORT", "B": "BALLOONPORT", "C": "SEAPLANE BASE", "G": "GLIDERPORT", "H": "HELIPORT", "U": "ULTRALIGHT"}


def _in_bbox(lat: pd.Series, lon: pd.Series, bbox: tuple) -> np.ndarray:
    """The box read as its one or two halves either side of 180 (geo_boxes)."""
    return geo_boxes.in_box(bbox, lat.to_numpy(dtype=float), lon.to_numpy(dtype=float))


@once(maxsize=4)
def _read_nav_base_cached(path: str, _mtime: float) -> pd.DataFrame:
    return pd.read_csv(path, dtype=str)


def _read_nav_base(nav_csv_path) -> pd.DataFrame:
    return _read_nav_base_cached(str(nav_csv_path), Path(nav_csv_path).stat().st_mtime)


def load_vor_navaids(nav_csv_path, bbox: tuple) -> pd.DataFrame:
    """VOR/VOR-DME/VORTAC navaids from the NASR NAV_BASE.csv extract,
    within bbox and currently operational. Replaces the old OSM
    navigationaid-tag-based approach -- the FAA is definitionally the
    authority on its own navaid network.

    Same once-per-file-version read as this file's own airport table
    (`_read_apt_base`) -- collecting more than one route in the
    same process used to re-read and re-parse this national file from
    scratch every time.
    """
    df = _read_nav_base(nav_csv_path)
    df = df[df["NAV_TYPE"].isin(VOR_NAV_TYPES) & df["NAV_STATUS"].str.startswith("OPERATIONAL")]
    df["lat"] = df["LAT_DECIMAL"].astype(float)
    df["lon"] = df["LONG_DECIMAL"].astype(float)
    df = df[_in_bbox(df["lat"], df["lon"], bbox)]
    return pd.DataFrame(
        {
            "osm_id": df["NAV_ID"],
            "osm_type": "faa_navaid",
            "category": "vor",
            "name": df["NAME"] + " " + df["NAV_TYPE"],
            "lat": df["lat"],
            "lon": df["lon"],
            "bbox_area_m2": 0.0,
            "tags": [{"nav_type": t, "nav_id": i} for t, i in zip(df["NAV_TYPE"], df["NAV_ID"])],
        }
    ).reset_index(drop=True)
