"""The day's NOTAM and TFR archive (wingtip.history.notam_archive): the
stores merged into the UTC day's files by id, idempotently, old days let
go, and a moment's NOTAMs and TFRs read back: those in force then inside
the box, and "not archived" for a day with no file."""

import datetime as dt

import pytest

from wingtip import notams, weather_store
from wingtip.history import notam_archive

NOW = dt.datetime(2026, 11, 10, 15, 0, tzinfo=dt.timezone.utc)
AT_NOON = dt.datetime(2026, 11, 10, 12, 0, tzinfo=dt.timezone.utc).timestamp()
KORD_NOTAM = {
    "id": "ORD 11/123",
    "location": "ORD",
    "icao_location": "KORD",
    "starts": "2026-11-10T10:00:00Z",
    "ends": "2026-11-10T14:00:00Z",
    "text": "RWY 10L/28R CLSD",
    "raw": "!ORD 11/123 ORD RWY 10L/28R CLSD 2611101000-2611101400",
}
LATER = {**KORD_NOTAM, "id": "ORD 11/124", "starts": "2026-11-10T16:00:00Z", "ends": None, "raw": "!ORD 11/124 ORD TWY B CLSD"}
CENTRE = {**KORD_NOTAM, "id": "ZAU 11/001", "location": "ZAU", "icao_location": "KZAU", "raw": "!ZAU 11/001 ZAU AIRSPACE"}
TFR = {
    "notam_id": "6/1234",
    "title": "CHICAGO, IL, Sunday, November 10, 2026 local time",
    "kind": "Security",
    "effective": "2026-11-10T11:00:00Z",
    "expires": "2026-11-10T13:00:00Z",
    "text": "!FDC 6/1234 ZAU IL..AIRSPACE CHICAGO, IL..TEMPORARY FLIGHT RESTRICTIONS",
    "geometry": {"type": "MultiPolygon", "coordinates": [[[[-87.912345, 41.9], [-87.8, 41.9], [-87.8, 42.0], [-87.912345, 41.9]]]]},
}
CHICAGO = {"lat_min": 41.5, "lat_max": 42.5, "lon_min": -88.5, "lon_max": -87.5}


@pytest.fixture(autouse=True)
def _stores(monkeypatch, tmp_path):
    # The archive in the test's own folder, never the data folder's.
    monkeypatch.setattr(notam_archive, "archive_dir", lambda: tmp_path / "archive")
    kept = [KORD_NOTAM, LATER, CENTRE]
    monkeypatch.setattr(notams, "every", lambda: [dict(n) for n in kept])
    monkeypatch.setattr(notam_archive, "_position", lambda loc: {"KORD": (41.98, -87.90)}.get(loc))
    weather_store.write("tfrs", [TFR], fetched_at=NOW.timestamp(), until=None)
    return kept


def test_a_snapshot_merges_into_the_days_file_by_id_and_can_run_again(_stores):
    assert notam_archive.snapshot(NOW) == {"notams": 3, "tfrs": 1}
    # The store lets the first go; the day's file keeps it.
    _stores.pop(0)
    assert notam_archive.snapshot(NOW) == {"notams": 3, "tfrs": 1}
    assert (notam_archive.archive_dir() / "notams" / "2026-11-10.json.gz").exists()


def test_a_moments_notams_and_tfrs_in_force_inside_the_box():
    notam_archive.snapshot(NOW)
    then = notam_archive.as_it_was(AT_NOON, **CHICAGO)
    assert then["archived"] is True and then["day"] == "2026-11-10"
    # The later one had not begun; the centre's is at no field.
    assert [(n["id"], n["lat"], n["lon"]) for n in then["notams"]] == [("ORD 11/123", 41.98, -87.90)]
    assert then["notams"][0]["text"] == KORD_NOTAM["raw"]
    (tfr,) = then["tfrs"]
    assert tfr["id"] == "6/1234" and tfr["name"].startswith("CHICAGO")
    # Its area kept to four places.
    assert tfr["geometry"]["coordinates"][0][0][0] == [-87.9123, 41.9]


def test_out_of_the_box_or_out_of_its_time_is_not_given():
    notam_archive.snapshot(NOW)
    denver = notam_archive.as_it_was(AT_NOON, lat_min=39.0, lat_max=40.5, lon_min=-105.5, lon_max=-104.0)
    assert denver["notams"] == [] and denver["tfrs"] == []
    evening = notam_archive.as_it_was(AT_NOON + 6 * 3600, **CHICAGO)
    assert [n["id"] for n in evening["notams"]] == ["ORD 11/124"]
    assert evening["tfrs"] == []


def test_a_day_with_no_file_is_not_archived():
    then = notam_archive.as_it_was(AT_NOON - 86400, **CHICAGO)
    assert then == {"archived": False, "day": "2026-11-09", "notams": [], "tfrs": []}


def test_days_past_keeping_are_let_go():
    notam_archive.snapshot(NOW - dt.timedelta(days=notam_archive.KEEP_DAYS + 1))
    notam_archive.snapshot(NOW)
    days = sorted(p.name for p in (notam_archive.archive_dir() / "notams").glob("*.json.gz"))
    assert days == ["2026-11-10.json.gz"]
