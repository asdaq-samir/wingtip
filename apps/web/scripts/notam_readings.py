"""KDLH's NOTAMs read as the planner's GET /api/airport/{ident}/notams
sends them, for the browser specs that mock that endpoint
(e2e/fixtures/notams/kdlh-read.json, read by e2e/plannerNotams.ts): the
endpoint's own code, app.notam_reading.read with the field's card
(field_card: its names, runways, lights, approaches and frequencies, in
the order /api/airport/{ident} sends them, so a badge's index is the
card's), keyed by each NOTAM's text as sent. The engine reads each one
(notam_read, notam_card, notam_subject, notam_affects); a spec puts the
reading beside the ranking it mocks.

Recorded in the planner's image, with the project's NASR, CIFP and d-TPP
data, from the repository's root:

    docker run --rm -v "$PWD/services/planner:/workspace/services/planner:ro" \
      -v "$PWD/data:/workspace/data:ro" -v "$PWD/apps/web/scripts:/rec:ro" \
      -e PYTHONPATH=/workspace/services/planner -w /workspace/services/planner \
      wingtip-planner python /rec/notam_readings.py > apps/web/e2e/fixtures/notams/kdlh-read.json

Run again when the engine's NOTAM reading changes, or a spec mocks a NOTAM
not here. The badges' runway indexes take KDLH's runways in NASR's order,
03/21 then 09/27, as CI's data gives them.
"""

import json
import sys

from app import notam_reading
from wingtip import airports

ENDS = "2026-11-20T23:59:00Z"
RAWS = [
    ("!DLH 11/042 DLH RWY 09/27 CLSD 2611101200-2611121432", "notam", "2026-11-12T14:32:00Z"),
    ("!DLH 11/101 DLH RWY 27 PAPI U/S 2611101200-2611202359EST", "notam", ENDS),
    ("!DLH 11/102 DLH TWY A BTN TWY B AND TWY C CLSD 2611101200-2611202359", "notam", ENDS),
    (
        "!DLH 11/103 DLH OBST CRANE (ASN 2026-AGL-1-NRA) 465000N0921200W (1.2NM SE DLH) 1600FT (210FT AGL) FLAGGED AND LGTD 2611101200-2611202359",
        "notam",
        ENDS,
    ),
    ("!DLH 11/104 DLH AD AP 100LL FUEL NOT AVBL 2611101200-2611202359", "notam", ENDS),
    ("!DLH 11/105 DLH NAV ILS RWY 09 GP U/S 2611101200-2611202359", "notam", ENDS),
    ("!DLH 11/150 DLH TWY A BTN RWY 09 AND TWY C CLSD 2611101200-2611202359", "notam", ENDS),
    (
        "!DLH 11/101 DLH OBST TOWER LGT (ASN 2026-AGL-1) 465000N0921200W (1.2NM SE DLH) 1600FT (210FT AGL) U/S 2611101200-2611202359",
        "notam",
        ENDS,
    ),
    ("!FDC 6/2478 ZFW TX..AIRSPACE SAN ANGELO, TX..TEMPORARY FLIGHT RESTRICTIONS. 2611010700-2703140800", "tfr", "2027-03-14T08:00:00Z"),
    (
        "!FDC 6/3373 ARR SID AURORA MUNI, CHICAGO/AURORA, IL. ADELL EIGHT DEPARTURE (RNAV)... BLOKR EIGHT DEPARTURE (RNAV)... CARYN EIGHT DEPARTURE (RNAV)... DARCY EIGHT DEPARTURE (RNAV)... ELANR NINE DEPARTURE (RNAV)... OBENE THREE DEPARTURE (RNAV)... RWY 18/36 PROCEDURES NA. RWY 18/36 PERMANENTLY CLSD. 2605271843-2805271843EST",
        "notam",
        "2028-05-27T18:43:00Z",
    ),
]
card = notam_reading.field_card(airports.find_place("KDLH"))
read = notam_reading.read([{"raw": r, "kind": k, "ends": e} for r, k, e in RAWS], card)
keys = ("reading", "card", "subject", "affects")
json.dump({n["raw"]: {k: n[k] for k in keys} for n in read}, sys.stdout, indent=1, sort_keys=True)
print()
