"""ingest.swim: SWIM's messages read and handed to the stores the planner
reads -- the STDDS terminal radar's tracks to wingtip.traffic's live store,
from a message in the feed's own shape (TATrackAndFlightPlan), FNS's to
wingtip.notams, TFMS's to wingtip.filed_routes."""

from wingtip import traffic

from ingest import swim

MESSAGE = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ns2:TATrackAndFlightPlan xmlns:ns2="urn:us:gov:dot:faa'
    ':atm:terminal:entities:v4-0:tais:terminalautomationinformation"><src>C90</src><record><recSeqNum>1</recSeqNum>'
    '<track><trackNum>3891</trackNum><mrtTime>2026-10-20T01:58:25.921Z</mrtTime><status>active</status><acAddress>A'
    '3C858</acAddress><lat>42.58095</lat><lon>-88.24562</lon><vVert>128</vVert><vx>0</vx><vy>87</vy><adsb>1</adsb><'
    'reportedBeaconCode>1200</reportedBeaconCode><reportedAltitude>2700</reportedAltitude></track></record><record>'
    '<track><mrtTime>2026-10-20T01:58:26.000Z</mrtTime><status>active</status><acAddress>a6ed61</acAddress><lat>41.'
    '9</lat><lon>-87.9</lon><vx>-280</vx><vy>0</vy><reportedBeaconCode>7202</reportedBeaconCode><reportedAltitude>8'
    '000</reportedAltitude></track><flightPlan><acid>UAL2197</acid><acType>A21N</acType></flightPlan></record><reco'
    'rd><track><mrtTime>2026-10-20T01:58:26.000Z</mrtTime><status>coasting</status><acAddress>abe28f</acAddress><la'
    't>41.9</lat><lon>-87.9</lon></track></record><record><track><mrtTime>2026-10-20T01:58:26.000Z</mrtTime><status'
    '>active</status><acAddress>000000</acAddress><lat>41.9</lat><lon>-87.9</lon></track></record></ns2:TATrackAndF'
    'lightPlan>'
)


def test_a_radar_message_gives_each_active_tracks_airplane_with_its_flight_plan():
    found = swim.tracks(MESSAGE)
    assert [p["hex"] for p, _ in found] == ["a3c858", "a6ed61"]
    n3429j, at = found[0]
    assert at == 1792461505.921
    assert (n3429j["altitude_ft"], n3429j["pressure_altitude"], n3429j["squawk"]) == (2700.0, True, "1200")
    # North at 87 kt from its ground velocity.
    assert (n3429j["track_deg"], n3429j["speed_kt"], n3429j["vertical_fpm"]) == (0.0, 87.0, 128.0)
    airliner = found[1][0]
    assert (airliner["callsign"], airliner["type"], airliner["track_deg"], airliner["registration"]) == ("UAL2197", "A21N", 270.0, None)


def test_anything_but_a_track_message_gives_nothing():
    assert swim.tracks('<ns2:TAStatus xmlns:ns2="x"><src>HUF</src></ns2:TAStatus>') == []
    assert swim.tracks("not xml") == []


def _set(monkeypatch, *names):
    for name in names:
        monkeypatch.setenv(name, "set")
    swim.get_settings.cache_clear()


def test_each_feed_is_off_without_its_settings(monkeypatch):
    _set(monkeypatch, *swim.SETTINGS, "SWIM_VPN_STDDS", "SWIM_QUEUE_STDDS", "SWIM_VPN_FNS")
    monkeypatch.delenv("SWIM_QUEUE_FNS", raising=False)
    swim.get_settings.cache_clear()
    assert swim.configured("STDDS") and not swim.configured("FNS")
    monkeypatch.delenv("SWIM_PASSWORD")
    swim.get_settings.cache_clear()
    assert not swim.configured("STDDS")


def test_the_tfms_feed_is_off_without_its_queue(monkeypatch):
    _set(monkeypatch, *swim.SETTINGS, "SWIM_VPN_TFMS")
    monkeypatch.delenv("SWIM_QUEUE_TFMS", raising=False)
    swim.get_settings.cache_clear()
    assert not swim.configured("TFMS")
    _set(monkeypatch, "SWIM_QUEUE_TFMS")
    assert swim.configured("TFMS")


def test_a_feed_on_another_broker_connects_there(monkeypatch):
    monkeypatch.setenv("SWIM_HOST", "tcps://ems2.swim.faa.gov:55443")
    monkeypatch.delenv("SWIM_HOST_FNS", raising=False)
    monkeypatch.setenv("SWIM_HOST_TFMS", "tcps://ems1.swim.faa.gov:55443")
    swim.get_settings.cache_clear()
    assert swim._host("TFMS") == "tcps://ems1.swim.faa.gov:55443"
    assert swim._host("FNS") == "tcps://ems2.swim.faa.gov:55443"


