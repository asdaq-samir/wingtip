"""Ways to fly a route, for the pilot to pick from: the fastest, the one
in the best weather, the one with the fewest stops and the one over land,
each kept clear of what an airplane under VFR must keep clear of, at the
owner's ask ("smart to reroute for fastest time along safe weather, over
terrain, best tailwinds, refueling and giving pilot flexibility to make
changes as they please", 2026-10-23).

Every rule and figure of it -- the cost grid, the search, the straightened
turns, the fuel stops, the four kinds and what each way meets -- is the
engine's (engine/crates/route/src/route/options.rs, `route_options`; #482
phase 5). This reads what the engine reads, where the engine says it is
wanted (`route_options_frame`: the grid's cells and samples, the flight's
time, the cruising altitudes the winds are asked at):

- the ground's height at the cells' samples (wingtip.terrain_detour's
  tiles) and the water out of glide of dry land there (wingtip.water);
- the TAFs over the flight's time (each its worst in the window, and the
  weather of every group: wingtip.weather), the METARs for a flight
  leaving soon, the SIGMETs and the G-AIRMETs;
- the special-use airspace and the TFRs in force over the flight;
- the winds aloft at each FD station, at the engine's altitudes;
- the fields with 100LL round the route (wingtip.fuelstops), their longest
  paved runway and whether there is somewhere to eat (`food`);
- the fixes round it, which the engine turns at and names points off.

A source not to be had is sent as nothing, and the engine says it was not
checked. It only suggests: a way picked is planned as any route is.

Across the antimeridian (Adak to Shemya) the engine's frame lies within
180 degrees of the departure's longitude, so its west edge may be under
-180 or its east over 180: the samples are read at their longitudes put
back between -180 and 180, and each box is read as the one or two boxes
it is on the data's side (`_boxes`); the engine moves what it is sent.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import numpy as np

from . import fixes, fuelstops, terrain_detour, water, weather, winds_aloft
from .engine import ask as engine

logger = logging.getLogger(__name__)


def _rings(geometry) -> list:
    """A shapely polygon or multipolygon's rings as [[lat, lon], ...]: the
    outline of each part and its holes."""
    parts = getattr(geometry, "geoms", [geometry])
    out = []
    for part in parts:
        if not hasattr(part, "exterior"):
            continue
        for ring in (part.exterior, *part.interiors):
            out.append([[float(y), float(x)] for x, y in ring.coords])
    return out


def _samples(frame: dict) -> tuple[np.ndarray, np.ndarray]:
    """The frame's samples, rows from the south, as a grid of lats and lons."""
    step = frame["cell_deg"] / frame["per_cell"]
    lats = frame["lat0"] + (np.arange(frame["rows"] * frame["per_cell"]) + 0.5) * step
    lons = frame["lon0"] + (np.arange(frame["cols"] * frame["per_cell"]) + 0.5) * step
    # A frame past the antimeridian: the data's own longitudes.
    lons = (lons + 180.0) % 360.0 - 180.0
    return np.meshgrid(lats, lons, indexing="ij")


def _boxes(box) -> list[tuple]:
    """A (south, west, north, east) box as the one or two boxes it is
    between -180 and 180: a frame past the antimeridian is split there."""
    s, w, n, e = (float(v) for v in box)
    if w < -180.0:
        return [(s, w + 360.0, n, 180.0), (s, -180.0, n, e)]
    if e > 180.0:
        return [(s, w, n, 180.0), (s, -180.0, n, e - 360.0)]
    return [(s, w, n, e)]


def _in(box, lat, lon) -> bool:
    return lat is not None and lon is not None and any(s <= lat <= n and w <= lon <= e for s, w, n, e in _boxes(box))


def _tafs(frame: dict) -> list[dict]:
    start, end = frame["window"]
    out = []
    for station in weather._dataset("tafs"):
        if not _in(frame["bbox"], station.get("lat"), station.get("lon")):
            continue
        periods = weather._periods_in_window(station["fcsts"], start, end)
        if not periods:
            continue
        worst = weather._worst_in_window(station["fcsts"], start, end) or {}
        out.append(
            {
                "ident": station["icaoId"],
                "lat": station["lat"],
                "lon": station["lon"],
                "wx": [p.get("wx") or "" for p in periods],
                "ceiling_ft": worst.get("ceiling_ft"),
                "visibility_sm": worst.get("visibility_sm"),
                "ceiling_unknown": bool(worst.get("ceiling_unknown")),
            }
        )
    return out


