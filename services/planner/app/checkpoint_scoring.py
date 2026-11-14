"""Scored checkpoints for a route, read off the chart: whatever the chart
reader finds along it (app.chart_model.corridor, the training page's own
read, shared and kept on disk), scored by the chart model the training
page's ratings trained (wingtip.chartmodel, loaded by app.chart_scorer) -- or,
while none is promoted, by the palette's constant for each kind of
thing. Remembered per route until the chart or the model changes.

They were OpenStreetMap's landmarks, scored by a model of their own: a
route had to be collected first -- minutes of Overpass, FAA and
elevation downloads -- before it had a checkpoint, and the planner
offered "Collect this route" for every new one. The chart is read in
seconds for any route it covers, and it is what the pilot will be
looking at."""

import re
import threading

from cachetools import LRUCache
from fastapi import HTTPException
from wingtip import chartlabels, charts, faa_data, geo, model_registry, places
from wingtip.engine import ask as engine
from wingtip.terrain import DEFAULT_FAA_CACHE_DIR

from . import chart_model

# Within a mile of the course, as the landmark model's corridor was: a
# checkpoint a pilot looks for off the nose, not one four miles abeam,
# which the training page's wider read is there to rate.
HALF_WIDTH_NM = 1.0

# What the nav log calls a detection with no name of its own: the chart
# draws a lake's outline, not always its name, and the reader reads no
# words. The charted airports carry the FAA's names.
KIND_NAMES = {"water": "Lake", "town": "Town", "river": "River", "road_or_rail": "Road or railway", "airport": "Airport"}

# Keyed by what changes the answer: the chart's cycle and revision (which
# name the corridor's kept read) and the promoted chart model. Bounded,
# so a long-lived process is not holding every route it ever served.
_SCORE_CACHE: LRUCache = LRUCache(maxsize=256)
_SCORE_CACHE_LOCK = threading.Lock()


def _mtime_or_none(path) -> float | None:
    try:
        return path.stat().st_mtime
    except OSError:
        return None


def _checkpoint(landmark, predicted: float | None) -> dict:
    return {
        "id": f"{landmark.category}@{landmark.lat:.5f},{landmark.lon:.5f}",
        "category": landmark.category,
        "name": landmark.name or KIND_NAMES.get(landmark.category, landmark.category),
        "lat": landmark.lat,
        "lon": landmark.lon,
        "along_track_nm": round(landmark.extras["along_track_nm"], 3),
        "predicted_score": round(predicted if predicted is not None else landmark.score, 4),
    }


# A private-use field's score where nothing says the sectional draws it.
# The FAA's Aeronautical Chart User's Guide (VFR Terms and Symbols,
# Airports) charts a private, non-public-use field only where it has
# emergency or landmark value, so most of NASR's 14,000 private fields
# are not on the chart; a checkpoint named after one the pilot cannot see
# is no checkpoint. Under the engine's 2.5 floor (checkpoints_select),
# so such a field is offered only where a pilot's chart pick on the route
# says it is there to be seen.
PRIVATE_UNCHARTED_SCORE = 2.0

# The FAA airports' candidates are named "Title (IDENT)" (faa_data.
# load_route_airports); the identifier is read back from it.
_IDENT = re.compile(r"\(([A-Z0-9]{3,4})\)$")


def _weigh_private(checkpoints: list, dep: str, dest: str) -> list:
    """Each private-use field among the airport checkpoints scored down to
    PRIVATE_UNCHARTED_SCORE unless a chart pick rated 1-5 on this route
    stands within chartlabels.SAME_PLACE_NM of it: one a pilot saw on the
    chart and would use."""
    private = faa_data.private_fields(DEFAULT_FAA_CACHE_DIR)
    picks = [p for p in chartlabels.load_picks(chartlabels.route_key(dep, dest)) if (p.get("rating") or 0) >= 1]
    for c in checkpoints:
        found = _IDENT.search(c["name"] or "") if c["category"] == "airport" else None
        if not found or found.group(1) not in private:
            continue
        seen = any(geo.distance_nm(c["lat"], c["lon"], p["lat"], p["lon"]) <= chartlabels.SAME_PLACE_NM for p in picks)
        if not seen:
            c["predicted_score"] = min(c["predicted_score"], PRIVATE_UNCHARTED_SCORE)
    return checkpoints


def score(dep: str, dest: str) -> list:
    """Every detection within HALF_WIDTH_NM of the course, scored, in
    along-track order, a private-use field the chart may not draw scored
    down (_weigh_private). A failed read of the chart is a 502."""
    return _weigh_private(_scored(dep, dest), dep, dest)


