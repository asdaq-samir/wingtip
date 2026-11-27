"""The icing as it is now, for the legs a pilot flies first: the NWS's
Current Icing Product, version 2 (CIP2), from NOMADS, the hour's analysis
the forecast hours after it (app.icing) are read beside.

The CIP "combines sensor and near-term high-resolution model output to
provide an hourly, three-dimensional diagnosis of the icing environment"
-- MRMS reflectivity, METARs, PIREPs, satellite and lightning -- on the
3 km HRRR grid since 2026-10-22, "60 vertical levels every 500 ft from
500 ft to 30,000 ft", the severity ICESEV (category 19, parameter 37) in
a file of about 60 MB an hour, cip.tHHz.3km.grib2 (NWS Service Change
Notice 26-87). Measured 2026-11-27: posted about 11 minutes past its hour
(cip.t18z.3km.grib2 at 18:13, 52.8 MB), 180 records, the probability's
60, the SLD potential's 60, then the severity's 60 at the end of the file
(21.3 MB together); the levels under the ground masked out (its bitmap,
read as no value). NOMADS lists no .idx for it, so the end of the file is
asked for (an HTTP suffix Range, TAIL_BYTES), the records walked back from
there by their own lengths, and the whole file only where the severity's
run is longer than that.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

import numpy as np
import requests
from wingtip import outside
from wingtip.config import REQUEST_HEADERS

from . import icing_grid

log = logging.getLogger(__name__)

URL = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/cip/prod/cip.{hour:%Y%m%d}/cip.t{hour:%H}z.3km.grib2"
#: An hour's file is looked for this long after its hour (measured 11 to
#: 13 minutes past, 2026-11-27).
POSTED_AFTER = timedelta(minutes=15)
#: Hours looked back over for the newest posted.
HOURS_TRIED = 3
#: The end of the file asked for first: the severity's run measured 21.3 MB
#: in late November's icing; one longer takes the whole file.
TAIL_BYTES = 32_000_000


class CipUnavailable(RuntimeError):
    """NOMADS gave no recent CIP, or one that could not be read."""


def _get(url: str, tail: int | None) -> bytes | None:
    """The file, or its last `tail` bytes; None where it is not posted."""
    headers = {**REQUEST_HEADERS, **({"Range": f"bytes=-{tail}"} if tail else {})}
    try:
        resp = outside.get(url, headers=headers, timeout=120)
    except requests.RequestException as err:
        raise CipUnavailable(f"NOMADS did not answer: {err}") from err
    if resp.status_code == 404:
        return None
    if resp.status_code not in (200, 206):
        raise CipUnavailable(f"NOMADS answered {resp.status_code} for the CIP")
    return resp.content


def severity_run(body: bytes) -> bytes | None:
    """The severity's records at the end of `body` (the file, or its end):
    from the first "GRIB" whose messages run, each by its own length, to
    exactly the end, the run of severity records that closes it. None
    where no such run is found."""
    start = body.find(b"GRIB")
    while start >= 0:
        chain, at = [], start
        while (length := icing_grid.message_length(body, at)) is not None:
            chain.append(at)
            at += length
        if chain and at == len(body):
            first = len(chain)
            while first > 0 and icing_grid.parameter(body, chain[first - 1]) == icing_grid.SEVERITY:
                first -= 1
            return body[chain[first] :] if first < len(chain) else None
        start = body.find(b"GRIB", start + 1)
    return None


def _read(url: str, levels: list[float]) -> np.ndarray | None:
    """An hour's severity on the stored grid; None where it is not posted."""
    for tail in (TAIL_BYTES, None):
        body = _get(url, tail)
        if body is None:
            return None
        run = severity_run(body)
        grid = icing_grid.read_levels(run, levels) if run else None
        if grid is not None and icing_grid.complete(grid):
            return grid
        if tail is None or len(body) < tail:  # the whole file was read already
            break
    raise CipUnavailable(f"the CIP at {url.rsplit('/', 1)[-1]} has not every level's severity")


def newest(now: datetime, held: datetime | None, levels: list[float]) -> tuple[datetime, np.ndarray] | None:
    """The newest CIP hour posted and its grid, where newer than `held`;
    None where none newer is posted in the last HOURS_TRIED hours."""
    hour = (now - POSTED_AFTER).replace(minute=0, second=0, microsecond=0)
    for back in range(HOURS_TRIED):
        at = hour - timedelta(hours=back)
        if held is not None and at <= held:
            return None
        try:
            grid = _read(URL.format(hour=at), levels)
        except (ValueError, RuntimeError, AttributeError) as err:
            if isinstance(err, CipUnavailable):
                raise
            raise CipUnavailable(f"the CIP at {at:%H}Z could not be read: {err}") from err
        if grid is not None:
            return at, grid
    return None
