"""crash.notices on a CSV in the ASIAS preliminary report's columns
(fixtures/faa_notices.csv: the dashboard's export refuses a scripted
request, so this file is written in its columns, with made-up
registrations): accidents only, the N-number written as the registry
writes it, the death flag kept, and a file with no such columns skipped."""

from pathlib import Path

from crash import notices

CSV = (Path(__file__).parent / "fixtures" / "faa_notices.csv").read_text()


def test_the_accidents_with_their_n_numbers():
    found = notices.parse(CSV)
    assert [(e["city"], e["state"], e["n_number"]) for e in found] == [("Estero", "FL", "N123AB"), ("Mayfield", "KY", "N39AV")]


def test_dates_times_aircraft_and_the_fatal_flag():
    estero, mayfield = notices.parse(CSV)
    assert (estero["local_date"], estero["local_time"]) == ("2026-11-08", "13:15")
    assert estero["aircraft"] == "Kitfox SUPERSPORT"
    assert (estero["fatal"], mayfield["fatal"]) == (True, False)
    assert estero["text"] == "AIRCRAFT CRASHED UNDER UNKNOWN CIRCUMSTANCES, ESTERO, FL."


def test_the_dashboards_own_column_names_are_read_too():
    text = (
        "Event Local Date,Event Local Time,Location City,Location State,Registration Number,Event Type\n"
        "11/08/2026,1425,MAYFIELD,KY,N-39AV,Accident\n"
    )
    (event,) = notices.parse(text)
    assert (event["local_date"], event["local_time"], event["state"], event["n_number"]) == ("2026-11-08", "14:25", "KY", "N39AV")


def test_a_file_with_no_date_or_registration_is_skipped():
    assert notices.parse("City,State\nMAYFIELD,KY\n") == []


def test_the_drop_folder_is_read(tmp_path):
    (tmp_path / "notices.csv").write_text(CSV)
    ((path, events),) = notices.dropped(tmp_path)
    assert path.name == "notices.csv" and len(events) == 2
