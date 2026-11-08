"""The FAA's SWIM feeds, read as they come (the owner's SCDS subscriptions,
2026-10-19), each into the store the planner reads.

- STDDS's terminal radar tracks -- TAIS, every STARS facility's tracks
  with each airplane's Mode S address, its beacon code, its reported
  altitude and, where it has one, its flight plan -- to wingtip.traffic as
  reports heard elsewhere (the live store, wingtip.traffic.store). That
  puts on the map the airplanes no ADS-B network hears (N3429J, a UAT
  airplane adsb.lol never had), and records the flights of the airplanes
  a pilot follows from takeoff, card open or not.
- FNS's NOTAMs, each as the NOTAM System issues, replaces or cancels it,
  to wingtip.notams' store.
- TFMS's flight data, the NAS's flight plans and their amendments, to
  wingtip.filed_routes' store, which counts the routes pilots file between
  two fields.

One connection a feed to its subscription's durable queue, on a thread of
its own: each message read, handed on, then acknowledged. The radar's
tracks are kept only round the places the map looks and for the
followed airplanes (radar_wanted, read from the store each second): the
country's tracks, parsed as they come, took most of a core at STDDS's 370
messages a second (py-spy, 2026-10-28). They were read in the planner's
process until #535 moved them here, so a restart of the planner drops no
feed and the reading takes nothing from the planning a pilot waits on.

A feed is off where its SWIM_* settings are not all set (ingest.settings);
a dropped connection is made again after a pause, growing to a few
minutes. Nothing here states a figure: a NOTAM's reading is the engine's
(wingtip.notams calls notams_fns), and a track is passed on as sent.
"""
import logging
import math
import re
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime

from wingtip import filed_routes, notams, traffic

from .settings import get_settings

log = logging.getLogger(__name__)

#: What every connection needs, and each feed's own (its VPN and queue),
#: from the subscription's Details page.
SETTINGS = ("SWIM_HOST", "SWIM_USERNAME", "SWIM_PASSWORD")
FEEDS = ("STDDS", "FNS", "TFMS")
#: How long to wait before connecting again, s, doubling to the most.
RETRY_FIRST_S, RETRY_MOST_S = 10.0, 300.0


def _feed(feed: str, name: str) -> str | None:
    """A feed's own setting, SWIM_<NAME>_<FEED>."""
    return getattr(get_settings(), f"swim_{name}_{feed.lower()}")


def _host(feed: str) -> str:
    """The broker a feed's subscription is on: its own where SCDS put it
    on another (TFMS's on ems1, the others' on ems2), else the shared one."""
    return _feed(feed, "host") or get_settings().swim_host


def configured(feed: str) -> bool:
    settings = get_settings()
    return all((settings.swim_host, settings.swim_username, settings.swim_password, _feed(feed, "vpn"), _feed(feed, "queue")))


def _number(element, tag: str) -> float | None:
    text = element.findtext(tag)
    try:
        return float(text) if text not in (None, "") else None
    except ValueError:
        return None


def _when(text: str | None) -> float | None:
    """An ISO time as the feed writes it ("2026-10-20T01:58:25.921Z"), s."""
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def body(message) -> str:
    """A message's text, read from its bytes first: the client raises on
    some of the feed's messages when asked for a string, and one message
    it can't read must not drop the connection. Empty where neither reads."""
    for read in (message.get_payload_as_bytes, message.get_payload_as_string):
        try:
            payload = read()
        except Exception:  # noqa: BLE001 -- the client's error for a payload of the other kind
            continue
        if payload:
            return payload.decode("utf-8", "replace") if isinstance(payload, (bytes, bytearray)) else payload
    return ""


