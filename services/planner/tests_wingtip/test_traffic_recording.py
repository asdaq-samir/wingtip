"""wingtip.traffic: the airplanes a pilot follows -- recorded from adsb.lol
in the background and from ADS-B Exchange where adsb.lol does not hear them, kept across a restart,
and the FAA radar's -- and the pressure altitudes set on the nearest
altimeter."""

import datetime as dt
from unittest.mock import Mock, patch

import pytest

from wingtip import airports, traffic, weather
from wingtip.traffic import common, flights, globe, recorded, store, watched

from .traffic_world import CESSNA, _answer, stand_in
from .traffic_world import adsbx_fixture, clock_fixture  # noqa: F401 -- the fixtures, by the names the runner gives them


def test_an_airplane_whose_card_is_open_and_adsb_lol_does_not_hear_is_recorded_from_ads_b_exchange(clock, monkeypatch):
    """N3429J on 2026-10-19: a UAT airplane, rebroadcast by ADS-R, that
    ADS-B Exchange had and adsb.lol did not; and adsb.lol's globe turning
    the planner's trace reads away. Its card open, it is asked for by its
    address, its track kept, and it is on the map and in its alerts' state."""
    wall = {"now": 1791800000.0}
    stand_in(monkeypatch, "_wall", lambda: wall["now"])
    stand_in(monkeypatch, "_TRACES", {})
    stand_in(monkeypatch, "_paced", lambda url, **kw: {"ac": []})
    asked = []

    def adsbx(path, search=False):
        asked.append(path)
        return [common._aircraft(CESSNA)]

    stand_in(monkeypatch, "_adsbx", adsbx)
    stand_in(monkeypatch, "_recent_trace", lambda hex_id: None)
    # No field near: OurAirports' file is not read here (CI has none to hand).
    monkeypatch.setattr(airports, "nearest", lambda lat, lon, limit=1: [])
    with patch("requests.get", return_value=Mock(status_code=403)):
        first = traffic.flight("a128b9")
        assert asked == ["icao/a128b9"] and [p["lat"] for p in first["trail"]] == [42.30128]
        # Asked again only after WATCH_GAP_S, its new place recorded.
        clock.now += 5
        traffic.flight("a128b9")
        assert len(asked) == 1
        clock.now += traffic.WATCH_GAP_S
        wall["now"] += 25
        moved = common._aircraft({**CESSNA, "lat": 42.4})
        stand_in(monkeypatch, "_adsbx", lambda path, search=False: asked.append(path) or [moved])
        assert len(traffic.flight("a128b9")["trail"]) == 2
    # The map round it has it, which adsb.lol's region answer left out.
    stand_in(monkeypatch, "_region_answer", lambda region: (clock.now, []))
    seen = traffic.near(42.35, -88.15, 30)
    assert [p["hex"] for p in seen["aircraft"]] == ["a128b9"] and "ADS-B Exchange" in seen["source"]
    # Its alerts' state: in the air, from the recorded track.
    state = traffic.status("a128b9")
    assert state["airborne"] and state["aircraft"]["lat"] == 42.4


def test_the_maps_poll_asks_nothing_and_the_watch_round_asks_each_open_card_then_lets_it_go(clock, monkeypatch):
    """Round 6's audit, N1 and N9: a poll asked adsb.lol for every watched
    airplane in the country behind its turn; now only the planner's watch
    round asks, the poll reads the track, and a closed card is let go."""
    stand_in(monkeypatch, "_wall", lambda: 1791800000.0)
    asked = []
    stand_in(monkeypatch, "_paced", lambda url, **kw: asked.append(url) or {"ac": [CESSNA]})
    stand_in(monkeypatch, "_region_answer", lambda region: (clock.now, []))
    watched._WATCHED["a128b9"] = clock.now
    assert traffic.near(42.35, -88.15, 30)["aircraft"] == [] and asked == []
    assert traffic.watch_round() == 1 and len(asked) == 1
    assert [p["hex"] for p in traffic.near(42.35, -88.15, 30)["aircraft"]] == ["a128b9"] and len(asked) == 1
    clock.now += traffic.WATCH_FOR_S
    assert traffic.watch_round() == 0 and len(asked) == 1
    assert watched._WATCHED == {} and watched._WATCH_ASKED == {} and watched._WATCH_SOURCE == {} and watched._ANSWERED == {}


