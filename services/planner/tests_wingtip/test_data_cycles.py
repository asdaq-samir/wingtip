"""wingtip.data_cycles: whether each FAA data set the planner uses is
still in its cycle. The rule is the engine's (`data_cycle`), held here to
the shared fixture the engine and the web are held to
(apps/web/src/lib/fixtures/dataCycles.json, its dates from the FAA's 28 and 56
Day Product Schedule, the NASR subscription page and the DOF page); the
module finds each edition on disk and says when one is out of date."""

import json
import logging
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

from wingtip import chart_cycle, data_cycles, dof, phone_pack, procedures, publications, sua, terrain

FIXTURE = json.loads((Path(__file__).parents[3] / "apps/web/src/lib/fixtures/dataCycles.json").read_text())


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda c: f"{c['kind']}-{c['effective']}@{c['on']}")
def test_the_engines_answer_is_the_fixtures(case):
    effective = date.fromisoformat(case["effective"]) if case["effective"] else None
    # A day, or a UTC time for the boundary cases (the minute before, of
    # and after 0901Z).
    on = datetime.fromisoformat(case["on"].replace("Z", "+00:00")) if "T" in case["on"] else date.fromisoformat(case["on"])
    got = data_cycles.cycle(case["kind"], effective, on)
    for key, want in case["expected"].items():
        assert got[key] == want, (key, case["why"])


def test_the_editions_are_read_off_their_names():
    assert data_cycles.chart_effective("10-29-2026") == date(2026, 10, 29)
    assert data_cycles.nasr_effective("2026/10/29") == date(2026, 10, 29)
    assert data_cycles.cifp_effective("261029") == date(2026, 10, 29)
    assert data_cycles.dof_effective("https://aeronav.faa.gov/Obst_Data/DOF_260927.zip") == date(2026, 9, 27)
    assert data_cycles.chart_effective(None) is None and data_cycles.dof_effective("DOF.zip") is None


def test_the_publications_and_procedures_ask_the_engine_for_the_cycle_in_force():
    # The d-TPP's folder for 6 Nov 2026 is AIRAC 2611 (29 Oct 2026); the
    # Chart Supplement's and the charts' edition is 29 Oct 2026's.
    assert publications.dtpp_cycle(date(2026, 11, 6)) == "2611"
    assert publications.dcs_edition(date(2026, 11, 6)) == "29Oct2026"
    assert chart_cycle.cycle_from_anchor(date(2026, 11, 6)) == "10-29-2026"
    assert procedures.cifp_start(date(2026, 11, 26)) == date(2026, 11, 26)
    assert procedures.cifp_stale(Path("/x/261001/FAACIFP18"), date(2026, 11, 6))
    assert not procedures.cifp_stale(Path("/x/261029/FAACIFP18"), date(2026, 11, 6))


@pytest.fixture
def on_disk(monkeypatch, tmp_path):
    """A planner's FAA files: NASR of 1 Oct 2026 (one cycle behind on 6 Nov),
    the charts of 29 Oct, the CIFP of 29 Oct, the DOF of 27 Sep and the
    phones' packs of 1 Oct."""
    faa = tmp_path / "faa_nasr"
    faa.mkdir()
    for name, eff in (("APT_BASE.csv", "2026/10/29"), ("FRQ.csv", "2026/10/01")):
        (faa / name).write_text(f'"EFF_DATE","X"\n"{eff}","{name}"\n')
    (faa / "DOF.DAT").write_text("")
    (faa / "editions.json").write_text(json.dumps({"DOF": "https://aeronav.faa.gov/Obst_Data/DOF_260927.zip"}))
    cifp = tmp_path / "cifp" / "261029"
    cifp.mkdir(parents=True)
    (cifp / procedures.CIFP_FILE).write_text("")
    monkeypatch.setattr(terrain, "DEFAULT_FAA_CACHE_DIR", faa)
    monkeypatch.setattr(procedures, "CIFP_DIR", tmp_path / "cifp")
    # The charts row reads the newest complete sectional pyramid on disk.
    monkeypatch.setattr(data_cycles, "_charts_edition", lambda: "10-29-2026")
    monkeypatch.setattr(phone_pack, "phone_index", lambda: {"cycle": "2026-10-01"})
    # No special-use areas read yet: their row comes with their first read.
    monkeypatch.setattr(sua, "_CACHE", {})
    return tmp_path


