"""The FAA's airmen file into the flight instructors' store
(ingest.airmen, wingtip.airmen): only certificate type F kept, its name
and expiry and nothing of the address, looked up by last name; this
month's file asked first, last month's where it is not up, each built
once. The FAA is answered here: no request leaves the test."""

import datetime as dt
import io
import zipfile

from wingtip import airmen as store

from ingest import airmen

# As the FAA writes them (layout of January 2020): padded fields, a
# trailing comma, a byte-order mark.
BASIC = (
    "﻿UNIQUE ID,FIRST & MIDDLE NAME,LAST NAME & SUFFIX,STREET 1,STREET 2,CITY,STATE,ZIP CODE,COUNTRY-NAME,REGION,"
    "MEDICAL CLASS,MEDICAL DATE,MEDICAL EXPIRE DATE,BASIC MED COURSE DATE,BASIC MED CMEC DATE,\n"
    "A1234567,JOHN JAMES          ,JONES JR    ,1 MAIN ST,,MADISON,WI,53703,USA,GL,3,062025,062030,,,\n"
    "A7654321,MARY  ,OAK  ,2 ELM ST,,DULUTH,MN,55802,USA,GL,,,,,,\n"
    "C0000001,AVERY B   ,PILOT ,3 OAK ST,,MADISON,WI,53703,USA,GL,3,062025,062030,,,\n"
)
CERT = (
    "﻿UNIQUE ID,RECORD TYPE,CERTIFICATE TYPE,CERTIFICATE LEVEL,CERTIFICATE EXPIRE DATE,RATINGS,\n"
    "A1234567,00,P,C,,C/ASEL,\n"
    "A1234567,00,F,,,F/ASE     F/INSTA,\n"
    "A7654321,00,F,,11202026,F/ASE,\n"
    "C0000001,00,P,S,,,\n"
)


def _zip() -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr("PILOT_BASIC.csv", BASIC)
        z.writestr("PILOT_CERT.csv", CERT)
    return out.getvalue()


class _Answer:
    def __init__(self, status: int, body: bytes = b""):
        self.status_code, self.body = status, body

    def raise_for_status(self) -> None:
        assert self.status_code < 400

    def iter_content(self, size: int):
        yield self.body


def test_the_flight_instructors_alone_are_kept_without_their_addresses(monkeypatch, tmp_path):
    monkeypatch.setattr(store, "store_path", lambda: tmp_path / "airmen.sqlite")
    asked = []

    def get(url, **kw):
        asked.append(url)
        return _Answer(404) if url.endswith("CS112026.zip") else _Answer(200, _zip())

    monkeypatch.setattr(airmen.outside, "get", get)
    assert airmen.refresh(today=dt.date(2026, 11, 1)) == "CS102026.zip"
    assert asked == ["https://registry.faa.gov/database/CS112026.zip", "https://registry.faa.gov/database/CS102026.zip"]

    assert store.instructors_named("John J. Jones Jr.") == [
        {"id": "A1234567", "first_middle": "JOHN JAMES", "last_suffix": "JONES JR", "expires": None}
    ]
    assert store.instructors_named("Mary Oak")[0]["expires"] == "2026-11-20"
    # A student pilot is no flight instructor.
    assert store.instructors_named("Avery Pilot") == []
    assert b"MAIN ST" not in (tmp_path / "airmen.sqlite").read_bytes()

    # Built once: the next day asks again only for the month not yet up.
    asked.clear()
    assert airmen.refresh(today=dt.date(2026, 11, 2)) is None
    assert asked == ["https://registry.faa.gov/database/CS112026.zip"]


def test_no_store_yet_reads_as_unknown(monkeypatch, tmp_path):
    monkeypatch.setattr(store, "store_path", lambda: tmp_path / "none.sqlite")
    assert store.instructors_named("John Jones") is None
