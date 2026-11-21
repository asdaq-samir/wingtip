"""python -m sim_flight, as scripts/dev/sim-flight.sh runs it on the Mac
(docs/SIM-FLIGHT.md):

    prepare --scenario F --out DIR [--fly path|autopilot] [--feed HOST:PORT]
        the X-Plane plugin's flight file into DIR (X-Plane's Output/wingtip)
    feed --scenario F --run DIR [--http PORT] [--listen HOST:PORT] [--gdl90 HOST:PORT]
        the feed, until interrupted (sim_flight.feed)
    report --run DIR
        report.md from the run's folder; exit 1 where a check failed
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import feed, report, scenario

#: Where the simulator sends its state lines, and where GDL 90 goes: the
#: phones' receiver listens on UDP 4000, a portable receiver's port.
STATE_PORT = 49010
GDL90_PORT = 4000
HTTP_PORT = 8765


def _address(text: str) -> tuple[str, int]:
    host, _, port = text.rpartition(":")
    if not host or not port.isdigit():
        raise argparse.ArgumentTypeError(f"{text}: write HOST:PORT")
    return host, int(port)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="sim_flight", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("--scenario", type=Path, required=True)
    prep.add_argument("--out", type=Path, required=True)
    prep.add_argument("--fly", choices=scenario.FLY, default="path")
    prep.add_argument("--feed", type=_address, default=("127.0.0.1", STATE_PORT))
    run = sub.add_parser("feed")
    run.add_argument("--scenario", type=Path, required=True)
    run.add_argument("--run", type=Path, required=True)
    run.add_argument("--http", type=int, default=HTTP_PORT)
    run.add_argument("--listen", type=_address, default=("0.0.0.0", STATE_PORT))
    run.add_argument("--gdl90", type=_address, default=("255.255.255.255", GDL90_PORT))
    rep = sub.add_parser("report")
    rep.add_argument("--run", type=Path, required=True)
    args = parser.parse_args(argv)

    try:
        if args.command == "prepare":
            path = scenario.write_plugin_files(scenario.load(args.scenario), args.out, args.fly, args.feed)
            print(f"sim-flight: the flight file is {path}")
            return 0
        if args.command == "feed":
            scn = scenario.load(args.scenario)
            own = scn.get("own", {})
            me = feed.Identity(int(own.get("hex", "f0f0f0"), 16), own.get("callsign", "N1SIM"))
            the_feed = feed.Feed(args.run, me)
            try:
                feed.serve(the_feed, scenario.for_test(scn), args.http, args.listen, args.gdl90)
            except KeyboardInterrupt:
                pass
            return 0
        passed = report.write(args.run)
        print(f"sim-flight: {args.run / 'report.md'} ({'every check passed' if passed else 'a check failed'})")
        return 0 if passed else 1
    except scenario.ScenarioError as err:
        print(f"sim-flight: {err}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