def test_a_followed_airplane_is_asked_of_adsb_lol_in_the_background_and_stays_followed_across_a_restart(clock, monkeypatch, tmp_path):
    """The owner's N3429J (2026-10-19): FlightAware listed its day's two
    flights, the planner nothing -- recorded only while its card was open,
    and its following lost to a restart. Followed, it is asked of adsb.lol
    each round (ingest's), card open or not -- its recent trace first, its
    API by the address where the globe turns the planner away -- and stays
    followed in the store."""
    stand_in(monkeypatch, "_wall", lambda: 1791800000.0)
    traffic.follow("a128b9")
    # A restart: the store opened again, the airplane still followed.
    store.reset()
    assert traffic.followed() == ["a128b9"]
    stand_in(monkeypatch, "_recent_trace", lambda hex_id: globe.UNREAD)
    asked = []
    stand_in(monkeypatch, "_paced", lambda url, **kw: asked.append(url) or {"ac": [CESSNA]})
    assert traffic.follow_round() == 1
    assert asked == ["https://api.adsb.lol/v2/hex/a128b9"]
    assert recorded._recorded("a128b9")[-1]["lat"] == pytest.approx(42.30128, abs=1e-4)
    # One the FAA's radar has just now is not asked for.
    traffic.heard_elsewhere(common._aircraft(CESSNA), 1791800000.0)
    clock.now += 30
    assert traffic.follow_round() == 0
    assert len(asked) == 1


def test_a_follow_round_ends_where_adsb_lol_turns_the_planner_away(clock, monkeypatch):
    stand_in(monkeypatch, "_wall", lambda: 1791800000.0)
    traffic.follow("a128b9")
    traffic.follow("a3c858")
    stand_in(monkeypatch, "_recent_trace", lambda hex_id: globe.UNREAD)
    asked = []

    def refused(url, **kw):
        asked.append(url)
        raise common.TrafficUnavailable("adsb.lol did not answer")

    stand_in(monkeypatch, "_paced", refused)
    assert traffic.follow_round() == 0
    # The first refusal ends the round: the second airplane waits for the next.
    assert len(asked) == 1


def test_a_recorded_airplane_unheard_for_two_minutes_low_over_a_field_has_landed(clock, monkeypatch):
    stand_in(monkeypatch, "_wall", lambda: 1791800000.0)
    stand_in(monkeypatch, "_recent_trace", lambda hex_id: None)
    recorded._record("a128b9", common._aircraft(CESSNA))
    stand_in(monkeypatch, "_wall", lambda: 1791800000.0 + traffic.LANDED_UNHEARD_S + 5)
    c81 = {"ident": "C81", "name": "Campbell", "city": None, "region": None}
    stand_in(monkeypatch, "_field_at", lambda point, landing: c81 if landing else None)
    state = traffic.status("a128b9")
    assert not state["airborne"] and state["arrived"]["ident"] == "C81"


def test_an_airplane_adsb_lol_hears_on_the_ground_has_landed_where_it_is_not_unavailable(clock, monkeypatch):
    # The globe's trace refused and nothing recorded: the API's report of it
    # taxiing is its state (the owner's N570GJ at O'Hare, 2026-11-27).
    stand_in(monkeypatch, "_wall", lambda: 1791800000.0)
    stand_in(monkeypatch, "_recent_trace", lambda hex_id: globe.UNREAD)
    taxiing = {**CESSNA, "alt_baro": "ground", "gs": 10.2, "seen_pos": 24.0}
    stand_in(monkeypatch, "_paced", lambda url, **kw: {"ac": [taxiing]})
    kord = {"ident": "KORD", "name": "Chicago O'Hare Intl", "city": None, "region": None}
    stand_in(monkeypatch, "_field_at", lambda point, landing: kord if landing else None)
    state = traffic.status("a128b9")
    assert not state["airborne"] and state["heard_s"] == 24.0
    assert state["arrived"] == {**kord, "at": 1791800000.0 - 24.0}


