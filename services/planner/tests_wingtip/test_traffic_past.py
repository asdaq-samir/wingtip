"""wingtip.traffic: an airplane's past flights, its trace cut where it went
unheard and each end named by the field it was at, read from the archive."""

import time
from unittest.mock import Mock, patch

import pytest
import requests
from cachetools import TTLCache

from wingtip import airports, traffic
from wingtip.traffic import adsb_lol, flights

from .traffic_world import CESSNA, _answer, _turned_away, stand_in
from .traffic_world import adsbx_fixture, clock_fixture  # noqa: F401 -- the fixtures, by the names the runner gives them


def _trace_of(base: float, rows: list) -> dict:
    """A readsb trace: [seconds, lat, lon, altitude, gs, track, flags, vrate, ...]."""
    return {"icao": "a89c1e", "r": "N654FL", "t": "P28A", "timestamp": base, "trace": rows}


def _fly(t0: float, t1: float, start: tuple, end: tuple, low: float, high: float, track: float) -> list:
    """A flight heard each minute from `start` to `end`: climbing from `low`
    to `high` in its first quarter and down to `low` in its last."""
    rows, n = [], int((t1 - t0) // 60)
    for i in range(n + 1):
        f = i / n
        alt = low + (high - low) * min(1.0, f * 4, (1 - f) * 4)
        rows.append([t0 + i * 60, start[0] + (end[0] - start[0]) * f, start[1] + (end[1] - start[1]) * f, round(alt), 100, track, 0, 0])
    return rows


LACONIA = {
    "ident": "LCI",
    "name": "Laconia Municipal Airport",
    "municipality": "Laconia",
    "region": "US-NH",
    "elevation_ft": 545.0,
    "distance_nm": 0.6,
    "bearing_deg": 0,
}


LAWRENCE = {
    "ident": "LWM",
    "name": "Lawrence Municipal Airport",
    "municipality": "Lawrence",
    "region": "US-MA",
    "elevation_ft": 148.0,
    "distance_nm": 1.1,
    "bearing_deg": 0,
}


def _nearest(lat, lon, limit=3):
    """LCI near 43.57 N, LWM near 42.72 N, nothing between."""
    if lat > 43.4:
        return [LACONIA]
    if lat < 42.9:
        return [LAWRENCE]
    return [{**LACONIA, "distance_nm": 40.0}]


def test_an_airplanes_flights_are_its_trace_cut_where_it_went_unheard_and_named_by_their_fields(clock, monkeypatch):
    """N654FL's morning as FlightAware lists it: LWM to LCI, an hour on the
    ground unheard at Laconia, then LCI back to LWM; each heard first and last
    low by its field, newest first."""
    import datetime as dt

    base = 1791676800.0  # 2026-10-11 00:00 UTC
    lwm, lci = (42.72, -71.12), (43.57, -71.42)
    rows = _fly(11 * 3600 + 21 * 60, 12 * 3600 + 8 * 60, lwm, lci, 600, 4500, 10) + _fly(
        13 * 3600 + 4 * 60, 15 * 3600 + 17 * 60, lci, lwm, 800, 5000, 190
    )
    stand_in(monkeypatch, "_trace", lambda hex_id: _trace_of(base, rows))
    stand_in(monkeypatch, "_day_trace", lambda hex_id, day: None)
    monkeypatch.setattr(airports, "nearest", _nearest)
    monkeypatch.setattr(time, "time", lambda: base + 20 * 3600)
    found = traffic.history("A89C1E", today=dt.date(2026, 10, 11))
    assert found["registration"] == "N654FL" and found["type"] == "P28A"
    assert [(f["origin"]["ident"], f["destination"]["ident"]) for f in found["flights"]] == [("LCI", "LWM"), ("LWM", "LCI")]
    newest = found["flights"][0]
    assert newest["off"] == base + 13 * 3600 + 4 * 60 and newest["on"] == base + 15 * 3600 + 17 * 60
    assert newest["landed"] is True and newest["in_air"] is False and newest["max_alt_ft"] == 5000
    # Its points, for the track log and the replay.
    flight = traffic.past_flight("a89c1e", newest["id"], today=dt.date(2026, 10, 11))
    assert flight["points"][0]["t"] == newest["off"] and flight["points"][-1]["t"] == newest["on"]
    assert max(p["alt_ft"] for p in flight["points"]) == 5000
    assert flight["points"][0]["gs_kt"] == 100 and flight["points"][1]["track_deg"] == 190
    assert traffic.past_flight("a89c1e", 123, today=dt.date(2026, 10, 11)) is None


def test_a_flight_heard_last_high_on_its_way_has_no_arrival_and_one_heard_now_is_in_the_air(clock, monkeypatch):
    import datetime as dt

    base = 1791676800.0
    lwm, lci, between = (42.72, -71.12), (43.57, -71.42), (43.10, -71.30)
    # Last heard between the fields, high; then one from LCI heard now.
    rows = (
        _fly(3600, 3600 + 30 * 60, lwm, between, 600, 4500, 10)[:24] + _fly(6 * 3600, 6 * 3600 + 20 * 60, lci, between, 800, 5000, 190)[:12]
    )
    stand_in(monkeypatch, "_trace", lambda hex_id: _trace_of(base, rows))
    stand_in(monkeypatch, "_day_trace", lambda hex_id, day: None)
    monkeypatch.setattr(airports, "nearest", _nearest)
    monkeypatch.setattr(time, "time", lambda: base + 6 * 3600 + 13 * 60)
    flights = traffic.history("a89c1e", today=dt.date(2026, 10, 11))["flights"]
    assert flights[0]["in_air"] is True and flights[0]["destination"] is None and flights[0]["origin"]["ident"] == "LCI"
    assert flights[1]["destination"] is None and flights[1]["landed"] is False and flights[1]["origin"]["ident"] == "LWM"


def test_a_past_days_trace_is_read_from_the_archive_once(clock):
    import datetime as dt

    flights._DAYS.clear()
    day = dt.date(2026, 10, 10)
    with patch("requests.get", return_value=_answer([])) as get:
        get.return_value.status_code = 200
        get.return_value.json = Mock(return_value=_trace_of(1791590400.0, []))
        assert flights._day_trace("a89c1e", day)["r"] == "N654FL"
        flights._day_trace("a89c1e", day)
    assert get.call_count == 1
    assert get.call_args.args[0] == "https://adsb.lol/globe_history/2026/10/10/traces/1e/trace_full_a89c1e.json"


def test_a_flight_last_heard_heading_down_to_a_field_further_out_landed_there(clock, monkeypatch):
    """N654FL's LWM to LCI, 2026-10-11: last heard 6 nm out and 1,600 ft over
    Laconia, levelled off for the pattern but headed straight at it."""
    monkeypatch.setattr(airports, "nearest", lambda lat, lon, limit=3: [{**LACONIA, "distance_nm": 6.1, "bearing_deg": 247}])
    last = {"lat": 43.6127, "lon": -71.2897, "alt_ft": 2175.0, "track_deg": 246.2, "vrate_fpm": -64.0}
    assert flights._field_at(last, landing=True)["ident"] == "LCI"
    # Headed away from it, or high over it, it is only passing.
    assert flights._field_at({**last, "track_deg": 66.0}, landing=True) is None
    assert flights._field_at({**last, "alt_ft": 6000.0}, landing=True) is None


def test_a_past_day_that_could_not_be_read_is_counted_not_taken_for_no_flights(clock, monkeypatch):
    import datetime as dt

    flights._DAYS.clear()
    stand_in(monkeypatch, "_trace", lambda hex_id: None)
    with patch("requests.get", side_effect=requests.Timeout("slow")):
        found = traffic.history("a89c1e", today=dt.date(2026, 10, 11))
    # A fortnight asked for, today's from the recent trace and thirteen days before.
    assert found["flights"] == [] and found["unread_days"] == traffic.HISTORY_DAYS_PER_ASK - 1
    # And asked again next time, not kept as a day without a trace.
    assert not flights._DAYS


def _days_of_flights(per_day: int):
    """`_day_trace` for an airplane that flies `per_day` hops LWM-LCI every
    day, each an hour, from 08:00 UTC; and the days asked for."""
    import datetime as dt

    asked = []
    lwm, lci = (42.72, -71.12), (43.57, -71.42)

    def day_trace(hex_id, day):
        asked.append(day)
        base = dt.datetime(day.year, day.month, day.day, tzinfo=dt.timezone.utc).timestamp()
        rows = []
        for n in range(per_day):
            there, back = (lwm, lci) if n % 2 == 0 else (lci, lwm)
            rows += _fly(8 * 3600 + n * 7200, 9 * 3600 + n * 7200, there, back, 600, 4500, 10)
        return _trace_of(base, rows)

    return day_trace, asked


def test_the_last_ten_flights_found_and_the_ten_before_them_from_where_it_left_off(clock, monkeypatch):
    """The owner's ask: the last ten flights found, whatever the days, and
    more on asking, from where the list ends."""
    import datetime as dt

    day_trace, asked = _days_of_flights(3)
    stand_in(monkeypatch, "_day_trace", day_trace)
    stand_in(monkeypatch, "_trace", lambda hex_id: None)
    monkeypatch.setattr(airports, "nearest", _nearest)
    today = dt.date(2026, 10, 11)
    first = traffic.history("a89c1e", today=today)
    assert len(first["flights"]) == traffic.HISTORY_FLIGHTS
    # Newest first, three a day back from yesterday: the tenth on the 7th.
    offs = [f["off"] for f in first["flights"]]
    assert offs == sorted(offs, reverse=True)
    last = first["flights"][-1]
    assert dt.datetime.fromtimestamp(last["id"], dt.timezone.utc).date() == dt.date(2026, 10, 7)
    # Read a week side by side, not more than it took.
    assert min(asked) >= today - dt.timedelta(days=traffic.HISTORY_BATCH)
    assert first["next_until"] == "2026-10-07"
    # The ten before: none of the first ten again, and in order after them.
    more = traffic.history("a89c1e", until=dt.date.fromisoformat(first["next_until"]), before=last["id"], today=today)
    assert len(more["flights"]) == traffic.HISTORY_FLIGHTS
    assert max(f["off"] for f in more["flights"]) < last["off"]
    assert not {f["id"] for f in more["flights"]} & {f["id"] for f in first["flights"]}


def test_an_airplane_that_seldom_flies_is_looked_for_a_fortnight_at_a_time(clock, monkeypatch):
    import datetime as dt

    day_trace, asked = _days_of_flights(0)
    stand_in(monkeypatch, "_day_trace", day_trace)
    stand_in(monkeypatch, "_trace", lambda hex_id: None)
    today = dt.date(2026, 10, 11)
    found = traffic.history("a89c1e", today=today)
    assert found["flights"] == [] and len(asked) == traffic.HISTORY_DAYS_PER_ASK - 1
    assert found["next_until"] == (today - dt.timedelta(days=traffic.HISTORY_DAYS_PER_ASK)).isoformat()
    # A date picked: from that day back.
    asked.clear()
    traffic.history("a89c1e", until=dt.date(2026, 9, 20), today=today)
    assert max(asked) == dt.date(2026, 9, 20)
    # And past the archive's reach nothing is asked, and nothing is said to be older.
    asked.clear()
    old = traffic.history("a89c1e", until=today - dt.timedelta(days=traffic.ARCHIVE_DAYS + 5), today=today)
    assert asked == [] and old["next_until"] is None


def test_a_view_panned_into_a_new_region_while_adsb_lol_waits_is_given_a_region_that_holds_it(clock):
    """Over Indiana zoomed out, then in on Lafayette while adsb.lol was
    turning the planner away: the wide region's answer, not a 503."""
    with patch("requests.get", return_value=_answer([CESSNA])):
        traffic.near(40.0, -86.0, 150)  # the wide region, out to 250 nm
    clock.now += traffic.MIN_GAP_S
    with patch("requests.get", return_value=_turned_away()):
        with pytest.raises(traffic.TrafficUnavailable):
            adsb_lol._region_answer(adsb_lol._region(41.0, -87.0, 150))  # another wide region, refused
    # Now in the back-off: a near view by Lafayette is held by the first wide region's answer.
    with patch("requests.get") as get:
        found = traffic.near(40.4, -86.9, 30)
    assert get.call_count == 0 and found["age_s"] == traffic.MIN_GAP_S
    # One no answer holds still says so.
    with pytest.raises(traffic.TrafficUnavailable):
        traffic.near(30.0, -97.0, 30)


def test_a_flight_abroad_is_named_by_its_own_airports(clock, monkeypatch):
    """A Vueling A320 over Spain: no US field near, so Barcelona's."""
    monkeypatch.setattr(airports, "nearest", lambda lat, lon, limit=3: [{**LACONIA, "distance_nm": 3000.0}])
    monkeypatch.setattr(
        airports,
        "nearest_abroad",
        lambda lat, lon, limit=3: [
            {
                "ident": "LEBL",
                "name": "Josep Tarradellas Barcelona-El Prat Airport",
                "municipality": "Barcelona",
                "region": "ES-CT",
                "elevation_ft": 12.0,
                "distance_nm": 1.5,
                "bearing_deg": 70,
            }
        ],
    )
    landing = {"lat": 41.29, "lon": 2.05, "alt_ft": 900.0, "track_deg": 70.0, "vrate_fpm": -700.0}
    assert flights._field_at(landing, landing=True)["ident"] == "LEBL"


def test_the_bases_asked_for_are_given_as_they_are_found(clock, monkeypatch):
    lwm = {"ident": "LWM", "name": "Lawrence", "city": None, "region": None}
    stand_in(monkeypatch, "_BASED", TTLCache(maxsize=16, ttl=60))
    stand_in(monkeypatch, "_BASED_PENDING", set())
    looked = []

    class Now:
        """The pool, run at once."""

        def submit(self, fn, *args):
            looked.append(args[0])
            fn(*args)

    stand_in(monkeypatch, "_BASED_POOL", Now())
    # From what is kept alone: a base spends none of OpenSky's credits.
    stand_in(
        monkeypatch, "history", lambda hex_id, ask: {"flights": [] if ask else [{"origin": lwm, "destination": lwm, "landed": True}] * 3}
    )
    first = traffic.based(["A89C1E", "~abcdef", "nothex"])
    # Not known yet: looked up (the address only, not a pseudo-address or
    # what is not one), and said to be pending.
    assert first == {"based": {}, "pending": ["a89c1e"]}
    # Kept: the next ask is answered from what was found, not looked up again.
    again = traffic.based(["a89c1e"])
    assert again == {"based": {"a89c1e": lwm}, "pending": []}
    assert looked == ["a89c1e"]