def test_status_names_each_data_set_and_the_ones_out_of_date(on_disk):
    found = {e["key"]: e for e in data_cycles.status(date(2026, 11, 6))}
    assert set(found) == {"nasr", "charts", "cifp", "dof", "packs"}
    # NASR is as old as its oldest file: the frequencies are a cycle behind.
    assert found["nasr"]["edition"] == "2026-10-01" and found["nasr"]["state"] == "expired"
    assert found["nasr"]["expires"] == "2026-10-29" and found["nasr"]["behind"] == 1
    assert found["charts"]["state"] == "in_force" and found["charts"]["expires"] == "2026-12-24"
    assert found["cifp"]["state"] == "in_force"
    assert found["dof"]["effective"] == "2026-09-29" and found["dof"]["state"] == "in_force"
    assert found["packs"]["state"] == "expired"
    assert [e["key"] for e in data_cycles.out_of_date(list(found.values()))] == ["nasr", "packs"]


def test_the_owner_is_told_in_the_log_once_a_day(on_disk, caplog, monkeypatch):
    monkeypatch.setattr(data_cycles, "_warned", {"at": 0.0, "said": ""})
    entries = data_cycles.status(date(2026, 11, 6))
    with caplog.at_level(logging.WARNING, logger="wingtip.data_cycles"):
        assert [e["key"] for e in data_cycles.warn_if_out_of_date(entries)] == ["nasr", "packs"]
        data_cycles.warn_if_out_of_date(entries)
    said = [r.getMessage() for r in caplog.records if "past its cycle" in r.getMessage()]
    assert len(said) == 1 and "Airports, frequencies and navaids (2026-10-01, ended 2026-10-29" in said[0]


def _clock(monkeypatch, when: str):
    monkeypatch.setattr(data_cycles, "now", lambda: datetime.fromisoformat(when).replace(tzinfo=timezone.utc))


@pytest.mark.parametrize(
    ("when", "dtpp", "dcs", "cifp", "charts"),
    [
        # AIRAC 2611 and the 29 Oct 2026 charts take over at 0901Z that day.
        ("2026-10-29T09:00", "2610", "03Sep2026", date(2026, 10, 1), "09-03-2026"),
        ("2026-10-29T09:01", "2611", "29Oct2026", date(2026, 10, 29), "10-29-2026"),
        ("2026-10-29T09:02", "2611", "29Oct2026", date(2026, 10, 29), "10-29-2026"),
    ],
)
def test_an_edition_is_chosen_by_the_0901z_it_takes_effect_at(monkeypatch, when, dtpp, dcs, cifp, charts):
    """The d-TPP, Chart Supplement, CIFP and charts in use turn over at
    0901Z, the minute before still the old ones."""
    _clock(monkeypatch, when)
    assert publications.dtpp_cycle() == dtpp
    assert publications.dcs_edition() == dcs
    assert procedures.cifp_start() == cifp
    assert chart_cycle.current_cycle(fetch=False) == charts
    assert chart_cycle.in_force("10-29-2026") == (charts == "10-29-2026")


def test_status_says_nothing_out_of_date_before_0901z(on_disk, monkeypatch):
    """The engine was asked by the day, so from 0000Z on 26 Nov the 29 Oct
    CIFP in use read as out of date for nine hours; asked at the minute it
    is in force to 0900Z and out of date from 0901Z."""
    for when, state in (("2026-11-26T09:00", "in_force"), ("2026-11-26T09:01", "expired"), ("2026-11-26T09:02", "expired")):
        _clock(monkeypatch, when)
        found = {e["key"]: e for e in data_cycles.status()}
        assert found["cifp"]["state"] == state, when


def test_the_held_status_is_asked_again_at_the_next_change(on_disk, monkeypatch):
    monkeypatch.setattr(data_cycles, "_HELD", {"until": 0.0, "entries": None})
    _clock(monkeypatch, "2026-11-26T08:55")
    monkeypatch.setattr(data_cycles.time, "time", lambda: datetime(2026, 11, 26, 8, 55, tzinfo=timezone.utc).timestamp())
    assert {e["key"]: e for e in data_cycles.held()}["cifp"]["state"] == "in_force"
    # Six minutes on, not ten: past 0901Z the status is worked out again.
    _clock(monkeypatch, "2026-11-26T09:01")
    monkeypatch.setattr(data_cycles.time, "time", lambda: datetime(2026, 11, 26, 9, 1, tzinfo=timezone.utc).timestamp())
    assert {e["key"]: e for e in data_cycles.held()}["cifp"]["state"] == "expired"


