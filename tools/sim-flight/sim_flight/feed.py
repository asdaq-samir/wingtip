"""The feed between a simulator and the apps, run on the Mac beside X-Plane
for the length of a test flight (scripts/dev/sim-flight.sh run):

- it listens for the simulator's state lines (sim_flight.state) on UDP;
- it sends each as GDL 90 (sim_flight.gdl90) to UDP port 4000, where the
  iPhone's and the Android app's receiver listen (a Stratux's port), once
  a second: Heartbeat, Ownship, Ownship Geometric Altitude and a Traffic
  Report for each scripted airplane, in one datagram;
- it serves the latest state over HTTP (GET /state) to the browser test
  (apps/web/e2e/sim/flight.sim.ts), which hands it to the web app as its
  GPS, since a browser can listen on no UDP port;
- it keeps every state line and every GDL 90 datagram sent in the run's
  folder (states.jsonl, gdl90.jsonl), which the report reads and the
  engine's receiver_read reads back.

Standard library only (and wingtip.units), so it runs on the Mac's own
Python with services/planner on PYTHONPATH.
"""

from __future__ import annotations

import base64
import json
import socket
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from . import gdl90
from .state import State, StateError, as_json, parse

#: GDL 90's Ownship and Heartbeat come once a second (the specification,
#: 3.1 and 3.4); a simulator that sends faster is thinned to that.
SEND_EVERY_S = 1.0


@dataclass(frozen=True)
class Identity:
    """Who own ship is in the reports: a self-assigned address (GDL 90
    3.5.1.2's type 1), as a receiver with no transponder link gives it."""

    address: int = 0xF0F0F0
    callsign: str = "N1SIM"


def _report(c, address: int, callsign: str, airborne: bool, pressure_ft: float | None, address_type: int) -> gdl90.Report:
    return gdl90.Report(
        address=address,
        lat=c.lat,
        lon=c.lon,
        pressure_ft=pressure_ft,
        airborne=airborne,
        speed_kt=c.gs_kt,
        vertical_fpm=c.vs_fpm,
        track_deg=c.track_deg,
        callsign=callsign,
        address_type=address_type,
    )


def datagram(s: State, me: Identity) -> bytes:
    """One second of the receiver's stream for state `s`."""
    own = s.own
    pressure = s.pressure_ft if s.pressure_ft is not None else own.alt_ft
    out = gdl90.heartbeat(int(s.utc % 86400))
    out += gdl90.ownship(_report(own, me.address, me.callsign, not s.on_ground, pressure, 1))
    out += gdl90.geo_altitude(own.alt_ft)
    for other in s.traffic:
        address = int(other.hex, 16) if other.hex else 0
        # The scripted airplane's height is geometric; a receiver reports
        # traffic by pressure altitude, which on the standard day the
        # simulator flies is the same.
        out += gdl90.traffic(_report(other, address, other.callsign, True, other.alt_ft, 0))
    return out


class Feed:
    """The latest state and what has been sent, kept in `folder`."""

    def __init__(self, folder: Path, me: Identity = Identity()) -> None:
        self.folder = folder
        self.me = me
        self.latest: State | None = None
        self.received = 0
        self.refused = 0
        self.sent_at: float | None = None
        self.lock = threading.Lock()
        folder.mkdir(parents=True, exist_ok=True)
        self._states = open(folder / "states.jsonl", "a", encoding="utf-8")
        self._gdl90 = open(folder / "gdl90.jsonl", "a", encoding="utf-8")

    def close(self) -> None:
        self._states.close()
        self._gdl90.close()

    def take(self, raw: bytes, now: float) -> bytes | None:
        """A datagram from the simulator: kept as the latest state, and the
        GDL 90 to send for it, or None where a second has not passed since
        the last (or the datagram is no state line)."""
        try:
            s = parse(raw)
        except StateError as err:
            with self.lock:
                self.refused += 1
            self._states.write(json.dumps({"at": now, "refused": str(err)}) + "\n")
            return None
        with self.lock:
            self.latest = s
            self.received += 1
            due = self.sent_at is None or now - self.sent_at >= SEND_EVERY_S
            if due:
                self.sent_at = now
        self._states.write(json.dumps({"at": now, **as_json(s)}) + "\n")
        self._states.flush()
        if not due:
            return None
        out = datagram(s, self.me)
        self._gdl90.write(json.dumps({"at": s.utc, "data": base64.b64encode(out).decode()}) + "\n")
        self._gdl90.flush()
        return out

    def snapshot(self, now: float) -> dict:
        """What GET /state answers: the latest state, how many came, and
        how long ago the last one did."""
        with self.lock:
            latest, received, refused, sent = self.latest, self.received, self.refused, self.sent_at
        return {
            "state": None if latest is None else as_json(latest),
            "received": received,
            "refused": refused,
            "age_s": None if sent is None else round(now - sent, 2),
        }


def _handler(feed: Feed, scenario: dict):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802 (the standard library's name)
            if self.path.startswith("/state"):
                body = feed.snapshot(time.time())
            elif self.path.startswith("/scenario"):
                body = scenario
            else:
                self.send_error(404, "GET /state or /scenario")
                return
            data = json.dumps(body).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *_args):  # one line a second would bury the runner's own
            return

    return Handler


def serve(feed: Feed, scenario: dict, http_port: int, listen: tuple[str, int], send_to: tuple[str, int]) -> None:
    """Runs the feed until interrupted: the simulator's datagrams on
    `listen`, GDL 90 to `send_to` (a broadcast address reaches every phone
    on the Wi-Fi), the browser test's HTTP on `http_port`."""
    inbox = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    inbox.bind(listen)
    outbox = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    outbox.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    server = ThreadingHTTPServer(("0.0.0.0", http_port), _handler(feed, scenario))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(
        f"sim-flight feed: state lines on udp {listen[0]}:{listen[1]}, GDL 90 to {send_to[0]}:{send_to[1]}, http :{http_port}", flush=True
    )
    try:
        while True:
            raw, _ = inbox.recvfrom(65535)
            out = feed.take(raw, time.time())
            if out:
                try:
                    outbox.sendto(out, send_to)
                except OSError as err:  # no route to the Wi-Fi: the web's leg still runs
                    print(f"sim-flight feed: GDL 90 not sent: {err}", flush=True)
    finally:
        server.shutdown()
        feed.close()
