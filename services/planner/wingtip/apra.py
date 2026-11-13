"""Where the FAA's current editions are, from its Aeronautical Product
Release API (APRA, external-api.faa.gov/apra): keyless JSON that names
each product's edition date and download link, in place of reading the
links off the FAA's web pages with a regular expression.

What APRA answers, asked on 2026-11-12 (tests_wingtip/fixtures/apra):
- nfdc/nasr/info and /chart: the NASR edition's date (10/29/2026) and the
  whole 28-day subscription's zip. Not the per-table CSV zips or the Class
  Airspace shapes the planner reads; those sit beside it on nfdc.faa.gov
  under the edition's date (`nasr_csv_url`, `class_airspace_url`).
- cifp/chart: the CIFP zip of the current and the next AIRAC cycle.
- vfr/sectional/info: the sectionals' edition date.
- dtpp/chart: the terminal procedures' five zips. supplement/chart: 404
  for every volume asked.
- Not the Digital Obstacle File, which stays on its own page
  (wingtip.faa_data, DOF_INDEX_URL).

Where APRA does not answer, the engine's cycle arithmetic does
(wingtip.data_cycles): the same date, worked out rather than asked.
"""

import logging
from datetime import date, datetime

import requests

from . import data_cycles, outside
from .config import FAA_HEADERS

log = logging.getLogger(__name__)

APRA_URL = "https://external-api.faa.gov/apra"
#: Where the NASR subscription's own files are, by edition.
NFDC_URL = "https://nfdc.faa.gov/webContent/28DaySub"
#: The month as nfdc's file names write it, whatever the locale's %b.
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


class ApraError(RuntimeError):
    """APRA answered, but with no edition: its own status was not 200."""


def editions(product: str, edition: str = "current", **params: str) -> list[dict]:
    """APRA's editions of a product ("nfdc/nasr/info", "cifp/chart"), as
    it sends them: each an editionDate ("10/29/2026") and, from a /chart,
    a product with its url. APRA answers HTTP 200 with its own status in
    the body, 404 there for an edition it does not have."""
    resp = outside.get(
        f"{APRA_URL}/{product}", params={"edition": edition, **params}, headers={**FAA_HEADERS, "Accept": "application/json"}, timeout=20
    )
    resp.raise_for_status()
    body = resp.json()
    status = body.get("status") or {}
    if status.get("code") != 200 or not body.get("edition"):
        raise ApraError(f"APRA {product} ({edition}): {status.get('message') or 'no edition'}")
    return body["edition"]


def edition_date(entry: dict) -> date:
    """An APRA edition's date ("10/29/2026")."""
    return datetime.strptime(entry["editionDate"], "%m/%d/%Y").date()


def _asked(product: str, **params: str) -> date | None:
    """The current edition's date of a product, or None where APRA cannot
    say (down, or answering in a shape this does not know)."""
    try:
        return edition_date(editions(product, **params)[0])
    except (requests.RequestException, ApraError, ValueError, KeyError, IndexError, TypeError):
        log.info("APRA %s did not answer; the cycle arithmetic decides", product, exc_info=True)
        return None


def nasr_cycle() -> date:
    """The NASR edition in force: APRA's current one, else the 28-day
    AIRAC cycle's start (NASR is published on the AIRAC dates, the
    engine's `data_cycle`)."""
    return _asked("nfdc/nasr/info") or data_cycles.start_on("airac", data_cycles.in_force_day())


def nasr_csv_url(table: str, cycle: date) -> str:
    """A NASR CSV zip ("APT" -> .../extra/29_Oct_2026_APT_CSV.zip) of an
    edition, as nfdc publishes it beside the subscription APRA names."""
    return f"{NFDC_URL}/extra/{cycle.day:02d}_{_MONTHS[cycle.month - 1]}_{cycle.year}_{table}_CSV.zip"


def class_airspace_url(cycle: date) -> str:
    """The Class B, C and D shapefile zip of an edition."""
    return f"{NFDC_URL}/{cycle.isoformat()}/class_airspace_shape_files.zip"


def cifp_url(start: date) -> str | None:
    """The CIFP zip of the AIRAC cycle that starts on `start`, where APRA
    has it as the current or the next edition; None where it has neither
    or does not answer, for the caller's own link."""
    for edition in ("current", "next"):
        try:
            found = [e for e in editions("cifp/chart", edition) if edition_date(e) == start]
        except (requests.RequestException, ApraError, ValueError, KeyError, TypeError):
            log.info("APRA's %s CIFP did not answer", edition, exc_info=True)
            continue
        if found and (found[0].get("product") or {}).get("url"):
            return found[0]["product"]["url"]
    return None


def sectional_cycle(today: date) -> date | None:
    """The sectionals' current edition by APRA, where it has taken effect
    by `today`; None where APRA cannot say or names one still to come.
    Every sectional is on the one 56-day cycle, so one sheet's answer is
    every sheet's."""
    found = _asked("vfr/sectional/info", geoname="Chicago")
    return found if found and found <= today else None
