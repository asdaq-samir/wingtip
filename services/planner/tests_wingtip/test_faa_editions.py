"""wingtip.faa_editions.refresh_editions: the planner's FAA files fetched again
when the FAA has a newer edition, a zip's files together, and a file on
disk of the current cycle left alone."""

from datetime import date, datetime, timezone
from pathlib import Path

import pytest
from wingtip import faa_data, faa_editions


def _csv(path: Path, eff_date: str) -> None:
    path.write_text(f'"EFF_DATE","X"\n"{eff_date}","{path.name}"\n')


@pytest.fixture
def faa(monkeypatch, tmp_path):
    """The NASR edition APRA names (1 Oct 2026), the DOF page's zip, and
    the zips as files written into the staging folder; the zips fetched,
    in order, and which ones fail."""
    fetched: list[str] = []
    failing: set[str] = set()
    monkeypatch.setattr(faa_data.apra, "nasr_cycle", lambda: date(2026, 10, 1))
    monkeypatch.setattr(faa_data.dof, "dof_link", lambda: "https://aeronav.faa.gov/Obst_Data/DOF_261001.zip")

    def download(url, dest, retries=3, only=None):
        fetched.append(url.rsplit("/", 1)[-1])
        if any(f in url for f in failing):
            raise RuntimeError("the FAA's site did not answer")
        for name in only:
            target = dest / ("Shape_Files" if name.startswith("Class_Airspace") else "") / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if name.endswith(".csv"):
                _csv(target, "2026/10/01")
            else:
                target.write_text(f"new {name}")

    monkeypatch.setattr(faa_data, "download_and_extract", download)
    return tmp_path, fetched, failing


def test_a_file_of_the_current_cycle_is_left_and_an_old_one_fetched_with_its_zip(faa):
    folder, fetched, _ = faa
    _csv(folder / "NAV_BASE.csv", "2026/10/01")
    _csv(folder / "NAV_RMK.csv", "2026/10/01")
    _csv(folder / "FIX_BASE.csv", "2026/10/01")
    # The airports a cycle behind, its remarks current: one zip, fetched whole.
    _csv(folder / "APT_BASE.csv", "2026/09/03")
    _csv(folder / "APT_RMK.csv", "2026/10/01")

    refreshed = faa_editions.refresh_editions(folder)

    assert "01_Oct_2026_NAV_CSV.zip" not in fetched and "01_Oct_2026_FIX_CSV.zip" not in fetched
    assert {"APT_BASE.csv", "APT_RMK.csv", "APT_RWY_END.csv"} <= set(refreshed)
    assert faa_editions._effective_date(folder / "APT_BASE.csv") == "2026/10/01"
    # No record of the shapes' or the obstacles' edition: fetched once.
    assert (folder / "Shape_Files" / "Class_Airspace.shp").read_text() == "new Class_Airspace.shp"
    assert (folder / "DOF.DAT").read_text() == "new DOF.DAT"
    # And not again while the FAA's are the same.
    fetched.clear()
    assert faa_editions.refresh_editions(folder) == [] and fetched == []


def test_one_edition_failing_leaves_the_rest_to_refresh_and_itself_for_next_time(faa):
    folder, fetched, failing = faa
    failing.add("DOF")
    (folder / "DOF.DAT").write_text("old")

    refreshed = faa_editions.refresh_editions(folder)

    assert "DOF.DAT" not in refreshed and (folder / "DOF.DAT").read_text() == "old"
    assert "NAV_BASE.csv" in refreshed
    failing.clear()
    fetched.clear()
    assert faa_editions.refresh_editions(folder) == ["DOF.DAT"] and fetched == ["DOF_261001.zip"]


def test_the_next_nasr_cycle_is_fetched_ahead_and_put_in_place_at_its_0901z(faa, monkeypatch):
    """A week before 0901Z on 29 Oct 2026 the next cycle's zips are fetched
    into a folder of their own; at the check after 0901Z they are moved
    into place with nothing to download, CLS_ARSP.csv (the Class D hours)
    among them."""
    folder, fetched, _ = faa
    # Eight days ahead: not yet.
    assert faa_editions.stage_next(folder, now=datetime(2026, 10, 21, 9, 0, tzinfo=timezone.utc)) == []
    staged = faa_editions.stage_next(folder, now=datetime(2026, 10, 22, 12, 0, tzinfo=timezone.utc))
    assert "CLS_ARSP_CSV" in staged and "DOF" not in staged
    assert "29_Oct_2026_NAV_CSV.zip" in fetched and (folder / ".next-2026-10-29" / "NAV_BASE.csv").exists()
    # Asked again, nothing is fetched twice.
    fetched.clear()
    assert faa_editions.stage_next(folder, now=datetime(2026, 10, 23, 12, 0, tzinfo=timezone.utc)) == [] and fetched == []
    # 0901Z on 29 Oct: the cycle in force is the staged one.
    monkeypatch.setattr(faa_data.apra, "nasr_cycle", lambda: date(2026, 10, 29))
    refreshed = faa_editions.refresh_editions(folder)
    assert {"NAV_BASE.csv", "CLS_ARSP.csv", "Shape_Files/Class_Airspace.shp"} <= set(refreshed)
    assert [f for f in fetched if "_CSV.zip" in f or "class_airspace" in f] == []
    assert not (folder / ".next-2026-10-29" / "NAV_BASE.csv").exists()
    # The day after, the old staging folder is gone.
    faa_editions.stage_next(folder, now=datetime(2026, 10, 30, 12, 0, tzinfo=timezone.utc))
    assert not (folder / ".next-2026-10-29").exists()


def test_the_class_airspace_hours_are_refreshed_with_the_cycle(faa):
    folder, fetched, _ = faa
    _csv(folder / "CLS_ARSP.csv", "2026/09/03")
    assert "CLS_ARSP.csv" in faa_editions.refresh_editions(folder)
    assert "01_Oct_2026_CLS_ARSP_CSV.zip" in fetched
    assert faa_editions._effective_date(folder / "CLS_ARSP.csv") == "2026/10/01"

