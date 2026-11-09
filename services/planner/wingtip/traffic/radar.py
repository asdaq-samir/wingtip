"""Airplanes heard by another source -- the FAA's terminal radar through SWIM, which ingest
(services/ingest) reads -- and which of the radar is worth reading now. Both through the live
store (wingtip.traffic.store): ingest writes what the radar hears and reads what is wanted, the
planner writes where the map looks and reads what the radar heard."""

from __future__ import annotations

import math

from . import store
from .common import STALE_S, _NM_PER_DEG, _wall
from .recorded import _followed, _last_recorded, _record, followed

#: A followed airplane's report from elsewhere is recorded at most this
#: often, s: STARS sweeps every 4.8 s; a point a quarter minute is a
#: track's shape on a phone and a day's track of a few hundred kB.
ELSEWHERE_RECORD_S = 15.0


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
    """The map has asked for traffic round a place: one view a place, to the
    tenth of a degree, as the map asks again every few seconds for much the
    same circle."""
    store.look(f"{round(lat, 1)},{round(lon, 1)}", lat, lon, radius_nm, _wall())


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
    dlat = radius_nm / _NM_PER_DEG
    dlon = radius_nm / (_NM_PER_DEG * max(cos, 0.01))
    out = []
    for p, at in store.radar_within(lat - dlat, lat + dlat, lon - dlon, lon + dlon, now - STALE_S):
        if p["hex"] in have:
            continue
        if math.hypot((p["lat"] - lat) * _NM_PER_DEG, (p["lon"] - lon) * _NM_PER_DEG * cos) <= radius_nm:
            out.append(p | {"seen_s": round(now - at, 1)})
    return out
