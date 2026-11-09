"""app.feeds: a feed stale for FEED_ALERT_AFTER_MIN is said once --
the log, the webhook, the hooks -- and said again when it is back; a hook
that raises keeps the others from nothing; GET /api/status/feeds answers
the last check with ISO times."""

import logging

from fastapi.testclient import TestClient
from wingtip import feed_health as lines_of

from app.feeds import watch as feed_health
from app.main import app

NOW = 1_800_000_000.0


def _stale(monkeypatch, state="stale"):
    monkeypatch.setattr(
        lines_of,
        "check",
        lambda url, now=None: [
            {
                "name": "TFMS",
                "kind": "swim",
                "what": "flight plans",
                "state": state,
                "detail": "no message for 10 min",
                "last_at": NOW - 600,
            }
        ],
    )


def test_an_alert_is_said_once_and_its_end_once(monkeypatch, caplog):
    monkeypatch.setattr(feed_health, "_watch", lines_of.Watch(after_s=15 * 60))
    monkeypatch.setattr(feed_health, "AFTER_MIN", 15)
    monkeypatch.setattr(feed_health, "WEBHOOK", "http://hooks.example/feeds")
    posted, heard = [], []
    monkeypatch.setattr(feed_health.requests, "post", lambda url, json, timeout: posted.append((url, json)))

    def broken(event):
        raise RuntimeError("mail down")

    monkeypatch.setattr(feed_health, "HOOKS", [broken, heard.append])
    _stale(monkeypatch)
    caplog.set_level(logging.INFO, logger="app.feeds.watch")

    feed_health.check(NOW)
    feed_health.check(NOW + 14 * 60)
    assert posted == [] and heard == []
    lines = feed_health.check(NOW + 15 * 60)
    assert lines[0]["alerting"]
    assert [e["event"] for e in heard] == ["stale"] and heard[0]["feed"] == "TFMS"
    assert heard[0]["stale_since"].startswith("2027-01-15")
    assert posted[0][0] == "http://hooks.example/feeds" and posted[0][1]["event"] == "stale"
    assert "feed TFMS stale for 15 min or more" in caplog.text
    assert "feed alert hook" in caplog.text  # the broken hook logged, the next still heard
    feed_health.check(NOW + 20 * 60)
    assert len(heard) == 1  # said once

    _stale(monkeypatch, "ok")
    feed_health.check(NOW + 21 * 60)
    assert [e["event"] for e in heard] == ["stale", "back"] and posted[-1][1]["event"] == "back"


def test_the_endpoint_answers_the_last_check(monkeypatch):
    monkeypatch.setattr(feed_health, "_watch", lines_of.Watch(after_s=900))
    monkeypatch.setattr(feed_health, "_last", {"at": 0.0, "lines": None})
    monkeypatch.setattr(feed_health, "HOOKS", [])
    monkeypatch.setattr(feed_health, "WEBHOOK", None)
    _stale(monkeypatch)
    body = TestClient(app).get("/api/status/feeds").json()
    assert body["alert_after_min"] == feed_health.AFTER_MIN and body["webhook"] is False
    tfms = body["feeds"][0]
    assert tfms["name"] == "TFMS" and tfms["state"] == "stale" and not tfms["alerting"]
    assert tfms["last_at"].endswith("+00:00") and tfms["stale_since"]


def test_the_status_page_rows_say_which_feeds_are_not_updating():
    """The weather rows by the watch's lines, and the NOTAMs, radar and
    satellite rows of their own; a feed not set up has none."""
    from app.feeds import status_rows

    sources = [{"name": "METARs", "key": "metars", "fetched_at": None, "kept_until": None, "failing": False}]
    lines = [
        {"name": "metars", "kind": "weather", "state": "stale", "last_at": NOW - 9000},
        {"name": "radar", "kind": "weather", "state": "ok", "last_at": NOW - 120},
        {"name": "FNS", "kind": "swim", "state": "stale", "last_at": NOW - 3 * 3600},
        {"name": "satellite", "kind": "weather", "state": "off", "last_at": None},
        {"name": "TFMS", "kind": "swim", "state": "stale", "last_at": NOW - 600},
    ]
    rows = {r["name"]: r for r in status_rows.mark(sources, lines)}
    assert rows["METARs"]["stale"] is True
    assert rows["Radar (NEXRAD)"]["stale"] is False and rows["Radar (NEXRAD)"]["fetched_at"] == "2027-01-15T07:58:00Z"
    assert rows["NOTAMs"]["stale"] is True
    assert "Satellite (GOES)" not in rows and "TFMS" not in rows