def _scored(dep: str, dest: str) -> list:
    """The chart's detections within HALF_WIDTH_NM of the course, scored,
    in along-track order, remembered per route."""
    cycle = charts.serving_cycle()
    key = (cycle, charts.tiles_revision(cycle), _mtime_or_none(model_registry.CHART_CURRENT_DIR / "metrics.json"))
    with _SCORE_CACHE_LOCK:
        cached = _SCORE_CACHE.get((dep, dest))
        if cached is not None and cached["key"] == key:
            # Copies, not the cached dicts themselves -- /api/checkpoints
            # writes a "selected" flag onto every entry it returns, and
            # two requests doing that to one shared list is a data race.
            return [dict(c) for c in cached["checkpoints"]]

    try:
        landmarks = chart_model.corridor(chartlabels.route_key(dep, dest), wait=True)
    except RuntimeError as err:
        raise HTTPException(502, str(err)) from err
    # Scored over the whole read, as each detection's features count its
    # neighbours either side; only then cut to the planner's corridor.
    predicted = chart_model.predicted_scores(landmarks)
    checkpoints = sorted(
        (_checkpoint(landmark, p) for landmark, p in zip(landmarks, predicted) if abs(landmark.extras["cross_track_nm"]) <= HALF_WIDTH_NM),
        key=lambda c: c["along_track_nm"],
    )
    with _SCORE_CACHE_LOCK:
        _SCORE_CACHE[(dep, dest)] = {"key": key, "checkpoints": [dict(c) for c in checkpoints]}
    return checkpoints


def scored_and_selected(dep: str, dest: str, length_nm: float | None = None) -> tuple:
    """Every scored candidate, each flagged "selected" or not, and the
    subset worth flying, in along-track order. Each named as the chart
    labels the place where the place names know it (wingtip.places
    checkpoint_name: "Lake Zurich", "River near Springfield") -- here, not
    in the cached scores, as the names load after the service starts.

    Picked only from those between the ends (`length_nm`, the hop's own
    great circle), 3 nm in from each (the engine's NEAR_A_STOP_NM): the corridor runs past
    them, and a route of one hop took a checkpoint behind its departure
    or beyond its destination, its nav log flying out to it and back --
    KLSE-KCMY 34.5 nm of legs for a 22.9 nm course, a lake 2.6 nm behind
    La Crosse first and a landing site 3.1 nm past Camp Douglas last, its
    time and fuel half again what the flight takes (2026-10-28). A route
    with stops cut its hops so already, after the pick, which lost the one
    a checkpoint off the end had kept out."""
    scored = score(dep, dest)
    for c in scored:
        c["name"] = places.checkpoint_name(c["category"], c["lat"], c["lon"]) or c["name"]
    selected = select_checkpoints(scored, length_nm=length_nm)
    keys = {c["id"] for c in selected}
    for c in scored:
        c["selected"] = c["id"] in keys
    return scored, selected


def select_checkpoints(scored: list, *, length_nm: float | None = None, **given) -> list:
    """The checkpoints the engine picks from `scored` (checkpoints_select,
    route/checkpoints.rs: greedy by the model's score, 10 nm apart, none
    under 2.5, and within a hop of `length_nm` none within 3 nm of either
    end), in route order. `given`: min_spacing_nm, max_count, min_score."""
    asked = [{"along_track_nm": c.get("along_track_nm"), "predicted_score": c.get("predicted_score")} for c in scored]
    picked = engine("checkpoints_select", candidates=asked, length_nm=length_nm, **given)
    return [scored[i] for i in picked]


def route_checkpoints(r) -> tuple[list, list, list]:
    """The scored candidates and the selected checkpoints of a route with
    any number of stops (app.router_basics.Route), along the whole of it, and
    the selected ones hop by hop -- each hop's own, for its nav log's
    fixes. A hop is a route of its own here: its own chart read, kept and
    shared with anyone flying it alone, and its own selection, cut to the
    hop itself so a checkpoint past a stop is not counted on both sides
    of it. Along-track distances run on through each stop."""
    hops = r.hops
    if len(hops) == 1:
        scored, selected = scored_and_selected(r.dep_ident, r.dest_ident, hops[0].length_nm)
        return scored, selected, [selected]
    # Every hop's chart asked for at once: each read is a job of its own
    # (app.detection), and one after another they would add up.
    for hop in hops:
        chart_model.corridor(chartlabels.route_key(hop.dep_ident, hop.dest_ident), wait=False)
    scored_all: list = []
    selected_all: list = []
    by_hop: list = []
    offset = 0.0
    # A point beside a stop can project onto both hops: it is the first's.
    seen: set = set()
    for index, hop in enumerate(hops):
        length = hop.length_nm
        scored, selected = scored_and_selected(hop.dep_ident, hop.dest_ident, length)
        earlier = set(seen)

        def on_hop(c, length=length, earlier=earlier):
            return 0.0 <= c["along_track_nm"] <= length and c["id"] not in earlier

        # selected is already 3 nm in from the hop's ends (the engine's).
        mine = [c for c in selected if on_hop(c)]
        chosen = {c["id"] for c in mine}

        def along(c, offset=offset, index=index, chosen=chosen):
            return {**c, "along_track_nm": round(c["along_track_nm"] + offset, 3), "hop": index, "selected": c["id"] in chosen}

        kept = [c for c in scored if on_hop(c)]
        seen |= {c["id"] for c in kept}
        scored_all += [along(c) for c in kept]
        selected_all += [along(c) for c in mine]
        by_hop.append(mine)
        offset += length
    return scored_all, selected_all, by_hop
