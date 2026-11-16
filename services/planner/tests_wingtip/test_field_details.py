"""wingtip.field_details: the airport card's phones by whose they are, its
Class Airspace hours as NASR sends them, and its time zone."""

from wingtip import faa_data, field_details

APT_CON = (
    "ARPT_ID,TITLE,NAME,ADDRESS1,ADDRESS2,TITLE_CITY,STATE,ZIP_CODE,PHONE_NO\n"
    "PWK,MANAGER,JEFF MILLER,1020 PLANT RD,,WHEELING,IL,60090,847-537-2580\n"
    "PWK,OWNER,CITIES OF WHEELING,1020 PLANT RD,,WHEELING,IL,60090,847-537-2580\n"
    "C81,MANAGER,A,1 FIELD RD,,ANTIOCH,IL,60002,847-395-0000\n"
    "C81,OWNER,B,2 TOWN RD,,ANTIOCH,IL,60002,847-395-1111\n"
)
CLS_ARSP = "ARPT_ID,CLASS_D_AIRSPACE,AIRSPACE_HRS\nPWK,Y,\"CLASS D SVC 0600-2200 MON-FRI, 0700-2200 SAT-SUN; OTHER TIMES CLASS E\"\nORD,,\n"


def _files(tmp_path, monkeypatch):
    (tmp_path / "APT_CON.csv").write_text(APT_CON)
    (tmp_path / "CLS_ARSP.csv").write_text(CLS_ARSP)
    field_details._phones_of.cache_clear()
    field_details._hours_of.cache_clear()
    monkeypatch.setattr(faa_data, "airport_contact", lambda ident, cache_dir: {"phone": None, "address": None})


def test_each_phone_by_whose_it_is_a_number_listed_twice_once(tmp_path, monkeypatch):
    _files(tmp_path, monkeypatch)
    pwk = field_details.of({"ident": "KPWK", "lat": 42.1142, "lon": -87.9015}, tmp_path)
    assert pwk["phones"] == [{"who": "Manager", "number": "847-537-2580"}]
    c81 = field_details.of({"ident": "C81", "lat": 42.3246, "lon": -88.0741}, tmp_path)
    assert [p["who"] for p in c81["phones"]] == ["Manager", "Owner"]


def test_the_airspace_hours_as_nasr_sends_them_and_the_zone_the_field_keeps(tmp_path, monkeypatch):
    _files(tmp_path, monkeypatch)
    pwk = field_details.of({"ident": "KPWK", "lat": 42.1142, "lon": -87.9015}, tmp_path)
    assert pwk["airspace_hours"] == "CLASS D SVC 0600-2200 MON-FRI, 0700-2200 SAT-SUN; OTHER TIMES CLASS E"
    assert pwk["time_zone"] == "America/Chicago"
    # KORD's surface area is full-time: no hours.
    assert field_details.of({"ident": "KORD", "lat": 41.9786, "lon": -87.9048}, tmp_path)["airspace_hours"] is None