class _Message:
    """A message as the Solace client gives it: one that raises when asked
    for its payload as a string, as some of the feed's do, or for bytes."""

    def __init__(self, raw=None, text=None):
        self.raw, self.text = raw, text

    def get_payload_as_bytes(self):
        if self.raw is None:
            raise RuntimeError("Unable to get payload for the message.")
        return self.raw

    def get_payload_as_string(self):
        if self.text is None:
            raise RuntimeError("Unable to get payload for the message.")
        return self.text


def test_a_message_is_read_from_its_bytes_or_its_string_and_one_neither_reads_is_empty():
    assert swim.body(_Message(raw=MESSAGE.encode())) == MESSAGE
    assert swim.body(_Message(text=MESSAGE)) == MESSAGE
    assert swim.body(_Message()) == ""


def test_the_tracks_kept_are_those_round_a_view_and_the_followed_ones(monkeypatch):
    heard = []
    monkeypatch.setattr(traffic, "heard_elsewhere", lambda plane, at: heard.append(plane["hex"]))
    # The map on Chicago, 20 nm round O'Hare: the airliner over it, not
    # N3429J 39 nm north-west.
    monkeypatch.setattr(swim, "WANTED", [([(41.98, -87.9, 20)], set())])
    assert swim._radar(MESSAGE) == 1 and heard == ["a6ed61"]
    # Both views: both airplanes.
    heard.clear()
    monkeypatch.setattr(swim, "WANTED", [([(41.98, -87.9, 30), (42.6, -88.2, 20)], set())])
    assert swim._radar(MESSAGE) == 2 and heard == ["a3c858", "a6ed61"]
    # Nobody looking: the followed one alone, its address upper case in
    # the message.
    heard.clear()
    monkeypatch.setattr(swim, "WANTED", [([], {"a3c858"})])
    assert swim._radar(MESSAGE) == 1 and heard == ["a3c858"]
    # The map on Los Angeles, none followed in it: the message not parsed.
    monkeypatch.setattr(swim, "tracks", lambda xml: (_ for _ in ()).throw(AssertionError("parsed")))
    monkeypatch.setattr(swim, "WANTED", [([(33.94, -118.41, 165)], {"abcdef"})])
    assert swim._radar(MESSAGE) == 0


def test_the_radar_reaches_the_planners_map_through_the_store(monkeypatch):
    """What ingest keeps is what the planner reads: a view the planner's map
    asked for, read back here as wanted, and the airplane heard over it
    found by the planner's own read of the store. The view is kept as its
    half-degree region, never its own middle (the pilot's position when
    the map follows the airplane, docs/privacy-inventory.md): O'Hare's
    20 nm view is the cell round 42N 88W, its radius widened by half the
    cell's diagonal (21.2 nm) so the circle still holds the whole view."""
    now = 1792461510.0
    monkeypatch.setattr(traffic.radar, "_wall", lambda: now)
    traffic.looked_at(41.98, -87.9, 20)
    swim.WANTED[0] = traffic.radar_wanted()
    try:
        assert swim.WANTED[0] == ([(42.0, -88.0, 42)], set())
        # The wider circle keeps N3429J too, 39 nm out; the planner's read
        # of the view itself leaves it out.
        assert swim._radar(MESSAGE) == 2
    finally:
        swim.WANTED[0] = ([], set())
    seen = traffic.radar._elsewhere_near(41.98, -87.9, 20, set())
    assert [p["hex"] for p in seen] == ["a6ed61"] and seen[0]["seen_s"] == 4.0


def test_tfms_flight_plans_go_to_the_filed_routes_and_notams_to_theirs():
    assert swim.handler_for("TFMS", "flightData") is swim.filed_routes.heard
    assert swim.handler_for("FNS", "AIXMBasicMessage").reads is swim.notams.heard
    assert swim.handler_for("STDDS", "TATrackAndFlightPlan") is swim._radar
    # Nobody reads TAIS's status messages or TFMS's flight lists.
    assert swim.handler_for("STDDS", "TAStatus") is None
    assert swim.handler_for("TFMS", "flow TMI_FLIGHT_LIST") is None


