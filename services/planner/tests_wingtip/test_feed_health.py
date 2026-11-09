"""wingtip.feed_health: each SWIM feed held to what it normally does
(STDDS, TFMS and FNS stale on silence; ITWS and SFDPS quiet by nature,
stale only when down), every feed stale when ingest stops beating, the
weather by the weather service's own answer, and the watch that turns a
feed stale long enough into an alert, once, and ends it once."""
import requests

from wingtip import feed_health

NOW = 1_800_000_000.0


def _beats(**feeds):
    beats = {"ingest": {"at": NOW - 5, "feeds": list(feeds)}}
    beats.update(feeds)
    return beats


def _by_name(lines):
    return {line["name"]: line for line in lines}


def test_busy_feeds_are_stale_on_silence_and_quiet_ones_only_when_down():
    lines = _by_name(feed_health.swim(_beats(
        STDDS={"connected": True, "last_at": NOW - 5, "messages": 10},
        TFMS={"connected": True, "last_at": NOW - 600},
        FNS={"connected": True, "last_at": NOW - 900},
        ITWS={"connected": True, "last_at": NOW - 6 * 3600},
        SFDPS={"connected": False, "error": "Login failure"},
    ), NOW))
    assert lines["STDDS"]["state"] == "ok"
    assert lines["TFMS"]["state"] == "stale" and "no message for 10 min" in lines["TFMS"]["detail"]
    assert lines["FNS"]["state"] == "ok"
    # Six hours without an alert is a calm night, not an outage.
    assert lines["ITWS"]["state"] == "ok" and "quiet by nature" in lines["ITWS"]["detail"]
    assert lines["SFDPS"]["state"] == "stale" and "Login failure" in lines["SFDPS"]["detail"]


def test_a_connected_busy_feed_that_has_sent_nothing_is_stale():
    lines = _by_name(feed_health.swim(_beats(STDDS={"connected": True, "last_at": None}), NOW))
    assert lines["STDDS"]["state"] == "stale"


def test_every_feed_is_stale_when_ingest_stops_beating():
    beats = _beats(STDDS={"connected": True, "last_at": NOW - 1}, ITWS={"connected": True})
    beats["ingest"]["at"] = NOW - 300
    lines = _by_name(feed_health.swim(beats, NOW))
    assert lines["STDDS"]["state"] == lines["ITWS"]["state"] == "stale"
    assert "ingest's last beat 5 min ago" in lines["ITWS"]["detail"]
    nothing = _by_name(feed_health.swim({}, NOW))
    assert all(line["state"] == "stale" for line in nothing.values())


def test_a_feed_ingest_does_not_read_is_off_not_stale():
    lines = _by_name(feed_health.swim(_beats(STDDS={"connected": True, "last_at": NOW}), NOW))
    assert lines["TFMS"]["state"] == "off"


class _Response:
    ok = True

    def __init__(self, body):
        self.body = body

    def json(self):
        return self.body


def test_the_weather_by_the_services_own_answer():
    body = {"products": {
        "metars": {"fetched_at": NOW - 60, "stale": False},
        "tafs": {"fetched_at": NOW - 9000, "stale": True, "failing": True, "error": "HTTP 503"},
    }}
    lines = _by_name(feed_health.weather_feeds("http://weather:8000", NOW, get=lambda url, **kw: _Response(body)))
    assert lines["metars"]["state"] == "ok"
    assert lines["tafs"]["state"] == "stale" and "HTTP 503" in lines["tafs"]["detail"]


def test_a_weather_service_not_answering_is_one_stale_line(monkeypatch):
    monkeypatch.setattr(feed_health.weather, "dataset_status", lambda: {"metars": NOW - 60})

    def down(url, **kw):
        raise requests.ConnectionError("refused")

    lines = feed_health.weather_feeds("http://weather:8000", NOW, get=down)
    assert lines[0]["name"] == "weather service" and lines[0]["state"] == "stale"
    assert lines[1]["name"] == "metars" and lines[1]["state"] == "ok"


def test_the_watch_alerts_once_after_the_wait_and_ends_once():
    watch = feed_health.Watch(after_s=900)
    stale = [{"name": "TFMS", "kind": "swim", "state": "stale"}]
    fine = [{"name": "TFMS", "kind": "swim", "state": "ok"}]
    lines, began, ended = watch.see(stale, NOW)
    assert lines[0]["stale_since"] == NOW and not lines[0]["alerting"] and began == [] == ended
    lines, began, ended = watch.see(stale, NOW + 899)
    assert not lines[0]["alerting"] and began == []
    lines, began, ended = watch.see(stale, NOW + 900)
    assert lines[0]["alerting"] and [b["name"] for b in began] == ["TFMS"]
    lines, began, ended = watch.see(stale, NOW + 960)
    assert lines[0]["alerting"] and began == []                      # said once
    lines, began, ended = watch.see(fine, NOW + 1000)
    assert lines[0]["stale_since"] is None and [e["name"] for e in ended] == ["TFMS"]
    # Stale again: the wait starts over.
    lines, began, ended = watch.see(stale, NOW + 1100)
    assert lines[0]["stale_since"] == NOW + 1100 and not lines[0]["alerting"]
