"""adsb.lol, the map's traffic: its API asked about a region at most once in five seconds
(the package's docstring says how), and a pilot's search asked ahead of the regions' turns. Its
globe's traces of an airplane are wingtip.traffic.globe's."""

from __future__ import annotations

import math
import threading

import requests

from .. import outside, ratelimit
from .shared_gate import SharedGate
from ..geo import distance_nm
from .common import TIMEOUT_S, TrafficUnavailable, _LOCK, _aircraft, _clock, _sleep, lol_headers, refused_for_s

URL = "https://api.adsb.lol/v2/point/{lat:.2f}/{lon:.2f}/{radius}"

#: A region's side, degrees, and how far round its middle it is asked
#: for: a view's middle is at most a quarter degree from the region's
#: (15 nm north and south, less east and west), so 80 nm holds a view of 60.
REGION_DEG = 0.5
REGION_RADIUS_NM = 80
#: The furthest a view is given its traffic from those regions, nm.
NEAR_RADIUS_NM = 60
#: A view further out than that -- the map zoomed out to a state or two,
#: whose traffic the pilot asked to see wherever it is panned -- from
#: regions of two degrees, asked for out to 250 nm, adsb.lol's furthest:
#: a view's middle is at most a degree from the region's (60 nm north and
#: south, 54 east and west as far south as 25 degrees north, 81 nm across),
#: so 250 nm holds a view of 165. Round O'Hare that was 474 airplanes and
#: 240 kB, answered in under a second (2026-10-11).
WIDE_REGION_DEG = 2.0
WIDE_REGION_RADIUS_NM = 250
#: The furthest a view is asked about, nm.
MAX_RADIUS_NM = 165
#: A region's answer is given again, not asked for, this long.
FRESH_S = 5.0
#: Never two requests to adsb.lol closer together than this, from the
#: planner and ingest together (shared_gate).
MIN_GAP_S = 5.0
#: The longest a pilot's search waits for its turn, s (it was a gap, 5 s, and the request's 5 s after): further off,
#: it is answered at once from the FAA's radar or with the FAA's record (/api/traffic/find, `checked` false).
SEARCH_WAIT_S = 1.0
#: Turned away or not answered, nothing is asked for this long (a 429's Retry-After where longer).
BACKOFF_S = 15.0
#: Searches not answered in their time this many times in a row: adsb.lol is hanging, not refusing, and the next
#: searches are not sent for SEARCH_HOLD_S, where each spent its whole timeout every turn. The
#: regions' turns are not held by it: a region waits out its own longer timeout and keeps its last answer meanwhile.
SEARCH_TIMEOUTS_HELD = 2
SEARCH_HOLD_S = 15.0
#: A region's last answer is given while adsb.lol cannot be asked, until it is this old; then it is unavailable.
KEEP_S = 60.0

#: Each region's last answer: (when it came, monotonic, airplanes).
_REGIONS: dict = {}
#: When adsb.lol may next be asked for a region (the regions' turns taken in order from it) and a search's turn;
#: in _LOL when the last request went, and until when nothing is asked after a refusal: kept in the live store, so
#: ingest's follow round and the planner keep to one gap and one hold (wingtip.traffic.shared_gate).
#: `timeouts` and `searches_held_until`: searches not answered in their time in a row, and the hold they started.
_STATE = {"next_ask": 0.0, "search_at": -math.inf, "timeouts": 0, "searches_held_until": -math.inf}
_LOL: ratelimit.Gate | SharedGate = SharedGate("adsb.lol")
#: Regions being asked for now; the rest of a region's askers wait on this.
_FLIGHTS: dict = {}

#: Regions whose kept answer is ADS-B Exchange's, for its credit.
_FROM_ADSBX: set = set()


def _region(lat: float, lon: float, radius_nm: float = NEAR_RADIUS_NM) -> tuple[float, float, int]:
    """The region a view of `radius_nm` round a point is given its traffic
    from: (its middle's latitude and longitude, how far round it adsb.lol
    is asked), a near one for a view of 60 nm or less, else a wide one."""
    deg, asked = (REGION_DEG, REGION_RADIUS_NM) if radius_nm <= NEAR_RADIUS_NM else (WIDE_REGION_DEG, WIDE_REGION_RADIUS_NM)
    return round(lat / deg) * deg, round(lon / deg) * deg, asked


