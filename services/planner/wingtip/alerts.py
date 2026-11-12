"""What lies ahead of the airplane in the air, from its own position: the
data the engine's `alerts_ahead` (engine/crates/airspace/src/ahead.rs)
reads -- the FAA's Class B, C and D, its special-use airspace, the TFRs,
the ground under the next minute's track and the FAA's Digital Obstacle
File near it -- read here and passed in. What is ahead, how soon, how
near and what it takes to enter are the engine's, the same rules the
phones work out from their packs when the planner cannot be reached.

Advisory only, from a phone's GPS and the FAA's published data: it is
not a terrain awareness and warning system (TSO-C151) or a substitute
for the chart, the pilot's own planning (14 CFR 91.103) or looking
outside.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import requests
from shapely.geometry import box as envelope

from . import airports, airspace, elevation, faa_data, saa, sua, terrain, tfr
from .engine import ask as engine
from .units import M_TO_FT


def _polygons(geometry) -> list:
    """A shapely polygon or multipolygon as the engine reads it: each
    polygon its outline and holes, each ring [[lon, lat], ...]."""
    parts = getattr(geometry, "geoms", [geometry])
    return [
        [[[float(x), float(y)] for x, y in ring.coords] for ring in (part.exterior, *part.interiors)]
        for part in parts
        if hasattr(part, "exterior")
    ]


def _ground_ft(lat: float, lon: float) -> float | None:
    try:
        return elevation.ground_m(lat, lon) * M_TO_FT
    except (requests.RequestException, OSError, ValueError):
        return None


def _ground_under(geometry, refs: tuple) -> float | None:
    """The ground at a point within an area with an AGL floor or ceiling,
    for the engine to set its heights over: the airplane's own ground is
    miles from a ridge or valley the area may lie over. None where the
    area has no AGL height or the ground cannot be read (the engine then
    takes the airplane's)."""
    # The FAA's special use airspace data codes a height above the ground
    # SFC with its figure (Brady Low MOA's 500 FT SFC), which the engine
    # reads as AGL (its sua_tab::limit), so SFC wants the ground too.
    if "AGL" not in refs and "SFC" not in refs:
        return None
    point = geometry.representative_point()
    return _ground_ft(point.y, point.x)


def _unix(when: str | None) -> float | None:
    return datetime.fromisoformat(when.replace("Z", "+00:00")).timestamp() if when else None


def _volumes(shp_path, box: tuple) -> list:
    return [
        {
            "name": v["name"],
            "class": v["class"],
            "floor_ft": v["floor_ft_msl"],
            "ceiling_ft": v["ceiling_ft_msl"],
            "polygons": _polygons(v["geometry"]),
        }
        for v in airspace.load_controlled_airspace(shp_path, box)
        if v["class"] in ("B", "C", "D")
    ]


def _special_use(box: tuple) -> list | None:
    try:
        found = sua.areas_in(box)
    except sua.SpecialUseUnavailable:
        return None
    return [
        {
            "name": area["name"],
            "type": area["type"],
            "floor_ft": area["floor_ft"],
            "floor_ref": area["floor_ref"],
            "ceiling_ft": area["ceiling_ft"],
            "ceiling_ref": area["ceiling_ref"],
            # "To but not including" and "above but not including", which
            # the engine reads a foot inside the figure.
            "floor_desc": area.get("floor_desc"),
            "ceiling_desc": area.get("ceiling_desc"),
            "times_of_use": area["times_of_use"],
            "ground_ft": _ground_under(geometry, (area["floor_ref"], area["ceiling_ref"])),
            "polygons": _polygons(geometry),
        }
        for area, geometry in found
    ]


def _tfrs(box: tuple) -> list | None:
    """The TFRs whose areas reach `box` (south, west, north, east), the
    box round the look-ahead's track: the engine's alerts_ahead finds one
    only where the track goes into it (ahead.rs, tfr_alerts), so one
    further off gives none, and its ground is not read. Their shapes are
    parsed once a copy of the list (wingtip.tfr.with_shapes)."""
    south, west, north, east = box
    try:
        found = tfr.with_shapes(envelope(west, south, east, north))
    except tfr.TfrUnavailable:
        return None
    out = []
    for restriction, geometry in found:
        out.append(
            {
                "notam_id": restriction["notam_id"],
                "title": restriction.get("title"),
                "rule": restriction.get("rule"),
                "floor_ft": restriction.get("floor_ft"),
                "floor_ref": restriction.get("floor_ref"),
                "ceiling_ft": restriction.get("ceiling_ft"),
                "ceiling_ref": restriction.get("ceiling_ref"),
                "effective": _unix(restriction.get("effective")),
                "expires": _unix(restriction.get("expires")),
                "ground_ft": _ground_under(geometry, (restriction.get("floor_ref"), restriction.get("ceiling_ref"))),
                "polygons": _polygons(geometry),
            }
        )
    return out


def _swath_ground(frame: dict) -> list | None:
    """The ground at the swath's points (the engine's `ahead_frame`), feet;
    None where the terrain tiles cannot be read."""
    try:
        return [
            [elevation.ground_m(lat, lon) * M_TO_FT for lat, lon in zip(lats, lons)] for lats, lons in zip(frame["lats"], frame["lons"])
        ]
    except (requests.RequestException, OSError, ValueError):
        return None


def _obstacles(box: tuple, faa_cache_dir) -> list | None:
    """The FAA's Digital Obstacle File in the box, every height (the
    engine keeps those near the track)."""
    try:
        found = faa_data.load_obstacles(faa_data.ensure_nasr_file("DOF.DAT", faa_cache_dir), box, min_agl_ft=0)
    except (requests.RequestException, OSError, ValueError):
        return None
    return [
        {"lat": float(r.lat), "lon": float(r.lon), "amsl_ft": float(r.amsl_ft), "type": r.type or ""} for r in found.itertuples(index=False)
    ]


def _near_field(lat: float, lon: float) -> dict | None:
    """The nearest landing field, for the engine's takeoff-or-landing test
    (91.119's "except when necessary for takeoff or landing")."""
    try:
        nearest = airports.nearest(lat, lon, limit=1)
    except (OSError, ValueError):
        return None
    return {"distance_nm": nearest[0]["distance_nm"], "elevation_ft": nearest[0].get("elevation_ft")} if nearest else None


def ahead(
    lat: float,
    lon: float,
    track_deg: float,
    gs_kt: float,
    alt_ft: float | None = None,
    vs_fpm: float = 0.0,
    shp_path=None,
    faa_cache_dir=None,
    now: datetime | None = None,
) -> dict:
    """The alerts ahead of an airplane at (lat, lon) on `track_deg` true
    at `gs_kt`, at `alt_ft` MSL (the GPS's; None where it gives none),
    climbing or descending at `vs_fpm`: the engine's {"alerts": [...],
    "unavailable": [what could not be read]}. Nothing is read on the
    ground: under flying speed (the engine's `underway`)."""
    if not engine("underway", speed_kt=gs_kt):
        return {"alerts": [], "unavailable": []}
    now = now or datetime.now(timezone.utc)
    faa_cache_dir = faa_cache_dir or terrain.DEFAULT_FAA_CACHE_DIR
    shp_path = shp_path or airspace.ensure_class_airspace_shapefile(faa_cache_dir)
    own = {"lat": lat, "lon": lon, "track_deg": track_deg, "gs_kt": gs_kt, "alt_ft": alt_ft, "vs_fpm": vs_fpm}
    frame = engine("ahead_frame", **own)
    box, near_box = tuple(frame["box"]), tuple(frame["near_box"])
    with ThreadPoolExecutor(max_workers=4) as pool:
        ground = pool.submit(_ground_ft, lat, lon)
        special_use = pool.submit(_special_use, box)
        tfrs = pool.submit(_tfrs, box)
        volumes = _volumes(shp_path, box)
        given = {
            **own,
            "now": now.timestamp(),
            "ground_ft": ground.result(),
            "airspace": volumes,
            "special_use": special_use.result(),
            "tfrs": tfrs.result(),
        }
    if alt_ft is not None:
        given |= {
            "near_field": _near_field(lat, lon),
            "swath_ground_ft": _swath_ground(frame),
            "obstacles": _obstacles(near_box, faa_cache_dir),
        }
    found = engine("alerts_ahead", **given)
    return {"alerts": _with_sfdps(found["alerts"]), "unavailable": found["unavailable"]}


def _with_sfdps(alerts: list[dict]) -> list[dict]:
    """Each special-use area's alert with SFDPS's status of it now, where
    it has one (wingtip.saa: `sfdps_active`, `sfdps_until`): passed on as
    the FAA's word beside the engine's alert, whose level stays its own."""
    names = [a["name"] for a in alerts if a.get("kind") == "special_use"]
    if not names:
        return alerts
    try:
        status = saa.status(names, now=datetime.now(timezone.utc).timestamp())
    except Exception:  # noqa: BLE001 -- the store unread: the alerts as the engine gave them
        return alerts
    return [
        {**a, "sfdps_active": status[a["name"]]["active"], "sfdps_until": status[a["name"]]["until"]}
        if a.get("kind") == "special_use" and a["name"] in status
        else a
        for a in alerts
    ]
