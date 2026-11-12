"""Airplanes heard by another source -- the FAA's terminal radar through SWIM, which ingest
(services/ingest) reads -- and which of the radar is worth reading now. Both through the live
store (wingtip.traffic.store): ingest writes what the radar hears and reads what is wanted, the
planner writes where the map looks and reads what the radar heard."""

from __future__ import annotations

import logging
import math
import threading

from ..geo import box_around
from . import store
from .adsb_lol import NEAR_RADIUS_NM, REGION_DEG, WIDE_REGION_DEG, _region
from .common import STALE_S, _NM_PER_DEG, _wall
from .recorded import FOLLOW_KEEP_S, RECORD_KEEP_S, _followed, _last_recorded, _record, followed

#: A followed airplane's report from elsewhere is recorded at most this
#: often, s: STARS sweeps every 4.8 s; a point a quarter minute is a
#: track's shape on a phone and a day's track of a few hundred kB.
ELSEWHERE_RECORD_S = 15.0

log = logging.getLogger(__name__)


def heard_elsewhere(plane: dict, at: float) -> None:
    """A report from another source (the FAA's terminal radar, in ingest),
    as `_aircraft` gives an airplane and when it was where it is (s): kept
    as the airplane's latest for the map, and recorded where it is
    followed, a point every ELSEWHERE_RECORD_S."""
    hex_id = plane["hex"]
    if not store.radar_heard(plane, at):
        return
    if _followed(hex_id):
        last = _last_recorded(hex_id)
        if last is None or at - last["t"] >= ELSEWHERE_RECORD_S:
            _record(hex_id, {**plane, "seen_s": max(0.0, _wall() - at)})


def forget_stale() -> int:
    """The radar's reports past STALE_S dropped from the store (ingest's
    housekeeping); how many."""
    return store.radar_forget(_wall() - STALE_S)


#: How long after the map's last ask the FAA's radar is still read around
#: a place, s: the map asks every few seconds while traffic is shown, so
#: past a minute nobody is looking there.
LOOKED_S = 60.0


def looked_at(lat: float, lon: float, radius_nm: float) -> None:
    """The map has asked for traffic round a place. What is kept is the
    region adsb.lol is asked about for that view (adsb_lol._region: a cell
    of half a degree, two zoomed out), never the view's own middle: when
    the map follows the airplane that middle is the pilot's position, and
    the privacy policy says it is not kept (docs/privacy-inventory.md).
    The radius is the view's widened by half the cell's diagonal, so the
    circle round the cell's middle still holds the whole view; one row a
    region, as the map asks again every few seconds for much the same."""
    mid_lat, mid_lon, asked = _region(lat, lon, radius_nm)
    deg = REGION_DEG if radius_nm <= NEAR_RADIUS_NM else WIDE_REGION_DEG
    # Half a cell's diagonal, nm: a view's middle is at most that far from
    # its cell's (less east and west, where a degree is shorter).
    slack = deg / 2 * _NM_PER_DEG * math.sqrt(2)
    store.look(f"{mid_lat},{mid_lon},{asked}", mid_lat, mid_lon, min(asked, math.ceil(radius_nm + slack)), _wall())


def forget_looks() -> int:
    """The regions nobody has asked about within LOOKED_S dropped from the
    store; how many. The planner calls it on a schedule (app.main), so they
    go whether or not ingest runs, and each ask does too."""
    return store.forget_looks(_wall() - LOOKED_S)


def prune() -> dict[str, int]:
    """The live store's housekeeping, which the planner runs on a schedule
    (app.main) so nothing outlives its promise when ingest or the map is
    quiet: the regions nobody looks at (LOOKED_S), the airplanes whose card
    has not been opened for FOLLOW_KEEP_S and the track points past
    RECORD_KEEP_S. How many of each went."""
    now = _wall()
    return {
        "looked": forget_looks(),
        "followed": store.unfollow_before(now - FOLLOW_KEEP_S),
        "points": store.forget_points(now - RECORD_KEEP_S),
    }


#: How often the planner prunes the live store, s: the regions are kept a
#: minute (LOOKED_S), so a minute.
PRUNE_EVERY_S = 60.0


def prune_forever(stop: threading.Event | None = None) -> None:
    """The thread app.main starts: prune() each PRUNE_EVERY_S until `stop`,
    so the store keeps the privacy policy's promises (a minute for the
    regions, 30 days for the followed airplanes and the tracks) whether or
    not ingest runs or a pilot asks."""
    stop = stop or threading.Event()
    while not stop.is_set():
        try:
            prune()
        except Exception:  # noqa: BLE001 -- the next minute tries again
            log.warning("live store not pruned", exc_info=True)
        stop.wait(PRUNE_EVERY_S)


def radar_wanted() -> tuple[list[tuple[float, float, float]], set[str]]:
    """What of the FAA's radar is worth reading now: the places the map has
    asked for traffic around within LOOKED_S, each (lat, lon, radius nm),
    and the addresses of the airplanes followed, whose flights are recorded
    wherever they are, card open or not. Reading the whole country's tracks
    with nobody looking kept the planner at a core of its own on the
    owner's Mac (2026-10-20); reading it all while one map looked at one
    place took 40% of the planner's time from the planning a pilot waits
    on (py-spy, 2026-10-20). ingest asks this each second."""
    return store.looked(_wall() - LOOKED_S), followed()


def _heard_elsewhere_now(hex_id: str) -> dict | None:
    """Its report from elsewhere, where heard within STALE_S, its age now."""
    now = _wall()
    found = store.radar_one(hex_id, now - STALE_S)
    if found is None:
        return None
    plane, at = found
    return plane | {"seen_s": round(now - at, 1)}


def _elsewhere_near(lat: float, lon: float, radius_nm: float, have: set[str]) -> list[dict]:
    """The airplanes heard elsewhere in the last STALE_S within `radius_nm`
    that the region's answer left out."""
    now = _wall()
    cos = math.cos(math.radians(lat))
    south, west, north, east = box_around(lat, lon, radius_nm)
    out = []
    for p, at in store.radar_within(south, north, west, east, now - STALE_S):
        if p["hex"] in have:
            continue
        if math.hypot((p["lat"] - lat) * _NM_PER_DEG, (p["lon"] - lon) * _NM_PER_DEG * cos) <= radius_nm:
            out.append(p | {"seen_s": round(now - at, 1)})
    return out