def test_an_airplane_nothing_hears_is_not_heard_and_one_none_can_be_asked_of_is_unavailable(clock, monkeypatch):
    stand_in(monkeypatch, "_recent_trace", lambda hex_id: globe.UNREAD)
    stand_in(monkeypatch, "_paced", lambda url, **kw: {"ac": []})
    stand_in(monkeypatch, "_adsbx", lambda path, search=False: [])
    state = traffic.status("a128b9")
    assert state["heard_s"] is None and not state["airborne"]

    def refused(*args, **kwargs):
        raise traffic.TrafficUnavailable("turned away")

    stand_in(monkeypatch, "_paced", refused)
    stand_in(monkeypatch, "_adsbx", refused)
    with pytest.raises(traffic.TrafficUnavailable):
        traffic.status("a0b7d8")


def test_a_recorded_track_begun_in_the_air_says_no_departure(clock, monkeypatch):
    """N3429J's card opened over Burlington at 2,000 ft: not "left KBUU"."""
    monkeypatch.setattr(
        airports, "nearest", lambda lat, lon, limit=1: [{"ident": "KBUU", "name": "Burlington", "distance_nm": 1.2, "elevation_ft": 779}]
    )
    assert flights._left_from({"t": 0.0, "lat": 42.68, "lon": -88.30, "alt_ft": 2075.0}) is None
    assert flights._left_from({"t": 0.0, "lat": 42.68, "lon": -88.30, "alt_ft": 1150.0})["ident"] == "KBUU"


def test_a_watched_flight_is_kept_across_a_restart_and_listed_with_the_archives(clock, monkeypatch):
    """N3429J's flight watched from its card: kept on disk, so a restart of
    the planner still has it, and listed in its last flights where adsb.lol's
    archive, closed behind a browser check, has none."""
    wall = {"now": 1791800000.0}
    stand_in(monkeypatch, "_wall", lambda: wall["now"])
    monkeypatch.setattr(airports, "nearest", lambda lat, lon, limit=1: [])
    for k in range(12):
        wall["now"] = 1791800000.0 + 20 * k
        recorded._record("a128b9", common._aircraft({**CESSNA, "lat": 42.30 + 0.01 * k, "seen_pos": 0}))
    # A restart: the store opened again, the track read back.
    store.reset()
    assert len(recorded._recorded("a128b9")) == 12
    stand_in(monkeypatch, "_trace", lambda hex_id: None)
    stand_in(monkeypatch, "_day_trace", lambda hex_id, day: traffic.UNREAD)
    # Asked on the flight's own day, the stubbed clock's: on the real date
    # it passes out of the archive's ARCHIVE_DAYS (from 2026-11-23 UTC).
    today = dt.datetime.fromtimestamp(wall["now"], dt.timezone.utc).date()
    found = traffic.history("a128b9", limit=5, today=today)
    assert [f["id"] for f in found["flights"]] == [1791800000] and found["flights"][0]["origin"] is None
    replay = traffic.past_flight("a128b9", 1791800000, today=today)
    assert replay is not None and len(replay["points"]) == 12


