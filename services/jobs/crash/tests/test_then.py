"""crash.then and kit.fill: a kit is given the history claude/studio-2
keeps -- IEM's METARs and TAFs of the fields near the place over the
event's hour, the NOTAMs and TFRs in force at its moment from that day's
snapshot, and the NTSB's case on the event's local date, quoted as it
wrote it -- each once it can be whole, and asked again on a later run
until then. The answers are the planner's recorded ones
(services/planner/tests_wingtip/fixtures/history: IEM's KORD and KMDW of
2026-11-10, rows of the NTSB's avall.mdb of 2026-11-01)."""

import csv
import datetime as dt
import json
from pathlib import Path

import pytest
from wingtip import crash_drafts
from wingtip.history import iem, notam_archive, weather_then
from wingtip.history import ntsb as ntsb_store

from crash import kit, ntsb, then

HISTORY = Path(__file__).resolve().parents[3] / "planner" / "tests_wingtip" / "fixtures" / "history"
DAY = dt.date(2026, 11, 10)
#: 20:30 CST on 9 November in Chicago is 02:30 UTC on the 10th, inside
#: the recorded METARs' hours (00:51 to 03:53 UTC).
AT = dt.datetime(2026, 11, 10, 2, 30, tzinfo=dt.timezone.utc).timestamp()
LATER = AT + 86400
NTSB_TABLES = {
    "events": "ntsb_events.csv",
    "aircraft": "ntsb_aircraft.csv",
    "narratives": "ntsb_narratives.csv",
    "Events_Sequence": "ntsb_events_sequence.csv",
    "eADMSPUB_DataDictionary": "ntsb_data_dictionary.csv",
}


def _ntsb_rows(table: str):
    with (HISTORY / NTSB_TABLES[table]).open(newline="", encoding="utf-8") as f:
        yield from csv.DictReader(f)


@pytest.fixture(autouse=True)
def stores(tmp_path, monkeypatch):
    """Every store in the test's own folder: the drafts, IEM's kept days,
    the NOTAM archive and the NTSB's, this one built from the recorded rows."""
    monkeypatch.setattr(crash_drafts, "_folder", lambda: tmp_path)
    iem.reset()
    monkeypatch.setattr(iem, "_store_path", lambda: tmp_path / "studio_weather.sqlite")
    monkeypatch.setattr(notam_archive, "archive_dir", lambda: tmp_path / "archive")
    monkeypatch.setattr(notam_archive, "_position", lambda loc: {"KORD": (41.98, -87.90)}.get(loc))
    path = tmp_path / "ntsb.sqlite"
    ntsb_store.build(_ntsb_rows, path)
    monkeypatch.setattr(ntsb_store, "store_path", lambda: path)
    yield
    iem.reset()


@pytest.fixture
def recorded_iem(monkeypatch):
    """IEM's recorded answers for 2026-11-10, none for another day; the
    fields near the place those two."""
    asos = (HISTORY / "iem_asos_2026-11-10.csv").read_text()
    taf = (HISTORY / "iem_taf_2026-11-10.txt").read_text()

    def reports(kind, stations, day, today=None):
        if day != DAY:
            return {s: [] for s in stations}
        return iem.read_metars(asos, stations) if kind == "metar" else iem.read_tafs(taf, stations, day)

    monkeypatch.setattr(iem, "day_reports", reports)
    monkeypatch.setattr(weather_then, "stations_near", lambda points: ["KORD", "KMDW"])


@pytest.fixture
def chicago():
    facts = {"local_date": "2026-11-09", "local_time": "20:30", "city": "Chicago", "state": "IL", "aircraft": "Cessna 172"}
    draft_id = crash_drafts.upsert(facts, {"source": "faa_statement", "text": "A Cessna 172 crashed in Chicago, Illinois."})
    return crash_drafts.update(draft_id, status="ready", track="none", lat=41.98, lon=-87.90, place="town")


def test_the_moment_is_the_reported_local_time_where_the_state_keeps_one_offset(chicago):
    assert then.moment(chicago) == AT


