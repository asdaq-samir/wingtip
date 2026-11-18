"""A route's slow part -- the ground under it -- started as its course is
asked for (app.prefetch), once a route, off the request; and never the
chart's read for its checkpoints, which waits for the pilot to ask for
them (the owner, 2026-11-18)."""

from fastapi.testclient import TestClient

from app import chart_model, prefetch
from app.main import app

client = TestClient(app)
# The real one: the shared fixtures put a still one in its place.
start_reads = prefetch.route


def no_chart_read(*args, **kwargs):
    raise AssertionError("the chart read for checkpoints none asked for")


def test_the_course_starts_the_route_reads(monkeypatch):
    asked = []
    monkeypatch.setattr(prefetch, "route", lambda dep, dest, stops="": asked.append((dep, dest, stops)))
    assert client.get("/api/course", params={"dep": "C81", "dest": "KDLH"}).status_code == 200
    assert asked == [("C81", "KDLH", "")]


def test_the_course_reads_no_chart_for_checkpoints(monkeypatch):
    monkeypatch.setattr(chart_model, "corridor", no_chart_read)
    monkeypatch.setattr(prefetch.terrain, "floor_profile", lambda start, end, breaks: None)
    monkeypatch.setattr(prefetch._POOL, "submit", lambda fn, *args: fn(*args))
    monkeypatch.setattr(prefetch, "_STARTED", type(prefetch._STARTED)(maxsize=8, ttl=600))
    monkeypatch.setattr(prefetch, "route", start_reads)
    body = client.get("/api/course", params={"dep": "C81", "dest": "KDLH", "stops": "KMSN"}).json()
    # Said truthfully all the same: whether the chart is read, not started.
    assert body["checkpoints_ready"] in (True, False)


def test_a_route_is_read_ahead_once_a_while_however_often_its_course_is_asked(monkeypatch):
    queued = []
    monkeypatch.setattr(prefetch, "_STARTED", type(prefetch._STARTED)(maxsize=8, ttl=600))
    monkeypatch.setattr(prefetch._POOL, "submit", lambda fn, *args: queued.append(args))
    start_reads("C81", "KDLH")
    start_reads("c81", "kdlh")
    start_reads("C81", "KMSN")
    assert queued == [("C81", "KDLH", ""), ("C81", "KMSN", "")]


def test_the_read_ahead_is_each_hops_ground_alone(monkeypatch):
    # Not the weather: the weather service keeps it stored (wingtip.weather_store).
    grounds = []
    monkeypatch.setattr(chart_model, "corridor", no_chart_read)
    monkeypatch.setattr(prefetch.terrain, "floor_profile", lambda start, end, breaks: grounds.append(breaks[0]))
    prefetch._read("C81", "KDLH", "KMSN")
    assert grounds == [0.0, 0.0]


def test_a_route_that_does_not_load_reads_nothing(monkeypatch):
    def unknown(*args):
        raise ValueError("no such airport")

    monkeypatch.setattr(prefetch, "load_route", unknown)
    monkeypatch.setattr(prefetch.terrain, "floor_profile", lambda *args: (_ for _ in ()).throw(AssertionError))
    prefetch._read("ZZZZ", "KDLH", "")


def test_a_hop_across_the_country_is_not_read_ahead(monkeypatch):
    grounds = []
    monkeypatch.setattr(prefetch.terrain, "floor_profile", lambda start, end, breaks: grounds.append(start))
    monkeypatch.setattr(prefetch, "MAX_HOP_NM", 100)
    prefetch._read("C81", "KDLH", "KMSN")  # 82 nm, then 255 nm
    assert len(grounds) == 1
