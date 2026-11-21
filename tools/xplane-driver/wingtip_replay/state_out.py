"""The simulator's state, sent once a second to the test flight's feed on
the Mac (tools/sim-flight/sim_flight/feed.py) as one JSON object a UDP
datagram, a "state line" (sim_flight.state says its fields). Plain
Python: XPPython3's Python has the standard library's socket.
"""

from __future__ import annotations

import json
import socket

#: Once a second, as a GPS and a GDL 90 receiver report.
EVERY_S = 1.0


class StateOut:
    """Sends a state line at most every EVERY_S of the flight's clock."""

    def __init__(self, host: str, port: int) -> None:
        self.to = (host, int(port))
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.seq = 0
        self.last_t: float | None = None
        self.failed = 0

    def due(self, t: float) -> bool:
        return self.last_t is None or t - self.last_t >= EVERY_S or t < self.last_t

    def send(self, t: float, line: dict) -> bool:
        """The line sent, numbered; False where the feed is not there (the
        flight goes on: the feed may start late)."""
        self.last_t = t
        self.seq += 1
        data = json.dumps({"sim": "xplane", "seq": self.seq, "t": round(t, 2), **line}).encode()
        try:
            self.sock.sendto(data, self.to)
            return True
        except OSError:
            self.failed += 1
            return False

    def close(self) -> None:
        self.sock.close()
