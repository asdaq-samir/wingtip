"""An airplane watched: its track recorded as it is asked for, and the followed airplanes asked
for in the background."""

from __future__ import annotations

import logging
import math

from .. import tracing
from ..geo import distance_nm
from .common import STALE_S, TrafficUnavailable, _LOCK, _aircraft, _clock, _number, _wall
from .adsb_lol import ADSB_LOL_SOURCE, FIND_URL, _paced
from .globe import _recent
from .adsbx import ADSBX_SOURCE, _adsbx
from .recorded import _last_recorded, _record, _recorded, followed
from .radar import ELSEWHERE_RECORD_S, _heard_elsewhere_now

log = logging.getLogger(__name__)

#: adsb.lol's globe, where the traces are, answers the planner with a
#: browser check since 2026-10-19 (a 403 and an HTML page), so a card's
#: trail and an alert's state came back empty for every airplane; and
#: some airplanes no adsb.lol feeder hears at all -- N3429J, a UAT
#: airplane rebroadcast by the FAA's ADS-R, which ADS-B Exchange and
#: FlightAware had while adsb.lol had nothing (the owner's screenshots,
#: 2026-10-19). An airplane whose card is open is asked for by its address
#: -- adsb.lol's API first, ADS-B Exchange where it has nothing -- and its
#: positions are kept: its trail, the field it left, and its place on the
#: map, where a region's answer does not have it.
#: Its card is open while its flight was asked for this recently, s: the
#: card asks each minute (queryClient's flightQuery).
WATCH_FOR_S = 150.0
#: A watched airplane is asked for at most this often, s: about the map's
#: own traffic rate, and at ADS-B Exchange's prices (its RapidAPI plan, a
#: month's 10,000) some 180 an hour while a card stays open.
WATCH_GAP_S = 20.0

_WATCHED: dict[str, float] = {}
_WATCH_ASKED: dict[str, float] = {}
#: Whose a watched airplane's last report was, for the map's credit.
_WATCH_SOURCE: dict[str, str] = {}
#: Where adsb.lol's API last heard each watched airplane on the ground,
#: {"lat", "lon", "t"}: the map draws no airplane on the ground (`_aircraft`)
#: and none is recorded, so with the globe's traces refused (since
#: 2026-10-23) an airplane that had landed had no state at all and its card
#: said adsb.lol did not answer (the owner's N570GJ taxiing at O'Hare,
#: 2026-11-27).
_ON_GROUND: dict[str, dict] = {}
#: When a source last answered for each watched airplane (`_answered`).
_ANSWERED: dict[str, float] = {}

#: How often each followed airplane is asked for in the background, s:
#: its flights recorded as FlightAware records them, card open or not
#: (the owner's screenshots of N3429J's day, 2026-10-19, of which the
#: planner had nothing). Of adsb.lol (ODbL, credited with the map's
#: traffic): its globe's recent trace first, which costs none of the
#: API's day, then its API by the address, which paces itself
#: (adsb_lol.MIN_GAP_S). ADS-B Exchange's paid month is left to an open
#: card. adsb.fi, which heard some UAT airplanes adsb.lol does not, was
#: cut: its terms are personal and non-commercial
#: (docs/store/feature-review.md).
FOLLOW_EVERY_S = 30.0
#: A followed airplane nothing has heard for this long, s, is on the
#: ground or out of every feeder's reach: it is asked for every
#: FOLLOW_QUIET_EVERY_S instead of each round. Followed for 30 days
#: (FOLLOW_KEEP_S), most are quiet most of the time, and asking each one
#: every 30 s was 2,880 asks a day an airplane, a round of 21 taking 23 s
#: of its 30 at adsb.fi's second a request (2026-11-06's profile). The
#: FAA's radar still hears a followed one wherever a terminal does
#: (radar_wanted), so a departure is recorded from there at once.
FOLLOW_QUIET_AFTER_S = 600.0
FOLLOW_QUIET_EVERY_S = 120.0
#: When each followed airplane was last asked for (_clock).
_FOLLOW_ASKED: dict[str, float] = {}


def _follow_due(hex_id: str) -> bool:
    """Whether a followed airplane is asked for this round: each round
    while heard lately, every FOLLOW_QUIET_EVERY_S while quiet."""
    last = _last_recorded(hex_id)
    quiet = last is None or _wall() - last["t"] > FOLLOW_QUIET_AFTER_S
    now = _clock()
    with _LOCK:
        if quiet and now - _FOLLOW_ASKED.get(hex_id, -math.inf) < FOLLOW_QUIET_EVERY_S:
            return False
        _FOLLOW_ASKED[hex_id] = now
    return True


def _lol_by_hex(hex_id: str) -> list[dict]:
    """adsb.lol's API's airplanes by this address, as `_aircraft` gives
    them. Raises TrafficUnavailable where it turns the planner away."""
    answer = _paced(FIND_URL.format(by="hex", value=hex_id))
    entries = answer.get("ac") if isinstance(answer, dict) else None
    if not isinstance(entries, list):
        return []
    for e in entries:
        if not isinstance(e, dict) or e.get("alt_baro") != "ground" or str(e.get("hex", "")).lower().lstrip("~") != hex_id.lstrip("~"):
            continue
        lat, lon = _number(e.get("lat")), _number(e.get("lon"))
        if lat is not None and lon is not None:
            seen = _number(e.get("seen_pos")) or _number(e.get("seen")) or 0.0
            with _LOCK:
                _ON_GROUND[hex_id] = {"lat": lat, "lon": lon, "t": round(_wall() - seen, 1)}
    return [a for a in (_aircraft(e) for e in entries if isinstance(e, dict)) if a is not None]