def test_with_two_offsets_the_moment_is_the_tracks_report_nearest_the_place(chicago):
    # Florida keeps Eastern and Central time: the reported time alone is not one moment.
    two = crash_drafts.update(chicago["id"], state="FL", identity={"nearest": {"t": AT + 60, "lat": 0, "lon": 0, "distance_nm": 1}})
    assert then.moment(two) == AT + 60
    assert then.moment(crash_drafts.update(chicago["id"], identity=None)) is None


def test_the_weather_is_the_fields_reports_over_the_events_hour(chicago, recorded_iem):
    found = then.weather(chicago, AT, LATER)
    times = [m["time"] for m in found["metars"]]
    # From an hour before the hour's start (the METAR in force then) to an hour after the moment.
    assert times[0] == "2026-11-10T00:51:00Z" and times[-1] == "2026-11-10T02:53:00Z"
    assert found["metars"][0]["raw"].startswith("KORD 100051Z")
    assert {t["station"] for t in found["tafs"]} == {"KORD", "KMDW"}
    assert found["credit"] == iem.CREDIT and found["at"] == AT


def test_the_weather_waits_for_the_hour_after_and_for_iem(chicago, recorded_iem, monkeypatch):
    assert then.weather(chicago, AT, AT + 600) is None

    def refused(*a, **k):
        raise iem.WeatherHistoryUnavailable("503")

    monkeypatch.setattr(weather_then, "weather_then", refused)
    assert then.weather(chicago, AT, LATER) is None


def _archive(items: list[dict]) -> None:
    notam_archive._write(notam_archive.archive_dir() / "notams" / f"{DAY.isoformat()}.json.gz", {i["id"]: i for i in items})


def test_the_notams_in_force_at_the_moment_near_the_place(chicago):
    in_force = {
        "id": "ORD 11/090",
        "location": "KORD",
        "start": "2026-11-10T02:00:00Z",
        "end": "2026-11-10T04:00:00Z",
        "text": "!ORD 11/090",
    }
    after = {**in_force, "id": "ORD 11/091", "start": "2026-11-10T05:00:00Z", "text": "!ORD 11/091"}
    _archive([in_force, after])
    found = then.notams(chicago, AT, LATER)
    assert found["archived"] is True and [n["id"] for n in found["notams"]] == ["ORD 11/090"]
    assert found["notams"][0]["text"] == "!ORD 11/090"


def test_no_snapshot_waits_while_the_day_is_today_and_is_said_once_it_has_gone(chicago):
    assert then.notams(chicago, AT, AT + 600) is None
    assert then.notams(chicago, AT, LATER)["archived"] is False


def test_the_ntsb_case_is_the_one_on_the_events_local_date_as_written():
    record = ntsb.record("N5393W", "2026-10-22")
    (case,) = record["cases"]
    assert case["ntsb_no"] == "CEN27LA029" and case["narrative_kind"] == "preliminary"
    assert record["credit"] == ntsb_store.CREDIT
    # The store's day either side is not the event's.
    assert ntsb.record("N5393W", "2026-10-23") is None
    assert ntsb.record("", "2026-10-22") is None


def test_fill_writes_what_can_be_given_and_quotes_the_ntsb_in_the_captions(chicago, recorded_iem):
    tracked = crash_drafts.update(chicago["id"], n_number="N5393W", local_date="2026-10-22")
    kit.make(tracked, None, now=1.0)
    folder = crash_drafts.kit_dir(tracked["id"])
    assert (folder / "ntsb.json").exists()
    words = json.loads((folder / "lead.json").read_text())["captions"]
    (quote,) = [q for q in words["quotes"] if q["source"].startswith("NTSB")]
    assert quote["source"] == "NTSB (preliminary report CEN27LA029)"
    assert quote["words"] == ntsb.record("N5393W", "2026-10-22")["cases"][0]["narrative"]
    assert ntsb_store.CREDIT in words["credits"]
    # Nothing more to give, and the parts written are not asked again.
    assert kit.fill(tracked, now=2.0) == []


def test_fill_adds_the_weather_and_notams_on_a_later_run(chicago, recorded_iem):
    kit.make(chicago, None, now=AT + 600)
    folder = crash_drafts.kit_dir(chicago["id"])
    assert not (folder / "weather.json").exists() and not (folder / "notams.json").exists()
    assert kit.fill(chicago, now=LATER) == ["notams", "weather"]
    assert json.loads((folder / "weather.json").read_text())["metars"]