def tracks(xml: str) -> list[tuple[dict, float]]:
    """A TATrackAndFlightPlan message's airborne tracks, each as wingtip.traffic's
    `_aircraft` gives an airplane, and when it was where it is (s): the
    track's Mode S address (`acAddress`), its place, its altitude as the
    transponder reports it (pressure altitude, to the hundred feet), its
    speed and track from its ground velocity (vx, vy, knots east and north;
    STARS's TAIS interface), its climb (vVert, ft/min) and its beacon code;
    the flight plan's ident and type where the track has one. None for a
    track with no address, one coasting or dropped, or on the surface."""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return []
    if not root.tag.endswith("TATrackAndFlightPlan"):
        return []
    out = []
    for record in root.iter("record"):
        track = record.find("track")
        if track is None or track.findtext("status") != "active":
            continue
        address = (track.findtext("acAddress") or "").strip().lower()
        lat, lon = _number(track, "lat"), _number(track, "lon")
        at = _when(track.findtext("mrtTime"))
        # "000000" is no address: a target with no Mode S transponder.
        if len(address) != 6 or address == "000000" or lat is None or lon is None or at is None:
            continue
        vx, vy = _number(track, "vx"), _number(track, "vy")
        plan = record.find("flightPlan")
        ident = (plan.findtext("acid") or "").strip() if plan is not None else ""
        kind = (plan.findtext("acType") or "").strip() if plan is not None else ""
        squawk = (track.findtext("reportedBeaconCode") or "").strip()
        out.append(({
            "hex": address,
            "callsign": ident or None,
            "registration": ident if ident.startswith("N") else None,
            "type": kind or None,
            "lat": round(lat, 5), "lon": round(lon, 5),
            "altitude_ft": _number(track, "reportedAltitude"),
            "pressure_altitude": True,
            "track_deg": round(math.degrees(math.atan2(vx, vy)) % 360, 1) if vx is not None and vy is not None else None,
            "speed_kt": round(math.hypot(vx, vy), 1) if vx is not None and vy is not None else None,
            "vertical_fpm": _number(track, "vVert"),
            "seen_s": None,
            "squawk": squawk or None,
            # 7500 unlawful interference (AIM 6-3-4), 7600 radio failure
            # (AIM 6-4-2), 7700 emergency (AIM 6-2-2).
            "emergency": {"7500": "unlawful", "7600": "nordo", "7700": "general"}.get(squawk),
            "category": None,
        }, at))
    return out


#: How far a facility's tracks can lie from one another, nm: one STARS
#: facility's message holds the tracks of its own radars, 60 nm round each
#: terminal radar (the ASR-9's and ASR-11's instrumented range, FAA
#: surveillance radar fact sheets) and the long-range ARSR some facilities
#: fuse in, so its first track is taken to say where all of them are to
#: within this much.
FACILITY_SPAN_NM = 200.0
#: How far past a view's edge its airplanes are still kept, nm: about a
#: minute of a fast airplane's flying, so one about to come in is there.
VIEW_MARGIN_NM = 10.0
_FIRST_PLACE = re.compile(r"<lat>(-?[\d.]+)</lat><lon>(-?[\d.]+)</lon>")
#: A track's Mode S address as the message writes it, either case.
_ADDRESS = re.compile(r"<acAddress>\s*([0-9A-Fa-f]{6})\s*</acAddress>")


def _nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """About how far apart two places are, nm, on a flat chart a minute of
    latitude to the mile: near enough to say a facility is out of sight
    with hundreds of miles to spare, and cheap enough for every message."""
    return 60.0 * math.hypot(lat2 - lat1, (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2)))


def _in_view(lat: float, lon: float, views, margin: float) -> bool:
    return any(_nm(lat, lon, v_lat, v_lon) <= radius + margin for v_lat, v_lon, radius in views)


def raw(message) -> bytes | str:
    """A message's bytes as they came, for a handler that looks in them
    before it decodes them (RAW); its text where the client has no bytes."""
    try:
        payload = message.get_payload_as_bytes()
    except Exception:  # noqa: BLE001 -- the client's error for a payload of the other kind
        payload = None
    return payload if payload else body(message)



