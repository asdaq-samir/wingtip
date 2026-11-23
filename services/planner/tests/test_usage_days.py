"""Each day's calls by route kept on disk (app.usage_days) and read by the
gateway's nightly rollup (/api/usage/daily): totals by route template,
tied to no pilot, the day in progress held back until it is over."""

from contextlib import closing
from datetime import date

from fastapi.testclient import TestClient

from app import usage_days
from app.main import app

client = TestClient(app)


def test_calls_are_totalled_by_template_per_day_and_survive_a_flush(monkeypatch):
    monkeypatch.setattr(usage_days, "_today", lambda: date(2026, 11, 22))
    for _ in range(2):
        usage_days.count("/api/airport/{ident}", "GET", 200)
    usage_days.flush()
    usage_days.count("/api/airport/{ident}", "GET", 200)
    usage_days.count("/api/plan", "GET", 502)
    usage_days.flush()
    monkeypatch.setattr(usage_days, "_today", lambda: date(2026, 11, 23))
    usage_days.count("/api/plan", "GET", 200)  # today's: held back
    assert usage_days.days(date(2026, 11, 1)) == [
        {"day": "2026-11-22", "route": "/api/airport/{ident}", "method": "GET", "status": 200, "calls": 3},
        {"day": "2026-11-22", "route": "/api/plan", "method": "GET", "status": 502, "calls": 1},
    ]


def test_a_call_answered_is_counted_by_its_template_never_what_was_asked():
    client.get("/api/terrain-tile/14/0/0.png")  # a 404 of its own
    usage_days.flush()
    with closing(usage_days._open(usage_days.STORE)) as db:
        rows = db.execute("SELECT route, status, calls FROM daily").fetchall()
    assert ("/api/terrain-tile/{z}/{x}/{y}.png", 404, 1) in rows
    assert not any("14/0/0" in route for route, _, _ in rows)


def test_days_past_the_keep_are_dropped(monkeypatch):
    monkeypatch.setattr(usage_days, "_today", lambda: date(2026, 1, 1))
    usage_days.count("/api/plan", "GET", 200)
    usage_days.flush()
    monkeypatch.setattr(usage_days, "_today", lambda: date(2026, 6, 1))
    usage_days.flush()
    assert usage_days.days(date(2025, 1, 1)) == []


def test_the_gateway_reads_the_finished_days(monkeypatch):
    monkeypatch.setattr(usage_days, "_today", lambda: date(2026, 11, 22))
    usage_days.count("/api/plan", "GET", 200)
    monkeypatch.setattr(usage_days, "_today", lambda: date(2026, 11, 23))
    body = client.get("/api/usage/daily", params={"since": "2026-11-22"}).json()
    assert body == {"days": [{"day": "2026-11-22", "route": "/api/plan", "method": "GET", "status": 200, "calls": 1}]}
