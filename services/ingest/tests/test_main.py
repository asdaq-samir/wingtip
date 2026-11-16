"""ingest.main and ingest.health: the beat in the live store, each feed's
state beside it, the radar's stale reports dropped, and the health check
that reads the beat back."""

import threading

from wingtip import traffic
from wingtip.traffic import store

from ingest import health, main, swim


def test_a_beat_writes_ingests_and_each_feeds_state_and_drops_the_stale_radar(monkeypatch):
    monkeypatch.setitem(swim.STATE, "STDDS", {"connected": True, "messages": 370, "items": 2, "last_at": 1.0, "error": None})
    plane = {"hex": "a3c858", "lat": 42.58, "lon": -88.25}
    store.radar_heard(plane, 1.0)
    main.beat(["STDDS"])
    beats = store.beats()
    assert beats["ingest"]["feeds"] == ["STDDS"]
    assert beats["STDDS"]["connected"] and beats["STDDS"]["messages"] == 370
    # Heard at the epoch's first second: long past STALE_S.
    assert store.radar_one("a3c858", 0.0) is None


def test_healthy_while_the_beat_is_fresh():
    assert health.problem() == "no beat written yet"
    # A store with no beat in it yet.
    store.beat("STDDS", 1000.0)
    assert health.problem() == "no beat written yet"
    store.beat("ingest", 1000.0)
    assert health.problem(now=1030.0) is None
    assert "more than 60" in health.problem(now=1061.0)


def test_run_beats_until_stopped_and_starts_no_feed_without_settings(monkeypatch):
    for name in ("SWIM_HOST", "SWIM_USERNAME", "SWIM_PASSWORD"):
        monkeypatch.delenv(name, raising=False)
    # adsb.fi off: no request leaves the test.
    monkeypatch.setenv("ADSBFI_OPEN_DATA", "0")
    stop = threading.Event()
    beats = []
    monkeypatch.setattr(main, "beat", lambda feeds: (beats.append(feeds), stop.set()))
    main.run(stop)
    assert beats == [[]]


def test_ingest_follows_the_airplanes_the_planner_follows():
    """A card opened in the planner (traffic.follow) is in the store, so
    ingest's radar and adsb.fi rounds look for it."""
    traffic.follow("A3C858")
    assert traffic.radar_wanted()[1] == {"a3c858"}


def test_the_followed_airplanes_are_a_job_where_adsbfi_is_on(monkeypatch):
    for name in ("SWIM_HOST", "SWIM_USERNAME", "SWIM_PASSWORD"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("ADSBFI_OPEN_DATA", "1")
    stop = threading.Event()
    jobs = []
    monkeypatch.setattr(main.schedule, "every", lambda on, seconds, job, *, name, **kw: jobs.append((name, seconds, job)))

    class Scheduler:
        def start(self):
            stop.set()

        def shutdown(self, wait):
            pass

    monkeypatch.setattr(main.schedule, "scheduler", Scheduler)
    main.run(stop)
    assert ("adsb-follow", traffic.FOLLOW_EVERY_S, traffic.follow_job) in jobs
