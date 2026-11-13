"""crash.statements on the FAA's statements page as it was on 2026-11-12
(fixtures/faa_statements.html, its first twelve days): only the crashes,
each with the event's own date, its local time where the words give a.m.
or p.m., its place as a postal code, and the FAA's words as written."""

from pathlib import Path

from crash import statements

PAGE = (Path(__file__).parent / "fixtures" / "faa_statements.html").read_text()


def test_only_the_crashes_are_read():
    found = statements.parse(PAGE)
    places = [(e["city"], e["state"]) for e in found]
    assert ("Mayfield", "KY") in places and ("Estero", "FL") in places
    # A safe landing on a road, a passenger disturbance and a taxiing
    # Cessna blown over are no crashes.
    assert ("Bayonne", "NJ") not in places and ("New Orleans", "LA") not in places and ("Santa Ana", "CA") not in places


def test_the_time_is_read_only_with_its_am_or_pm():
    by_city = {e["city"]: e for e in statements.parse(PAGE)}
    assert by_city["Estero"]["local_time"] == "13:15"
    # "around 2:25 local time": either half of the day, so the whole day.
    assert by_city["Mayfield"]["local_time"] is None
    # "around 9 a.m.": no minutes written.
    assert by_city["Waimea"]["local_time"] == "09:00"


def test_the_events_own_date_and_its_words_as_written():
    by_city = {e["city"]: e for e in statements.parse(PAGE)}
    estero = by_city["Estero"]
    assert estero["local_date"] == "2026-11-08"
    assert estero["aircraft"] == "Kitfox Supersport"
    assert estero["text"].startswith("A Kitfox Supersport crashed in Estero, Florida, around 1:15 p.m.")
    assert estero["heading"] == "General Aviation / Estero, Florida"
    # No N-number in the words, and no death said: not known, not "no".
    assert estero["n_number"] is None and estero["fatal"] is None


def test_an_n_number_and_a_death_are_read_where_the_words_give_them():
    page = (
        "<article><h3>November 12, 2026</h3><p><strong>General Aviation / Mayfield, Kentucky</strong></p>"
        "<p>A Cessna 172, N123AB, crashed near Mayfield, Kentucky, around 4:05 p.m. local time on Thursday, Nov. 12. "
        "The pilot died.</p></article>"
    )
    (event,) = statements.parse(page)
    assert (event["n_number"], event["fatal"], event["local_time"]) == ("N123AB", True, "16:05")


def test_a_date_before_the_new_year_is_last_years():
    page = (
        "<article><h3>January 2, 2027</h3><p><strong>General Aviation / Estero, Florida</strong></p>"
        "<p>A Piper PA-28 crashed in Estero, Florida, around 10:00 a.m. on Thursday, Dec. 31.</p></article>"
    )
    assert statements.parse(page)[0]["local_date"] == "2026-12-31"