def _metars(frame: dict) -> list[dict]:
    if not frame["metars"]:
        return []
    return [
        {
            "ident": ident,
            "lat": r.get("lat"),
            "lon": r.get("lon"),
            "wx": r.get("wx") or "",
            "ceiling_ft": r.get("ceiling_ft"),
            "visibility_sm": r.get("visibility_sm"),
            "ceiling_unknown": bool(r.get("ceiling_unknown")),
        }
        for ident, r in weather._dataset("metars").items()
        if _in(frame["bbox"], r.get("lat"), r.get("lon"))
    ]


def _advisories(name: str) -> list[dict]:
    return [
        {
            "hazard": a.get("hazard") or "",
            "coords": [[float(lat), float(lon)] for lat, lon in a.get("coords") or []],
            "altitude_low_ft": a.get("altitude_low_ft"),
            "valid_from": a.get("valid_from"),
            "valid_to": a.get("valid_to"),
            "valid": a.get("valid"),
            "raw": a.get("raw") or "",
        }
        for a in weather._dataset(name)
    ]


def _special_use(frame: dict) -> list[dict]:
    from . import sua

    return [
        {"type": area.get("type") or "", "name": str(area.get("name") or ""), "rings": _rings(geometry)}
        for box in _boxes(frame["bbox"])
        for area, geometry in sua.areas_in(box)
    ]


def _tfrs(frame: dict) -> list[dict]:
    from shapely.geometry import shape

    from . import tfr

    # Which TFRs are in force over the flight is still the planner's
    # (tfr.in_force; the engine's gonogo_tfr_when is #482 phase 0's).
    start = datetime.fromtimestamp(frame["window"][0], timezone.utc)
    end = datetime.fromtimestamp(frame["window"][1], timezone.utc)
    return [
        {"notam_id": one.get("notam_id") or "", "title": one.get("title") or "", "rings": _rings(shape(one["geometry"]))}
        for one in tfr.all_tfrs()
        if tfr.in_force(one, start, end)
    ]


def _winds(frame: dict, fcst_hr: str) -> list[dict]:
    """The wind at each of the engine's cruising altitudes at points over
    the frame, at the departure's time: the map's grid where its timeline
    holds it, the GFS stations past it (wingtip.winds_aloft.wind_points)."""
    try:
        altitudes = [float(a) for a in frame["altitudes_ft"]]
        return [p for box in _boxes(frame["data_box"]) for p in winds_aloft.wind_points(box, fcst_hr, altitudes)]
    except weather.WeatherServiceError:
        return []


def _fields(frame: dict, table, food) -> list[dict]:
    """The fields with fuel in the frame's reach, their longest paved
    runway (wingtip.fuelstops) and whether there is somewhere to eat."""
    out = []
    for s, w, n, e in _boxes(frame["data_box"]):
        near = table[(table["lat"] >= s) & (table["lat"] <= n) & (table["lon"] >= w) & (table["lon"] <= e)]
        out += [{**row, "food": food(row["ident"]) if food else None} for row in fuelstops._table(near)]
    return out


def _fixes(box) -> list[dict]:
    return [
        {
            "ident": f["ident"],
            "lat": f["lat"],
            "lon": f["lon"],
            "navaid": bool(f.get("navaid")),
            "vfr": bool(f.get("vfr")),
            "kind": f.get("kind") or "",
            "mag_var": f.get("mag_var"),
        }
        for s, w, n, e in _boxes(box)
        for f in fixes.within(s, w, n, e)
    ]