def _answered(hex_id: str) -> bool:
    """A source answered when this airplane was last asked for (`_watch`),
    within WATCH_FOR_S, even with nothing of it: not heard, not unavailable."""
    with _LOCK:
        return _clock() - _ANSWERED.get(hex_id, -math.inf) < WATCH_FOR_S


def _on_ground(hex_id: str) -> dict | None:
    """Where adsb.lol's API last heard this airplane on the ground (_ON_GROUND)."""
    with _LOCK:
        return _ON_GROUND.get(hex_id)


def follow_round() -> int:
    """Each followed airplane not heard elsewhere just now (the FAA's
    radar records it, heard_elsewhere) and due (_follow_due) asked of adsb.lol by its address
    -- the recent trace, else the API -- and what it hears recorded. The
    round ends where adsb.lol is turning the planner away: the next
    round tries again. How many were heard."""
    heard = 0
    # The card opened latest first, so a round adsb.lol cuts short has
    # asked for the airplanes pilots are looking at (security round 4, M5).
    for hex_id in followed():
        if _heard_elsewhere_now(hex_id) is not None or not _follow_due(hex_id):
            continue
        planes = _recent(hex_id)
        if planes is None:
            try:
                planes = _lol_by_hex(hex_id)
            except TrafficUnavailable:
                break
        for plane in planes:
            if plane["hex"].lower().lstrip("~") == hex_id:
                _record(hex_id, plane)
                with _LOCK:
                    _WATCH_SOURCE[hex_id] = ADSB_LOL_SOURCE["source"]
                heard += 1
    return heard


def follow_job() -> None:
    """One round of asking for the followed airplanes, the job ingest runs
    every FOLLOW_EVERY_S on wingtip.schedule. A round that fails is logged
    by the scheduler and tried at the next turn."""
    # A trace of its own where tracing is on (ingest's): the round's asks
    # of adsb.lol under it.
    with tracing.span("follow round", root=True):
        follow_round()


def _watch(hex_id: str) -> None:
    """The airplane asked for now, where it is due (WATCH_GAP_S): adsb.lol's
    API by its address, then ADS-B Exchange where it has nothing or does
    not answer; what is heard in the air
    recorded, and whose it was. Quiet where none may be asked or answers:
    the next ask tries again."""
    # The FAA's radar has it now (ingest): recorded from there, a point
    # each ELSEWHERE_RECORD_S, nothing asked of adsb.lol or spent of ADS-B
    # Exchange. The radar records only the airplanes followed, so one whose
    # card is open is recorded here: N570GJ flew into O'Hare under the
    # radar with its card open and had no flight to show (2026-11-27).
    elsewhere = _heard_elsewhere_now(hex_id)
    if elsewhere is not None:
        last = _last_recorded(hex_id)
        if last is None or _wall() - elsewhere["seen_s"] - last["t"] >= ELSEWHERE_RECORD_S:
            _record(hex_id, elsewhere)
        return
    now = _clock()
    with _LOCK:
        if now - _WATCH_ASKED.get(hex_id, -math.inf) < WATCH_GAP_S:
            return
        _WATCH_ASKED[hex_id] = now
    answered = True
    try:
        planes = _lol_by_hex(hex_id)
    except TrafficUnavailable:
        planes, answered = [], False
    source = ADSB_LOL_SOURCE["source"]
    if not planes:
        try:
            planes, source = _adsbx(f"icao/{hex_id}", search=True), ADSBX_SOURCE["source"]
            answered = True
        except TrafficUnavailable:
            planes = []
    if answered:
        with _LOCK:
            _ANSWERED[hex_id] = now
    for plane in planes:
        if plane["hex"].lower().lstrip("~") == hex_id.lstrip("~"):
            _record(hex_id, plane)
            with _LOCK:
                _WATCH_SOURCE[hex_id] = source


def _watched_near(lat: float, lon: float, radius_nm: float, have: set[str]) -> list[dict]:
    """The watched airplanes heard in the last STALE_S within `radius_nm`
    that a region's answer left out, as `_aircraft` gives each, its age
    brought up to now: where adsb.lol does not hear one, the map has it."""
    with _LOCK:
        watched = [h for h, at in _WATCHED.items() if _clock() - at < WATCH_FOR_S and h not in have]
    out = []
    for hex_id in watched:
        if _heard_elsewhere_now(hex_id) is not None:
            continue
        _watch(hex_id)
        track = _recorded(hex_id)
        if not track:
            continue
        last = track[-1]
        age = _wall() - last["t"]
        nm = distance_nm(lat, lon, last["lat"], last["lon"])
        if age <= STALE_S and nm <= radius_nm:
            out.append({**last["plane"], "seen_s": round(age, 1)})
    return out
