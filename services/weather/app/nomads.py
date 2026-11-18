"""NOAA's NOMADS, as every product here asks it: one GET with wingtip's
User-Agent, a run not posted yet told apart from NOMADS not answering, the
GFS's newest run worked out one way, and a file of GRIB2 messages read one
message at a time. The winds aloft (app.gfs), the flow layer's GFS, HRRR
and DAFS parts (app.flow_nomads, app.flow_aloft, app.flow_dafs) and GLMP
(app.glmp) each had their own copy of the GET, the GFS's run and the
message loop."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime, timedelta

import gribberish
import requests
from wingtip import outside
from wingtip.config import REQUEST_HEADERS

#: The GFS at 0.25 degree through NOMADS' grib filter, which cuts a file to
#: the variables, levels and box asked for.
GFS_FILTER_URL = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
#: A GFS run is on NOMADS about three and a half hours after its hour
#: (its 00, 06, 12 and 18Z runs; NCEP's production schedule).
GFS_POSTED_AFTER = timedelta(hours=4)


def gfs_run(now: datetime) -> datetime:
    """The newest GFS run posted by `now`: its six-hourly hour at least
    GFS_POSTED_AFTER before."""
    latest = (now - GFS_POSTED_AFTER).replace(minute=0, second=0, microsecond=0)
    return latest - timedelta(hours=latest.hour % 6)


def gfs_dir(run: datetime) -> str:
    """A GFS run's folder, as the grib filter's `dir` names it."""
    return f"/gfs.{run:%Y%m%d}/{run:%H}/atmos"


def get(url: str, params: dict | None = None, *, error: type[Exception], timeout: float = 30, grib: bool = True) -> bytes | None:
    """A file's bytes, or None where it is not posted yet: a 404, or, from
    the grib filter (`grib`), an HTML page saying so where GRIB was asked.
    Raises `error` where NOMADS does not answer or answers otherwise."""
    asked = {"params": params} if params is not None else {}
    try:
        resp = outside.get(url, **asked, headers=REQUEST_HEADERS, timeout=timeout)
    except requests.RequestException as err:
        raise error(f"NOMADS did not answer: {err}") from err
    if resp.status_code == 404 or (grib and not resp.content.startswith(b"GRIB")):
        return None
    if not resp.ok:
        raise error(f"NOMADS answered {resp.status_code} for {url}")
    return resp.content


def messages(body: bytes) -> Iterator:
    """Each GRIB2 message of a file of them, parsed (gribberish), in order."""
    offset = 0
    while offset < len(body):
        message = gribberish.parse_grib_message(body, offset)
        offset += message.metadata.message_size
        yield message