def test_a_staged_next_cifp_is_never_the_one_in_use(on_disk, monkeypatch):
    """The 26 Nov 2026 CIFP fetched ahead beside the 29 Oct one is not read,
    nor named by the status, before its 0901Z."""
    staged = on_disk / "cifp" / "261126"
    staged.mkdir()
    (staged / procedures.CIFP_FILE).write_text("")
    _clock(monkeypatch, "2026-11-25T12:00")
    assert procedures.held_before(procedures.cifp_start()).parent.name == "261029"
    assert {e["key"]: e for e in data_cycles.status()}["cifp"]["edition"] == "2026-10-29"
    # The fallback, where the cycle's own cannot be had, is never ahead.
    monkeypatch.setattr(procedures, "_fetch", lambda url, folder: (_ for _ in ()).throw(RuntimeError("down")))
    monkeypatch.setattr(procedures.apra, "cifp_url", lambda start: None)
    (on_disk / "cifp" / "261029" / procedures.CIFP_FILE).unlink()
    (on_disk / "cifp" / "261001").mkdir()
    (on_disk / "cifp" / "261001" / procedures.CIFP_FILE).write_text("")
    assert procedures.cifp_path().parent.name == "261001"


def test_nasr_is_as_old_as_its_oldest_file_the_class_airspace_hours_too(on_disk):
    faa = on_disk / "faa_nasr"
    (faa / "FRQ.csv").write_text('"EFF_DATE","X"\n"2026/10/29","FRQ"\n')
    (faa / "CLS_ARSP.csv").write_text('"EFF_DATE","X"\n"2026/09/03","CLS"\n')
    found = {e["key"]: e for e in data_cycles.status(date(2026, 11, 6))}
    assert found["nasr"]["edition"] == "2026-09-03" and found["nasr"]["behind"] == 2
    # The shapes, by the link they came from.
    (faa / "CLS_ARSP.csv").unlink()
    editions = json.loads((faa / "editions.json").read_text())
    editions["Class_Airspace"] = "https://nfdc.faa.gov/webContent/28DaySub/2026-10-01/class_airspace_shape_files.zip"
    (faa / "editions.json").write_text(json.dumps(editions))
    assert {e["key"]: e for e in data_cycles.status(date(2026, 11, 6))}["nasr"]["edition"] == "2026-10-01"


def test_the_special_use_areas_are_of_the_cycle_they_were_read_in(on_disk, monkeypatch):
    read = datetime(2026, 11, 26, 8, 0, tzinfo=timezone.utc).timestamp()
    monkeypatch.setattr(sua, "_CACHE", {"all": (read, [])})
    _clock(monkeypatch, "2026-11-26T09:00")
    assert {e["key"]: e for e in data_cycles.status()}["sua"]["state"] == "in_force"
    _clock(monkeypatch, "2026-11-26T09:01")
    assert {e["key"]: e for e in data_cycles.status()}["sua"]["state"] == "expired"


@pytest.mark.parametrize(
    ("when", "zip_name"),
    [("2026-11-23T23:59", "DOF_260927.zip"), ("2026-11-24T00:00", "DOF_261122.zip"), ("2026-11-24T00:01", "DOF_261122.zip")],
)
def test_the_dof_in_use_is_the_one_released_by_now(monkeypatch, when, zip_name):
    """The DOF page lists the previous, current and next files, each
    released two days after its last day of changes (the engine's "dof"):
    DOF_261122 from 24 Nov 2026."""
    page = "".join(f'<a href="https://aeronav.faa.gov/Obst_Data/DOF_{s}.zip">' for s in ("260802", "260927", "261122"))
    _clock(monkeypatch, when)
    assert dof.dof_zip_url(page).endswith(zip_name)


def test_a_read_naming_no_edition_is_fresh_only_since_the_cycle_took_over(monkeypatch):
    """wingtip.sua's areas: a day at most, and nothing read before 0901Z
    on a changeover day counts after it."""
    at = datetime(2026, 11, 26, 9, 2, tzinfo=timezone.utc)
    _clock(monkeypatch, "2026-11-26T09:02")
    monkeypatch.setattr(data_cycles.time, "time", lambda: at.timestamp())
    assert data_cycles.fresh_s("airac", 86400) == 60
    later = datetime(2026, 11, 28, 12, 0, tzinfo=timezone.utc)
    _clock(monkeypatch, "2026-11-28T12:00")
    monkeypatch.setattr(data_cycles.time, "time", lambda: later.timestamp())
    assert data_cycles.fresh_s("airac", 86400) == 86400