def _names_one(text: str, followed) -> bool:
    """Whether a radar message has a track of a followed airplane: its
    addresses read in one pass. A search of the whole message for each
    followed address, in both cases, was a third of the radar thread's
    work and a sixth of the reading process's, with 21 followed (py-spy,
    2026-11-06), and grew with each one; this is a thirteenth of it for
    a message of 20 tracks (12 against 158 us in the planner's image)
    and a fiftieth for one of 100."""
    return bool(followed) and any(a.lower() in followed for a in _ADDRESS.findall(text))


def select(text: str, views, followed) -> list[tuple[dict, float]]:
    """A radar message's tracks worth keeping: the airplanes round the
    places the map shows traffic (`views`, each (lat, lon, radius nm)), and
    the followed ones (`followed`, their addresses) wherever they are. A
    message from a facility far from every view and naming no followed
    airplane is not parsed at all, which is most of them: the country's
    tracks, parsed as they come, took the planner's time from the planning
    a pilot waits on."""
    if "TATrackAndFlightPlan" not in text[:300]:
        return []
    first = _FIRST_PLACE.search(text)
    near = first is not None and _in_view(float(first[1]), float(first[2]), views, FACILITY_SPAN_NM)
    if not near and not _names_one(text, followed):
        return []
    return [
        (plane, at) for plane, at in tracks(text)
        if plane["hex"] in followed or _in_view(plane["lat"], plane["lon"], views, VIEW_MARGIN_NM)
    ]


#: The feeds whose messages are handed on as their bytes
#: (wingtip.filed_routes.heard looks in them before it decodes them).
RAW = {"TFMS"}
#: What a feed's message must hold to be worth handing on: TFMS's flight
#: plans and amendments with a route of flight ("routeOfFlight",
#: "newRouteOfFlight"), the only ones wingtip.filed_routes keeps. The rest
#: of TFMS, the country's tracks, is acknowledged and dropped unread.
WORTH_SENDING = {"TFMS": b"outeOfFlight"}


def worth_sending(feed: str, payload: bytes | str) -> bool:
    """Whether a message of `feed` is handed on at all."""
    worth = WORTH_SENDING.get(feed)
    if worth is None:
        return True
    return worth in (payload if isinstance(payload, (bytes, bytearray)) else payload.encode("utf-8", "replace"))


#: Each feed's messages read so far, what they gave (tracks, NOTAMs,
#: flight plans), its connection and when the last came: written to the
#: store as the feed's beat (ingest.main), for the health check and a reader.
STATE = {feed: {"connected": False, "messages": 0, "items": 0, "last_at": None, "error": None} for feed in FEEDS}
#: What of the radar is wanted, (views, followed), as the store last said:
#: read once a second (WANTED_EVERY_S), not once a message.
WANTED: list = [([], set())]
#: How often what is wanted is read from the store, s: the map asks for
#: traffic every few seconds, so a second behind is in time.
WANTED_EVERY_S = 1.0


def _radar(text: str) -> int:
    """A radar message's tracks round the places the map shows traffic,
    and the followed ones wherever they are, into the store."""
    found = select(text, *WANTED[0])
    for plane, at in found:
        traffic.heard_elsewhere(plane, at)
    return len(found)


#: What each feed's messages are handed to; each gives how many items it kept.
HANDLERS = {"STDDS": _radar, "FNS": notams.heard, "TFMS": filed_routes.heard}


#: A message's first element's name, its namespace prefix left off:
#: "TATrackAndFlightPlan", "AIXMBasicMessage", "tfmDataService".
_ROOT = re.compile(rb"<(?![?!])(?:[\w.-]+:)?([\w.-]+)")


def kind(payload: bytes | str) -> str:
    """What sort of message this is, by its first element: counted per
    feed (STATE's "kinds"), so what each queue carries besides what is
    kept -- TFMS's flow information, STDDS's other systems -- shows in the
    store before a reader for it is written (#489)."""
    head = payload[:400] if isinstance(payload, (bytes, bytearray)) else payload[:400].encode("utf-8", "replace")
    found = _ROOT.search(head)
    return found[1].decode("ascii", "replace") if found else "?"