def _ask(region: tuple[float, float, int]) -> list[dict]:
    """adsb.lol's airplanes round a region's middle. Raises
    TrafficUnavailable where it turns the request away or does not answer."""
    try:
        resp = outside.live_get(URL.format(lat=region[0], lon=region[1], radius=region[2]), headers=lol_headers(), timeout=TIMEOUT_S)
        _LOL.hold(refused_for_s(resp), _clock())
        resp.raise_for_status()
        entries = resp.json().get("ac") or []
    except (requests.RequestException, ValueError) as err:
        raise TrafficUnavailable(f"adsb.lol did not answer: {err}") from err
    return [a for a in (_aircraft(e) for e in entries if isinstance(e, dict)) if a is not None]


def _region_answer(region: tuple[float, float, int]) -> tuple[float, list[dict]]:
    """(when it came, airplanes) for a region: its last answer while fresh,
    or while adsb.lol may not be asked yet; else adsb.lol's -- for a
    region with none, after waiting out the gap between requests -- else,
    turned away, its last answer while not too old. One asker at a time
    per region: the rest wait for its answer and are given it. The lock
    is held only to decide and to store, never across the wait, the gate's
    turn (a write to the store ingest shares, which may wait on it) or the
    request, so a phone whose region has an answer is never kept behind
    another's request or ingest's disk."""
    while True:
        with _LOCK:
            held = _REGIONS.get(region)
            now = _clock()
            kept = held is not None and now - held[0] < KEEP_S
            if held and now - held[0] < FRESH_S:
                return held
            wait = _STATE["next_ask"] - now
            if wait > 0 and kept:
                return held
            flight = _FLIGHTS.get(region)
            if flight is None:
                # Past two gaps is a back-off, not a queue of regions.
                if wait > 2 * MIN_GAP_S:
                    raise TrafficUnavailable("adsb.lol has not answered for a while")
                earliest = max(now, _STATE["next_ask"])
                flight = _FLIGHTS[region] = threading.Event()
                break
        # Another phone is asking for this region: wait for it, then look again.
        flight.wait(TIMEOUT_S + 2 * MIN_GAP_S + 1)
    try:
        # One turn, taken once in the gate the searches and ingest's follow
        # round keep to as well (a gap after the last ask of any of them,
        # two gaps at most), and slept for once; the next region's place is
        # a gap after this one's.
        taken = _LOL.take(now, earliest, MIN_GAP_S, 2 * MIN_GAP_S)
        if taken is None:
            if kept:
                return held
            raise TrafficUnavailable("adsb.lol's next turn is too far off")
        with _LOCK:
            _STATE["next_ask"] = max(_STATE["next_ask"], taken + MIN_GAP_S)
        if taken > now:
            _sleep(taken - now)
        try:
            answer = (taken, _ask(region))
        except TrafficUnavailable:
            answer = None
        if answer is None:
            _LOL.hold(BACKOFF_S, taken)
            until = _LOL.until
        with _LOCK:
            if answer is None:
                _STATE["next_ask"] = max(_STATE["next_ask"], until)
            else:
                _REGIONS[region] = answer
                _FROM_ADSBX.discard(region)
                if len(_REGIONS) > 256:
                    for gone in [r for r, (at, _) in _REGIONS.items() if taken - at > KEEP_S]:
                        del _REGIONS[gone]
    finally:
        with _LOCK:
            _FLIGHTS.pop(region, None)
        flight.set()
    if answer is not None:
        return answer
    if kept:
        return held
    raise TrafficUnavailable("adsb.lol has not answered for a while")


def _covering(lat: float, lon: float, radius_nm: float) -> tuple[float, list[dict]] | None:
    """The freshest kept answer of any region whose asked circle holds the
    whole view (its middle's distance plus the view's radius within it),
    not older than KEEP_S; None where none does."""
    now = _clock()
    best = None
    with _LOCK:
        for (rlat, rlon, asked), (at, planes) in _REGIONS.items():
            if now - at >= KEEP_S:
                continue
            apart = distance_nm(rlat, rlon, lat, lon)
            if apart + radius_nm <= asked and (best is None or at > best[0]):
                best = (at, planes)
    return best


