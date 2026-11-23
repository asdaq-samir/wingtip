"""The GDL 90 the feed sent, read back by the engine's receiver_read, as
the phones read it: run inside the planner's container, where the engine
is (scripts/dev/sim-flight.sh pipes this file in as the program and the
run's gdl90.jsonl on stdin):

    docker compose -p wingtip exec -T planner python -c "$(cat readback.py)" < gdl90.jsonl

It prints one JSON object a datagram: when it was sent, own ship and the
traffic as the engine read them. The report (sim_flight.report) holds
them to the simulator's own state lines. Self-contained: it imports only
the planner's wingtip.engine.
"""

import json
import sys

from wingtip.engine import ask


def _own(o):
    if not o:
        return None
    return {k: o.get(k) for k in ("lat", "lon", "pressure_ft", "geometric_ft", "speed_kt", "track_deg", "airborne", "callsign")}


def main() -> None:
    picture = None
    for line in sys.stdin:
        if not line.strip():
            continue
        sent = json.loads(line)
        picture = ask("receiver_read", data=sent["data"], at=sent["at"], picture=picture)
        targets = [
            {k: t.get(k) for k in ("hex", "callsign", "lat", "lon", "pressure_ft", "speed_kt", "track_deg")}
            for t in picture.get("targets", [])
        ]
        print(json.dumps({"at": sent["at"], "own": _own(picture.get("ownship")), "targets": targets}), flush=True)


main()