def options(
    dep: dict,
    dest: dict,
    profile: dict | None,
    *,
    depart: datetime | None = None,
    fcst_hr: str | None = None,
    min_ceiling_ft: float | None = None,
    min_visibility_sm: float | None = None,
    current: list[tuple] | None = None,
    current_idents: list[str] | None = None,
    current_landed: list[bool] | None = None,
    fields=None,
    filed: tuple[list[tuple], list[str]] | None = None,
    food=None,
    night: bool | None = None,
) -> dict:
    """The ways to fly from `dep` to `dest` ({"ident", "lat", "lon"}) in an
    airplane of `profile` (wingtip.aircraft's; None for no airplane picked,
    the ways then with no minutes, fuel or fuel stops), the engine's route_options
    answer (its contract: engine/contract/engine.schema.json). `current`
    is the pilot's own route [(lat, lon)] end to end, its points' idents
    and which of them are landed at; `filed` the most filed route's points
    and idents between the ends; `fields` the table of fields with fuel
    (wingtip.fuelstops' by default); `food(ident)` whether there is
    somewhere to eat there, None where not read yet -- those the ways
    weighed are in the answer's `food_unread`. `night`, 91.151's night
    reserve, is the engine's own reading at both ends of the flight's
    window (wingtip_flight::sun) unless given (a test's fixed day)."""
    # A naive time is UTC, as the plan's API takes it.
    now = time.time()
    leave = depart.replace(tzinfo=depart.tzinfo or timezone.utc).timestamp() if depart else now
    asked = {
        "dep": {"ident": dep.get("ident") or "", "lat": dep["lat"], "lon": dep["lon"]},
        "dest": {"ident": dest.get("ident") or "", "lat": dest["lat"], "lon": dest["lon"]},
        "profile": profile
        and {k: profile.get(k) for k in ("cruise_tas_kt", "fuel_burn_gph", "usable_fuel_gal", "taxi_fuel_gal", "service_ceiling_ft")},
        "depart_s": leave,
        "now_s": now,
        "min_ceiling_ft": min_ceiling_ft,
        "min_visibility_sm": min_visibility_sm,
        "current": [[lat, lon] for lat, lon in current] if current else None,
        "current_idents": list(current_idents or []),
        "current_landed": [bool(b) for b in current_landed or []],
        "filed": {"points": [[lat, lon] for lat, lon in filed[0]], "idents": list(filed[1])} if filed else None,
    }
    frame = engine("route_options_frame", **asked)
    lats, lons = _samples(frame)
    try:
        asked["terrain_ft"] = np.rint(terrain_detour.heights_ft(lats, lons)).astype(int).ravel().tolist()
    except (OSError, ValueError) as error:
        # The terrain tiles not to be had (requests' errors are OSErrors):
        # the ways offered over level ground, and the pilot told.
        logger.warning("route options: terrain not read (%s)", error)
    try:
        far = water.out_of_glide_samples(
            frame["lat0"],
            frame["lon0"],
            frame["rows"],
            frame["cols"],
            frame["cell_deg"],
            height_ft=frame["lowest_cruise_ft"],
            speed_kt=max(float(frame["tas_kt"]), 1.0),
            glide_ratio=((profile or {}).get("glide") or {}).get("ratio"),
        )
        asked["water_far"] = (np.asarray(far, dtype=np.uint8).ravel() + ord("0")).tobytes().decode()
    except (water.WaterUnavailable, OSError, ValueError) as error:
        logger.warning("route options: water not read (%s)", error)
    for key, read in (
        ("tafs", lambda: _tafs(frame)),
        ("metars", lambda: _metars(frame)),
        ("sigmets", lambda: _advisories("airsigmets")),
        ("gairmets", lambda: _advisories("gairmets")),
    ):
        try:
            asked[key] = read()
        except weather.WeatherServiceError:
            pass
    try:
        asked["sua"] = _special_use(frame)
    except Exception:  # noqa: BLE001 -- a source down is said, not raised
        pass
    try:
        asked["tfrs"] = _tfrs(frame)
    except Exception:  # noqa: BLE001
        pass
    asked["winds"] = _winds(frame, fcst_hr)
    if night is not None:
        asked["night"] = night
    try:
        table = fields if fields is not None else fuelstops.fields_with_fuel()
        asked["fields"] = _fields(frame, table, food)
    except (OSError, ValueError) as error:
        logger.warning("route options: fuel fields not read (%s)", error)
    asked["food"] = food is not None
    asked["fixes"] = _fixes(frame["data_box"])
    return engine("route_options", **asked)