class _Routed(_Message):
    """A message with the topic the broker routed it by, whose payload
    must not be asked for (a kind nobody reads)."""

    def __init__(self, topic, raw=None):
        super().__init__(raw=raw)
        self.topic, self.asked = topic, 0

    def get_destination_name(self):
        return self.topic

    def get_payload_as_bytes(self):
        self.asked += 1
        return super().get_payload_as_bytes()


def test_a_messages_kind_is_read_from_its_topic():
    kind = swim.topic_kind
    assert kind("STDDS", "TAIS/all/false/FP/FSD/R90") == "TATrackAndFlightPlan"
    assert kind("STDDS", "TAIS/all/false/ST/FAI/A11") == "TAStatus"
    assert kind("STDDS", "APDS/all/false/RR/KACY/N90") == "RVRDataUpdateMessage"
    assert kind("STDDS", "TDES/all/false/DD/KMSP/M98") == "DATISData"
    assert kind("STDDS", "TDES/all/false/DE/KSEA/S46") == "TowerDepartureEventMessage"
    assert kind("STDDS", "TDES/all/false/GR/KSEA/S46") == "TDLSCSPMessage"
    assert kind("TFMS", "TFMSR14/4/sourceFacility/sensitivity") == "flightData"
    assert kind("TFMS", "TFMSR14Flow/FlowInformation/ALL/A/sensReason/GADV") == "flow GADV"
    assert kind("ITWS", "ITWS_Alert/9834/MCO/MCO") == "product 9834"
    assert kind("SFDPS", "FDPS/AirspaceAIXM/SU_AIXM/FDPS_OneMinFreq/FDPS_Recon/ZJX/true/false") == "AirspaceAIXM SU_AIXM"
    assert kind("FNS", "anything") is None and kind("STDDS", None) is None


def test_stdds_rvr_datis_and_departures_and_tfms_programs_have_their_readers():
    assert swim.handler_for("STDDS", "RVRDataUpdateMessage") is swim.rvr.heard
    assert swim.handler_for("STDDS", "DATISData") is swim.datis.heard
    assert swim.handler_for("STDDS", "TowerDepartureEventMessage") is swim.departures.heard
    assert swim.handler_for("STDDS", "TDLSCSPMessage") is None
    assert swim.handler_for("TFMS", "flow GADV") is swim.flow.heard
    assert swim.handler_for("TFMS", "flow RSTR") is swim.flow.heard
    assert swim.handler_for("TFMS", "flow FXA") is None


def test_an_rvr_message_reaches_the_planners_store(monkeypatch):
    monkeypatch.setitem(swim.STATE, "STDDS", {"connected": True, "messages": 0, "items": 0, "last_at": None, "error": None})
    message = (
        '<ns2:RVRDataUpdateMessage xmlns:ns2="x"><airport>KACY</airport><runwayData><runwayID><numericRunwayID>13'
        '</numericRunwayID><runwaySubID> </runwaySubID></runwayID><touchdownVisualRange>24</touchdownVisualRange>'
        '<rolloutVisualRange>60</rolloutVisualRange></runwayData></ns2:RVRDataUpdateMessage>'
    )
    swim.handle("STDDS", _Routed("APDS/all/false/RR/KACY/N90", raw=message.encode()))
    assert swim.STATE["STDDS"]["items"] == 1
    [end] = swim.rvr.at_airport("KACY")
    assert (end["runway"], end["touchdown_ft"], end["rollout_ft"]) == ("13", 2400, 6000)


def test_itws_alerts_are_read_and_its_maps_are_not():
    assert swim.handler_for("ITWS", "product 9840") is swim.itws.heard
    assert swim.handler_for("ITWS", "product 9893") is swim.itws.heard
    # The microburst and gust front maps, the TRACON's echo tops.
    for product in ("9832", "9833", "9838", "9858", "9837"):
        assert swim.handler_for("ITWS", f"product {product}") is None
    assert swim.handler_for("SFDPS", "AirspaceAIXM SU_AIXM") is swim.saa.heard
    assert swim.handler_for("SFDPS", "FlightData FH") is None


def test_itws_and_sfdps_are_read_where_their_own_are_set(monkeypatch):
    _set(monkeypatch, *swim.SETTINGS, "SWIM_VPN_ITWS", "SWIM_QUEUE_ITWS")
    monkeypatch.delenv("SWIM_QUEUE_SFDPS", raising=False)
    swim.get_settings.cache_clear()
    assert swim.configured("ITWS") and not swim.configured("SFDPS")
    # Both on the shared broker.
    monkeypatch.setenv("SWIM_HOST", "tcps://ems2.swim.faa.gov:55443")
    swim.get_settings.cache_clear()
    assert swim._host("ITWS") == swim._host("SFDPS") == "tcps://ems2.swim.faa.gov:55443"