def handle(feed: str, message) -> None:
    """One message handed to its feed's handler where it is worth it, and counted."""
    payload = raw(message) if feed in RAW else body(message)
    state = STATE[feed]
    if worth_sending(feed, payload):
        state["items"] += HANDLERS[feed](payload)
    kinds = state.setdefault("kinds", {})
    name = kind(payload)
    # A bounded count: a queue sends a handful of kinds.
    if name in kinds or len(kinds) < 50:
        kinds[name] = kinds.get(name, 0) + 1
    state["messages"] += 1
    state["last_at"] = time.time()


def _run(feed: str, stop: threading.Event) -> None:
    """Connect, read and hand on until `stop` is set, connecting again
    after a pause where the connection drops or cannot be made."""
    from solace.messaging.config.retry_strategy import RetryStrategy
    from solace.messaging.config.transport_security_strategy import TLS
    from solace.messaging.messaging_service import MessagingService
    from solace.messaging.resources.queue import Queue

    settings = get_settings()
    state = STATE[feed]
    pause = RETRY_FIRST_S
    while not stop.is_set():
        service = receiver = None
        try:
            service = (MessagingService.builder().from_properties({
                "solace.messaging.transport.host": _host(feed),
                "solace.messaging.service.vpn-name": _feed(feed, "vpn"),
                "solace.messaging.authentication.scheme.basic.username": settings.swim_username,
                "solace.messaging.authentication.scheme.basic.password": settings.swim_password,
            }).with_transport_security_strategy(
                # The FAA's certificate checked against the image's own CAs.
                TLS.create().with_certificate_validation(True, validate_server_name=True, trust_store_file_path=settings.swim_trust_store))
                .with_reconnection_retry_strategy(RetryStrategy.parametrized_retry(5, 3000)).build())
            service.connect()
            receiver = service.create_persistent_message_receiver_builder().build(
                Queue.durable_exclusive_queue(_feed(feed, "queue")))
            receiver.start()
            state.update(connected=True, error=None)
            log.info("SWIM %s connected", feed)
            pause = RETRY_FIRST_S
            while not stop.is_set():
                message = receiver.receive_message(timeout=5000)
                if message is None:
                    continue
                try:
                    handle(feed, message)
                except Exception:  # noqa: BLE001 -- one message must not end the reading
                    log.warning("SWIM %s: a message not kept", feed, exc_info=True)
                # Acknowledged once kept: the durable queue holds it until then.
                receiver.ack(message)
        except Exception as err:  # noqa: BLE001 -- any failure: connect again after the pause
            error = f"{type(err).__name__}: {str(err)[:200]}"
            state.update(connected=False, error=error)
            log.warning("SWIM %s: %s; connecting again in %.0f s", feed, error, pause)
        finally:
            for closing in (receiver, service):
                try:
                    if closing is receiver and closing is not None:
                        closing.terminate()
                    elif closing is not None:
                        closing.disconnect()
                except Exception:  # noqa: BLE001 -- already gone
                    pass
        stop.wait(pause)
        pause = min(RETRY_MOST_S, pause * 2)


def _want(stop: threading.Event) -> None:
    """What of the radar is wanted, read from the store each second."""
    while not stop.is_set():
        try:
            WANTED[0] = traffic.radar_wanted()
        except Exception:  # noqa: BLE001 -- the store busy: the last answer stands
            log.warning("What the map looks at was not read", exc_info=True)
        stop.wait(WANTED_EVERY_S)


def start(stop: threading.Event) -> list[str]:
    """Each configured feed read on a thread of its own; the feeds started."""
    feeds = [feed for feed in FEEDS if configured(feed)]
    if "STDDS" in feeds:
        threading.Thread(target=_want, args=(stop,), name="swim-wanted", daemon=True).start()
    for feed in feeds:
        threading.Thread(target=_run, args=(feed, stop), name=f"swim-{feed.lower()}", daemon=True).start()
    return feeds