def test_the_faa_radars_airplanes_are_on_the_map_and_a_followed_ones_flight_recorded(clock, monkeypatch):
    """SWIM's terminal radar (ingest) hears what no ADS-B network may: an
    airplane it tracks is on the map where adsb.lol's region left it out,
    and one whose card has been opened has its flight recorded, a point a
    quarter minute, card open or not."""
    wall = {"now": 1791800000.0}
    stand_in(monkeypatch, "_wall", lambda: wall["now"])
    plane = {**common._aircraft(CESSNA), "hex": "a3c858", "callsign": None, "pressure_altitude": True}
    traffic.heard_elsewhere(plane, wall["now"] - 2)
    stand_in(monkeypatch, "_region_answer", lambda region: (clock.now, []))
    assert [p["hex"] for p in traffic.near(42.35, -88.15, 30)["aircraft"]] == ["a3c858"]
    # Not followed: nothing recorded by the radar itself.
    assert recorded._recorded("a3c858") == []
    # Its card open (watched): its radar report recorded there, nothing
    # asked of adsb.lol, once a quarter minute however often it is asked.
    stand_in(monkeypatch, "_paced", lambda url, **kw: pytest.fail("asked adsb.lol"))
    watched._watch("a3c858")
    watched._watch("a3c858")
    assert len(recorded._recorded("a3c858")) == 1
    traffic.follow("a3c858")
    for k in range(1, 7):
        wall["now"] += 5
        traffic.heard_elsewhere({**plane, "lat": 42.30 + 0.01 * k}, wall["now"])
    # A report every five seconds, recorded every fifteen, after the card's.
    assert len(recorded._recorded("a3c858")) == 3
    # Heard by the radar now: nothing asked of adsb.lol or ADS-B Exchange.
    stand_in(monkeypatch, "_paced", lambda url, **kw: pytest.fail("asked adsb.lol"))
    stand_in(monkeypatch, "_adsbx", lambda path, search=False: pytest.fail("asked ADS-B Exchange"))
    watched._watch("a3c858")
    # Gone quiet past STALE_S: off the map.
    wall["now"] += traffic.STALE_S + 1
    assert traffic.near(42.35, -88.15, 30)["aircraft"] == []


def test_the_faa_radar_is_read_around_the_places_the_map_shows_traffic(clock, monkeypatch):
    """The radar is wanted around each region (test_traffic_privacy) the map
    asked about within a minute, once a region however often it asks, and
    for the followed airplanes wherever they are (ingest reads no others),
    on the wall clock, which ingest reads them by."""
    wall = {"now": 1791800000.0}
    stand_in(monkeypatch, "_wall", lambda: wall["now"])
    traffic.follow("a3c858")
    assert traffic.radar_wanted() == ([], {"a3c858"})
    stand_in(monkeypatch, "_region_answer", lambda region: (clock.now, []))
    traffic.near(42.36, -88.14, 30)
    traffic.near(42.37, -88.13, 30)
    wall["now"] += traffic.LOOKED_S / 2
    traffic.near(33.94, -118.41, 200)
    assert traffic.radar_wanted() == ([(42.5, -88.0, 52), (34.0, -118.0, 250)], {"a3c858"})
    wall["now"] += traffic.LOOKED_S / 2 + 1
    assert traffic.radar_wanted() == ([(34.0, -118.0, 250)], {"a3c858"})
    wall["now"] += traffic.LOOKED_S
    assert traffic.radar_wanted() == ([], {"a3c858"})


def test_pressure_altitudes_are_set_on_the_nearest_altimeter(clock, monkeypatch):
    """The FAA's radar sends pressure altitude (29.92): on a 30.42 day an
    airplane at about 4,460 ft on the altimeter is sent as 4,000. Set on the
    nearest METAR's altimeter: FAA-H-8083-25C Figure 11-3 gives 30.4 "Hg
    -440 ft and 30.5 -531, so 30.42 is -458; a GNSS height is left alone."""
    monkeypatch.setattr(weather, "nearest_report", lambda lat, lon, **kw: {"metar": {"altimeter_in_hg": 30.42}})
    baro = {"hex": "a3c858", "altitude_ft": 4000.0, "pressure_altitude": True}
    gnss = {"hex": "a6ed61", "altitude_ft": 8000.0, "pressure_altitude": False}
    out = traffic.on_altimeter([baro, gnss], 42.3, -88.1)
    assert out[0]["altitude_ft"] == pytest.approx(4458, abs=2) and out[0]["pressure_altitude"] is False
    assert out[1] == gnss
    # None near: as sent, still marked.
    monkeypatch.setattr(weather, "nearest_report", lambda lat, lon, **kw: None)
    assert traffic.on_altimeter([baro], 42.3, -88.1) == [baro]


