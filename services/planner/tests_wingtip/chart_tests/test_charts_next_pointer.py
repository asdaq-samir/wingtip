"""The next chart cycle staged in the published pointer (wingtip.chart_publish,
chart_serving.served_of, chart_upkeep's _stage_next): every planner drawing
from the cloud turns over at 0901Z on the cycle's date by its own clock,
the minute before still on the old cycle, rather than when a render lands."""

import datetime as dt
import json

import pytest
from wingtip import chart_publish, chart_serving, chart_upkeep, data_cycles

from .helpers import _Bucket

POINTER = {
    "cycle": "10-29-2026",
    "archives": {"sec": {"1": "sec-old.pmtiles"}},
    "next": {"cycle": "12-24-2026", "archives": {"sec": {"1": "sec-new.pmtiles"}}},
}


def _clock(monkeypatch, when: str):
    monkeypatch.setattr(data_cycles, "now", lambda: dt.datetime.fromisoformat(when).replace(tzinfo=dt.timezone.utc))


@pytest.mark.parametrize(
    ("when", "served"),
    [("2026-12-24T09:00", "10-29-2026"), ("2026-12-24T09:01", "12-24-2026"), ("2026-12-24T09:02", "12-24-2026")],
)
def test_the_pointers_next_cycle_is_served_from_0901z(monkeypatch, when, served):
    _clock(monkeypatch, when)
    got = chart_serving.served_of(POINTER)
    assert got["cycle"] == served and "next" not in got


def test_a_pointer_naming_a_cycle_not_yet_in_force_is_never_drawn(monkeypatch):
    _clock(monkeypatch, "2026-12-23T12:00")
    assert chart_serving.served_of({"cycle": "12-24-2026"}) is None
    assert chart_serving.served_of(None) is None


def test_a_cycle_published_before_its_date_is_staged_as_next(tmp_path, monkeypatch):
    monkeypatch.setattr(chart_publish.config, "CHART_TILE_CACHE_DIR", tmp_path / "tiles")
    monkeypatch.setattr(chart_publish.chart_archives, "pack_complete", lambda cycle, kinds=None: {})
    monkeypatch.setattr(chart_serving, "pyramid_status", lambda cycle: {})
    client = _Bucket()
    client.put_object("b", "tiles/serving.json", json.dumps({"cycle": "10-29-2026"}).encode(), "application/json", "")
    _clock(monkeypatch, "2026-12-18T08:30")
    chart_publish.publish("12-24-2026", "b", prefix="tiles", client=client)
    pointer = json.loads(client.objects[("b", "tiles/serving.json")][0])
    assert pointer["cycle"] == "10-29-2026" and pointer["next"]["cycle"] == "12-24-2026"
    assert chart_publish.bucket_cycle("b", prefix="tiles", client=client) == "10-29-2026"
    assert chart_publish.bucket_next("b", prefix="tiles", client=client) == "12-24-2026"
    # The morning after its date the bucket's served cycle is the new one,
    # so the 0830Z run draws nothing again.
    _clock(monkeypatch, "2026-12-25T08:30")
    assert chart_publish.bucket_cycle("b", prefix="tiles", client=client) == "12-24-2026"


def test_the_refresh_stages_the_next_cycle_in_its_lead_once(monkeypatch):
    calls = []
    monkeypatch.setattr(chart_upkeep, "build_cycle", lambda cycle, kinds, workers: calls.append(("build", cycle)) or True)
    monkeypatch.setattr(chart_upkeep.chart_publish, "publish", lambda cycle, bucket, client=None: calls.append(("publish", cycle)))
    staged = {"next": None}
    monkeypatch.setattr(chart_upkeep.chart_publish, "bucket_next", lambda bucket, client=None: staged["next"])
    # Eight days ahead: before the week's lead.
    _clock(monkeypatch, "2026-12-16T08:30")
    chart_upkeep._stage_next(("sec",), 2, "b")
    assert calls == []
    _clock(monkeypatch, "2026-12-17T08:30")
    chart_upkeep._stage_next(("sec",), 2, "b")
    assert calls == [("build", "12-24-2026"), ("publish", "12-24-2026")]
    staged["next"] = "12-24-2026"
    chart_upkeep._stage_next(("sec",), 2, "b")
    assert len(calls) == 2
