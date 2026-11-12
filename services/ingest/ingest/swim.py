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
- ITWS's alerts for an airport (microburst, wind shear, gust front,
  tornado, storm cells) to wingtip.itws, and SFDPS's special activity
  airspace status to wingtip.saa, both in wingtip.live_reports' store,
  as are STDDS's runway visual range (wingtip.rvr), D-ATIS
  (wingtip.datis) and tower departure events (wingtip.departures), and
  TFMS's ground stops, delay programs and restrictions (wingtip.flow).

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
minutes. Nothing here states a figure: a NOTAM's reading (notams_fns) and
a track's course and speed (velocity_track) are the engine's.
"""

import logging
import math
import re
import threading
import time

from wingtip import datis, departures, filed_routes, flow, itws, notams, rvr, saa, traffic

from .radar_tracks import tracks
from .settings import get_settings

log = logging.getLogger(__name__)

#: What every connection needs, and each feed's own (its VPN and queue),
#: from the subscription's Details page.
SETTINGS = ("SWIM_HOST", "SWIM_USERNAME", "SWIM_PASSWORD")
FEEDS = ("STDDS", "FNS", "TFMS", "ITWS", "SFDPS")
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
_FIRST_PLACE = re.compile(rb"<lat>(-?[\d.]+)</lat><lon>(-?[\d.]+)</lon>")
#: A track's Mode S address as the message writes it, either case.
_ADDRESS = re.compile(rb"<acAddress>\s*([0-9A-Fa-f]{6})\s*</acAddress>")


def _bytes(data: bytes | str) -> bytes:
    return data.encode("utf-8", "replace") if isinstance(data, str) else data


def _nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """About how far apart two places are, nm, on a flat chart a minute of
    latitude to the mile: near enough to say a facility is out of sight
    with hundreds of miles to spare, and cheap enough for every message."""
    return 60.0 * math.hypot(lat2 - lat1, (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2)))


def _in_view(lat: float, lon: float, views, margin: float) -> bool:
    return any(_nm(lat, lon, v_lat, v_lon) <= radius + margin for v_lat, v_lon, radius in views)


def raw(message) -> bytes | str:
    """A message's bytes as they came, handed on so a handler looks in them
    before it decodes them; its text where the client has no bytes."""
    try:
        payload = message.get_payload_as_bytes()
    except Exception:  # noqa: BLE001 -- the client's error for a payload of the other kind
        payload = None
    return payload if payload else body(message)


def _names_one(data: bytes | str, followed) -> bool:
    """Whether a radar message has a track of a followed airplane: its
    addresses read in one pass. A search of the whole message for each
    followed address, in both cases, was a third of the radar thread's
    work and a sixth of the reading process's, with 21 followed (py-spy,
    2026-11-06), and grew with each one; this is a thirteenth of it for
    a message of 20 tracks (12 against 158 us in the planner's image)
    and a fiftieth for one of 100."""
    return bool(followed) and any(a.decode("ascii").lower() in followed for a in _ADDRESS.findall(_bytes(data)))


def select(data: bytes | str, views, followed) -> list[tuple[dict, float]]:
    """A radar message's tracks worth keeping: the airplanes round the
    places the map shows traffic (`views`, each (lat, lon, radius nm)), and
    the followed ones (`followed`, their addresses) wherever they are. A
    message from a facility far from every view and naming no followed
    airplane is not parsed at all, which is most of them: the country's
    tracks, parsed as they come, took the planner's time from the planning
    a pilot waits on. Looked at in its bytes, and decoded only to be parsed."""
    data = _bytes(data)
    if b"TATrackAndFlightPlan" not in data[:300]:
        return []
    first = _FIRST_PLACE.search(data)
    near = first is not None and _in_view(float(first[1]), float(first[2]), views, FACILITY_SPAN_NM)
    if not near and not _names_one(data, followed):
        return []
    return [
        (plane, at)
        for plane, at in tracks(data.decode("utf-8", "replace"))
        if plane["hex"] in followed or _in_view(plane["lat"], plane["lon"], views, VIEW_MARGIN_NM)
    ]


#: What a kind of message must hold to be worth handing on: TFMS's flight
#: plans and amendments with a route of flight ("routeOfFlight",
#: "newRouteOfFlight"), the only ones wingtip.filed_routes keeps. The rest
#: of its flight data, the country's tracks, is acknowledged and dropped
#: undecoded.
WORTH_SENDING = {("TFMS", "flightData"): b"outeOfFlight", ("TFMS", "tfmDataService"): b"outeOfFlight"}


def worth_sending(feed: str, name: str, payload: bytes | str) -> bool:
    """Whether a message of `feed` and kind `name` is handed on at all."""
    worth = WORTH_SENDING.get((feed, name))
    return worth is None or worth in _bytes(payload)


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


def _radar(data: bytes | str) -> int:
    """A radar message's tracks round the places the map shows traffic,
    and the followed ones wherever they are, into the store."""
    found = select(data, *WANTED[0])
    for plane, at in found:
        traffic.heard_elsewhere(plane, at)
    return len(found)


def text(handler):
    """A handler that reads text, handed a message's bytes decoded."""

    def handle_text(payload: bytes | str) -> int:
        return handler(payload.decode("utf-8", "replace") if isinstance(payload, (bytes, bytearray)) else payload)

    handle_text.reads = handler
    return handle_text


#: What each feed's messages are handed to, by their kind (topic_kind,
#: else kind), "*" for every kind of the feed; each gives how many items
#: it kept. A kind with no handler is counted and acknowledged unread: its
#: payload is never fetched from the client, let alone decoded.
HANDLERS: dict[str, dict] = {
    # The radar's tracks; each runway's RVR, the D-ATIS and the tower's
    # departure events. TAIS's status and TDLS's clearances are not read.
    "STDDS": {
        "TATrackAndFlightPlan": _radar,
        "RVRDataUpdateMessage": rvr.heard,
        "DATISData": datis.heard,
        "TowerDepartureEventMessage": departures.heard,
    },
    "FNS": {"*": text(notams.heard)},
    # TFMS's flight data, by its topic's kind or, where a message comes
    # with no topic, its root element.
    "TFMS": {
        "flightData": filed_routes.heard,
        "tfmDataService": filed_routes.heard,
        # Its flow information's programs and restrictions, not its
        # flight lists or flow constrained areas (wingtip.flow).
        "flow GADV": flow.heard,
        "flow RSTR": flow.heard,
    },
    # ITWS's alert products for an airport, not its maps (wingtip.itws.KEPT),
    # by the product number its topic gives, or its root with no topic.
    "ITWS": {**{f"product {number}": itws.heard for number in itws.KEPT}, "itws_msg": itws.heard},
    # SFDPS's airspace messages, each looked at for its special activity
    # airspace's status (wingtip.saa): every message type of its
    # AirspaceAIXM data, or an AIXMBasicMessage with no topic.
    "SFDPS": {"AirspaceAIXM": saa.heard, "AIXMBasicMessage": saa.heard},
}


def handler_for(feed: str, name: str):
    """The handler a message of this kind is handed to, or None: its
    kind's, its kind's first word's ("AirspaceAIXM SU_AIXM"), or its
    feed's for every kind ("*")."""
    handlers = HANDLERS.get(feed, {})
    return handlers.get(name) or handlers.get(name.split(" ")[0]) or handlers.get("*")


#: A message's first element's name, its namespace prefix left off:
#: "TATrackAndFlightPlan", "AIXMBasicMessage", "tfmDataService".
_ROOT = re.compile(rb"<(?![?!])(?:[\w.-]+:)?([\w.-]+)")


def kind(payload: bytes | str) -> str:
    """What sort of message this is, by its first element: how a message
    that came with no topic is counted and handed on (topic_kind)."""
    found = _ROOT.search(_bytes(payload[:400]))
    return found[1].decode("ascii", "replace") if found else "?"


#: STDDS's topics, "<system>/<sendTo>/<blockAtFAA>/<msgType>/<place>/<TRACON>"
#: ("TAIS/all/false/FP/FSD/R90", "APDS/all/false/RR/KACY/N90": SWIM STDDS's
#: topic scheme, as the owner's queue carried it on 2026-11-09), named by
#: the root element each type's messages have. TDES's other types (GR, ID,
#: PD, RD...) are TDLS's clearances (TDLSCSPMessage).
STDDS_KINDS = {
    "TAIS/FP": "TATrackAndFlightPlan",
    "TAIS/ST": "TAStatus",
    "APDS/RR": "RVRDataUpdateMessage",
    "TDES/DD": "DATISData",
    "TDES/DE": "TowerDepartureEventMessage",
}


def topic_kind(feed: str, topic: str | None) -> str | None:
    """What sort of message this is, from the topic the broker routed it
    by, without its payload, which is fetched from the client only where
    a handler wants that kind (handle). None where the topic does not say;
    the message is then known by its first element (kind)."""
    parts = (topic or "").split("/")
    if feed == "STDDS" and len(parts) >= 4:
        name = f"{parts[0]}/{parts[3]}"
        return STDDS_KINDS.get(name) or ("TDLSCSPMessage" if parts[0] == "TDES" else name)
    if feed == "TFMS" and parts[0] == "TFMSR14Flow":
        # "TFMSR14Flow/FlowInformation/ALL/A/sensReason/GADV": the flow
        # message's type is the topic's last word.
        return f"flow {parts[-1]}"
    if feed == "TFMS" and parts[0] == "TFMSR14":
        return "flightData"
    if feed == "ITWS" and parts[0] == "ITWS_Alert" and len(parts) >= 2:
        # "ITWS_Alert/9834/MCO/MCO": the product's number, then its site and airport.
        return f"product {parts[1]}"
    if feed == "SFDPS" and parts[0] == "FDPS" and len(parts) >= 3:
        # "FDPS/AirspaceAIXM/SU_AIXM/...": its data type, then its message type.
        return f"{parts[1]} {parts[2]}"
    return None


def _topic(message) -> str | None:
    """The topic a message came by; None where the client gives none."""
    try:
        return message.get_destination_name()
    except Exception:  # noqa: BLE001 -- a message with no destination, or a test's
        return None


def handle(feed: str, message) -> None:
    """One message counted by its kind and handed to that kind's handler,
    where it has one. Its kind is read from its topic, and its payload
    fetched only for a handler: a third of STDDS (TAIS's status messages)
    and most of TFMS's flow messages (their flight lists) are wanted by
    none. The kinds counted show in the feed's beat what each queue
    carries, kept or not (#489)."""
    state = STATE[feed]
    name = topic_kind(feed, _topic(message))
    payload = None
    if name is None:
        payload = raw(message)
        name = kind(payload)
    handler = handler_for(feed, name)
    if handler is not None:
        payload = raw(message) if payload is None else payload
        if worth_sending(feed, name, payload):
            state["items"] += handler(payload)
    kinds = state.setdefault("kinds", {})
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
            service = (
                MessagingService.builder()
                .from_properties(
                    {
                        "solace.messaging.transport.host": _host(feed),
                        "solace.messaging.service.vpn-name": _feed(feed, "vpn"),
                        "solace.messaging.authentication.scheme.basic.username": settings.swim_username,
                        "solace.messaging.authentication.scheme.basic.password": settings.swim_password,
                    }
                )
                .with_transport_security_strategy(
                    # The FAA's certificate checked against the image's own CAs.
                    TLS.create().with_certificate_validation(
                        True, validate_server_name=True, trust_store_file_path=settings.swim_trust_store
                    )
                )
                .with_reconnection_retry_strategy(RetryStrategy.parametrized_retry(5, 3000))
                .build()
            )
            service.connect()
            receiver = service.create_persistent_message_receiver_builder().build(Queue.durable_exclusive_queue(_feed(feed, "queue")))
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