def test_the_globe_turning_the_planner_away_is_not_asked_again_for_a_while(clock, monkeypatch):
    # adsb.lol's verification wall (2026-10-23): a 403 page for every file.
    stand_in(monkeypatch, "_TRACES", {})
    wall = Mock(status_code=403, headers={"content-type": "text/html"})
    with patch("requests.get", return_value=wall) as get:
        assert globe._trace("a0b7d8") is None
        assert globe._recent_trace("a0b7d8") is traffic.UNREAD
        assert flights._day_trace("a0b7d8", __import__("datetime").date(2026, 10, 22)) is traffic.UNREAD
        assert get.call_count == 1
        clock.now += traffic.GLOBE_BACKOFF_S + 1
        globe._trace("a0b7d8")
        assert get.call_count == 2


def test_an_address_that_is_not_six_hex_digits_is_neither_followed_nor_recorded():
    """A track is kept by the airplane's ICAO address alone: one that is not
    six hex digits (from a feed or a request) is not kept, so junk ids
    cannot grow the store; a TIS-B one's "~" and its case are set aside."""
    traffic.follow("../../escaped")
    recorded._record("../../escaped", {"lat": 1.0, "lon": 1.0})
    assert traffic.followed() == [] and recorded._recorded("../../escaped") == []
    traffic.follow("~A1B2C3")
    assert traffic.followed() == ["a1b2c3"]


def test_a_radar_messages_tracks_are_kept_in_one_write_and_its_followed_ones_recorded(clock, monkeypatch):
    """ingest's whole message at once (heard_all_elsewhere): each track
    kept as its latest, an older report of one left alone, and the
    followed ones, by the set ingest already holds, recorded."""
    wall = {"now": 1791800000.0}
    stand_in(monkeypatch, "_wall", lambda: wall["now"])
    followed_one = {**common._aircraft(CESSNA), "hex": "a3c858", "callsign": None, "pressure_altitude": True}
    other = {**followed_one, "hex": "a6ed61", "lat": 41.98, "lon": -87.9}
    traffic.heard_all_elsewhere([(followed_one, wall["now"] - 2), (other, wall["now"] - 2)], {"a3c858"})
    assert store.radar_heard_many([(other, wall["now"] - 9)]) == [False]
    assert store.radar_one("a6ed61", 0)[1] == wall["now"] - 2
    assert len(recorded._recorded("a3c858")) == 1 and recorded._recorded("a6ed61") == []


def test_a_followed_airplane_nothing_hears_is_asked_for_every_two_minutes_not_each_round(clock, monkeypatch):
    """Followed for 30 days, an airplane on the ground was asked for
    every 30 s all that time. Quiet past FOLLOW_QUIET_AFTER_S it is asked
    every FOLLOW_QUIET_EVERY_S; heard lately, each round."""
    wall = {"now": 1791800000.0}
    stand_in(monkeypatch, "_wall", lambda: wall["now"])
    traffic.follow("a128b9")
    urls = []

    def get(url, **kwargs):
        urls.append(url)
        resp = _answer([])
        resp.status_code = 200
        return resp

    with patch("requests.get", side_effect=get):
        traffic.follow_round()
        clock.now += traffic.FOLLOW_EVERY_S
        traffic.follow_round()
        assert len(urls) == 1, "quiet: not asked again at the next round"
        clock.now += traffic.FOLLOW_QUIET_EVERY_S
        traffic.follow_round()
        assert len(urls) == 2
        # Heard a minute ago: asked each round again.
        recorded._record("a128b9", {**common._aircraft(CESSNA), "seen_s": 60.0})
        clock.now += traffic.FOLLOW_EVERY_S
        traffic.follow_round()
        assert len(urls) == 3


def test_every_tracks_old_points_are_pruned_through_the_index_on_their_time(clock):
    """The planner's minute-by-minute prune read the whole table, keyed by
    (hex, t): 23.9 ms over 500,000 points, 6.3 ms by the index (round 4)."""
    store.record("a128b9", {"t": 100.0}, 0.0)
    store.record("a128b9", {"t": 200.0}, 0.0)
    (plan,) = store._query("EXPLAIN QUERY PLAN DELETE FROM points WHERE t < ?", (150.0,))
    assert "USING INDEX points_t" in plan[-1]
    assert store.forget_points(150.0) == 1