FIND_URL = "https://api.adsb.lol/v2/{by}/{value}"


def _paced(url: str, wait_most_s: float = 2 * MIN_GAP_S, timeout: float = TIMEOUT_S, same_turn: bool = False) -> dict:
    """adsb.lol's answer to a pilot's search, asked ahead of the regions'
    turns: a gap after the last request that went and the last search's,
    never two within MIN_GAP_S still (a region whose turn it falls near
    gives way, `_region_answer`). A turn further off than `wait_most_s` is
    not waited for: TrafficUnavailable. `same_turn`: a search's second way,
    sent at once in its first's turn (its own is a gap off, past the wait),
    passed only once the first was answered. A search's own short timeout
    holds adsb.lol for no one; a refusal does, and SEARCH_TIMEOUTS_HELD in a
    row hold the searches alone for SEARCH_HOLD_S."""
    with _LOCK:
        now = _clock()
        if now < _STATE["searches_held_until"]:
            raise TrafficUnavailable("adsb.lol has not answered the last searches in their time")
        earliest = now if same_turn else max(now, _STATE["search_at"] + MIN_GAP_S)
    # The turn taken in the gate both processes keep to (it respects a hold
    # itself), outside the lock: a gap after the last request and the last
    # search's, a same-turn second way at once.
    slot = _LOL.take(now, earliest, 0.0 if same_turn else MIN_GAP_S, wait_most_s)
    if slot is None:
        raise TrafficUnavailable("adsb.lol's next turn is too far off")
    with _LOCK:
        _STATE["search_at"] = max(_STATE["search_at"], slot)
    if slot > now:
        _sleep(slot - now)
    try:
        resp = outside.live_get(url, headers=lol_headers(), timeout=timeout)
        resp.raise_for_status()
        answer = resp.json()
    except (requests.RequestException, ValueError) as err:
        if isinstance(err, requests.Timeout):
            with _LOCK:
                _STATE["timeouts"] += 1
                if _STATE["timeouts"] >= SEARCH_TIMEOUTS_HELD:
                    _STATE["searches_held_until"], _STATE["timeouts"] = _clock() + SEARCH_HOLD_S, 0
        else:
            refusal = getattr(err, "response", None)
            _LOL.hold(max(BACKOFF_S, refused_for_s(refusal) if refusal is not None else 0.0), _clock())
            until = _LOL.until
            with _LOCK:
                _STATE["next_ask"] = max(_STATE["next_ask"], until)
                _STATE["timeouts"] = 0
        raise TrafficUnavailable(f"adsb.lol did not answer: {err}") from err
    with _LOCK:
        _STATE["timeouts"] = 0
    return answer


def _heard(text: str) -> list[dict]:
    """The airplanes a region's last answer (any phone's, a minute at
    most) has by this callsign, registration or ICAO address, freshest
    first, each `seen_s` counted from now. Called with the lock held."""
    now = _clock()
    bare = text.replace("-", "")
    best: dict[str, dict] = {}
    for at, planes in _REGIONS.values():
        if now - at >= KEEP_S:
            continue
        for plane in planes:
            if (
                text.lower() not in (plane["hex"], plane["hex"].lstrip("~"))
                and (plane["callsign"] or "").upper() != text
                and (plane["registration"] or "").replace("-", "").upper() != bare
            ):
                continue
            aged = {**plane, "seen_s": round((plane["seen_s"] or 0.0) + now - at, 1)}
            if plane["hex"] not in best or aged["seen_s"] < best[plane["hex"]]["seen_s"]:
                best[plane["hex"]] = aged
    return sorted(best.values(), key=lambda plane: plane["seen_s"])


#: adsb.lol's credit, the map's traffic's by default (the planner's Traffic schema), for a search's answer from it.
ADSB_LOL_SOURCE = {"source": "adsb.lol", "license": "ODbL 1.0"}
