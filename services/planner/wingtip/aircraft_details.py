"""Everything public about a US airplane by its N-number, for its card
(the owner, 2026-11-14: "I want to show everything for the plane that we
can find, all the public data that's available"), each part from the
store the planner reads, so no part waits on a fetch:

- its registration, its make and model's and its engine's reference
  records, its past registrations, the documents filed against it and the
  N-number's reservation: the FAA's aircraft registry download
  (wingtip.registry, wingtip.registry_history), read once a day;
- its accidents and incidents: the NTSB's aviation database
  (wingtip.history.ntsb), which ingest keeps on the shared data volume;
- where it is usually based: the engine's `usual_base` over its flights
  ADS-B receivers heard (wingtip.traffic.based_judged), looked up in the
  background the first time and given on a later ask (`based_pending`).

Its photo is asked apart (wingtip.aircraft_photo), so this never waits on
Planespotters.net.
"""

from __future__ import annotations

import re
from pathlib import Path

from . import registry, registry_history, traffic
from .history import ntsb

N_NUMBER = re.compile(r"^N[1-9][0-9A-Z]{0,4}$")

REGISTRY_SOURCE = "FAA Releasable Aircraft Database (registry.faa.gov/database/ReleasableAircraft.zip)"
REGISTRY_CREDIT = "Aircraft registration: Federal Aviation Administration, Civil Aviation Registry."


def n_number(text: str) -> str | None:
    """An N-number as the FAA's files key it: capitals, no spaces or dash,
    its N; None for what is not one."""
    n = re.sub(r"[\s-]+", "", text or "").upper()
    n = n if n.startswith("N") else "N" + n
    return n if N_NUMBER.fullmatch(n) else None


def details(text: str, directory: Path = registry.DEFAULT_DIR) -> dict | None:
    """The airplane `text` names as wingtip's schemas' AirplaneDetails
    gives it; None for what is not an N-number. A part the stores do not
    hold is None or empty, never guessed."""
    n = n_number(text)
    if n is None:
        return None
    db_path = Path(directory) / registry.DB_NAME
    reg = registry.lookup(n_number=n, directory=directory)
    model = engine = None
    serial = model_code = year = hex_id = None
    if reg:
        model = registry.model(reg.get("model_code"), directory)
        engine = registry.engine_model(reg.get("engine_code"), directory)
        serial, model_code, year, hex_id = reg.get("serial"), reg.get("model_code"), reg.get("year"), reg.get("mode_s_hex")
    judged = traffic.based_judged(hex_id) if hex_id else None
    return {
        "n_number": n,
        "registration": reg,
        "model": model,
        "engine": engine,
        "past_registrations": registry_history.past_registrations(db_path, n, serial, model_code, year),
        "documents": registry_history.documents(db_path, n),
        "reservation": registry_history.reservation(db_path, n),
        "ntsb": ntsb.cases(n),
        "based": judged,
        # Asked and not known yet: the card asks again in a little while.
        "based_pending": bool(hex_id) and judged is None,
        "sources": [
            {"name": REGISTRY_SOURCE, "credit": REGISTRY_CREDIT},
            {"name": ntsb.SOURCE, "credit": ntsb.CREDIT},
            {"name": "adsb.lol (Open Database License 1.0)", "credit": "Flights: adsb.lol, ODbL 1.0."},
        ],
    }