def test_a_kind_nobody_reads_is_counted_and_its_payload_never_fetched(monkeypatch):
    monkeypatch.setitem(swim.STATE, "STDDS", {"connected": True, "messages": 0, "items": 0, "last_at": None, "error": None})
    status = _Routed("TAIS/all/false/ST/FAI/A11", raw=b"<ns2:TAStatus/>")
    swim.handle("STDDS", status)
    assert status.asked == 0
    track = _Routed("TAIS/all/false/FP/C90/C90", raw=MESSAGE.encode())
    monkeypatch.setattr(swim, "WANTED", [([], set())])
    swim.handle("STDDS", track)
    assert track.asked == 1
    assert swim.STATE["STDDS"]["kinds"] == {"TAStatus": 1, "TATrackAndFlightPlan": 1}
    assert swim.STATE["STDDS"]["messages"] == 2


def test_each_message_is_handed_to_its_feeds_handler_and_counted_by_kind(monkeypatch):
    texts = []
    monkeypatch.setitem(swim.HANDLERS, "FNS", {"*": swim.text(lambda text: texts.append(text) or 1)})
    monkeypatch.setitem(swim.HANDLERS, "TFMS", {"tfmDataService": lambda data: texts.append(data) or 2})
    for feed in swim.FEEDS:
        monkeypatch.setitem(swim.STATE, feed, {"connected": False, "messages": 0, "items": 0, "last_at": None, "error": None})
    notam = '<?xml version="1.0"?><message:AIXMBasicMessage xmlns:message="m">!ORD 10/123</message:AIXMBasicMessage>'
    swim.handle("FNS", _Message(text=notam))
    plan = b'<ds:tfmDataService><fdm:fltdMessage><nxcm:newRouteOfFlight legacyFormat="KDLH V2 C81"/></fdm:fltdMessage></ds:tfmDataService>'
    swim.handle("TFMS", _Message(raw=plan))
    # A track of the country's: counted, not handed on.
    swim.handle("TFMS", _Message(raw=b"<ds:tfmDataService><fdm:trackInformation/></ds:tfmDataService>"))
    assert texts == [notam, plan]
    assert (swim.STATE["FNS"]["items"], swim.STATE["TFMS"]["items"], swim.STATE["TFMS"]["messages"]) == (1, 2, 2)
    assert swim.STATE["FNS"]["kinds"] == {"AIXMBasicMessage": 1}
    assert swim.STATE["TFMS"]["kinds"] == {"tfmDataService": 2}


def test_a_messages_kind_is_its_first_elements_name():
    assert swim.kind(MESSAGE) == "TATrackAndFlightPlan"
    assert swim.kind(b"<!-- a note --><flowInformation/>") == "flowInformation"
    assert swim.kind("not xml") == "?"


def test_the_reader_picks_the_tracks_round_a_view_and_the_followed_ones():
    pick = swim.select
    assert [p["hex"] for p, _ in pick(MESSAGE, [(41.98, -87.9, 20)], set())] == ["a6ed61"]
    assert [p["hex"] for p, _ in pick(MESSAGE, [], {"a3c858"})] == ["a3c858"]
    assert pick(MESSAGE, [(33.94, -118.41, 165)], {"abcdef"}) == []
    assert pick('<ns2:TAStatus xmlns:ns2="x"><src>HUF</src></ns2:TAStatus>', [(41.98, -87.9, 20)], set()) == []


def test_a_followed_airplane_is_found_by_its_address_in_either_case_and_only_there():
    names = swim._names_one
    assert names(MESSAGE, {"a3c858"}) and names(MESSAGE, {"a6ed61"})
    assert not names(MESSAGE, {"abcdef"}) and not names(MESSAGE, set())
    # The address in another field is not a track of it.
    assert not names("<acid>A3C858</acid>", {"a3c858"})
    assert names("<acAddress> a3c858 </acAddress>", {"a3c858"})


def test_only_tfms_flight_data_with_a_route_of_flight_is_handed_on():
    worth = swim.worth_sending
    assert worth("TFMS", "flightData", b'<nxcm:newRouteOfFlight legacyFormat="KDLH V2 C81"/>')
    assert worth("TFMS", "tfmDataService", "<routeOfFlight/>")
    assert not worth("TFMS", "flightData", b"<fdm:trackInformation><nxcm:qualifiedAircraftId/></fdm:trackInformation>")
    # Every NOTAM goes on.
    assert worth("FNS", "AIXMBasicMessage", "!ORD 10/123 ORD RWY 10L/28R CLSD")
