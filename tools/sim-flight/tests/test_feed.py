"""The feed: a state line in, GDL 90 out once a second, the latest state
served, and both kept in the run's folder."""

import json
import threading
import urllib.request
from http.server import ThreadingHTTPServer

from sim_flight import feed
from test_gdl90 import frames, unframe
from test_state import line

#: Own ship as the flight scripts name it.
ME = feed.Identity(0xF0F0F0, "N1SIM")


def test_a_state_becomes_one_datagram_a_second(tmp_path):
    f = feed.Feed(tmp_path, ME)
    assert f.take(line(), 100.0) is not None
    assert f.take(line(seq=4), 100.5) is None  # within the second: kept, not sent
    assert f.take(line(seq=5), 101.0) is not None
    f.close()
    assert f.received == 3
    assert len((tmp_path / "states.jsonl").read_text().splitlines()) == 3
    sent = [json.loads(x) for x in (tmp_path / "gdl90.jsonl").read_text().splitlines()]
    assert [s["at"] for s in sent] == [1763900000.0, 1763900000.0]


def test_the_datagram_is_heartbeat_ownship_geometric_altitude_then_each_target(tmp_path):
    f = feed.Feed(tmp_path, ME)
    traffic = [{"hex": "a4f001", "callsign": "N4SIM", "lat": 43.2, "lon": -89.2, "alt_m": 1828.8, "gs_mps": 56.0, "track_deg": 270}]
    out = f.take(line(on_ground=False, traffic=traffic), 0.0)
    f.close()
    ids = [unframe(x)[0] for x in frames(out)]
    assert ids == [0x00, 0x0A, 0x0B, 0x14]
    own, target = unframe(frames(out)[1]), unframe(frames(out)[3])
    assert own[1] & 0x0F == 1  # self-assigned
    assert own[2:5] == bytes.fromhex("f0f0f0")
    assert own[12] & 0x08  # airborne
    assert target[2:5] == bytes.fromhex("a4f001")
    assert target[19:27] == b"N4SIM   "


def test_what_is_not_a_state_line_is_counted_and_kept(tmp_path):
    f = feed.Feed(tmp_path, ME)
    assert f.take(b"hello", 0.0) is None
    f.close()
    assert f.refused == 1
    assert "refused" in (tmp_path / "states.jsonl").read_text()


def test_the_latest_state_and_the_scenario_are_served(tmp_path):
    f = feed.Feed(tmp_path, ME)
    f.take(line(phase="enroute"), 0.0)
    server = ThreadingHTTPServer(("127.0.0.1", 0), feed._handler(f, {"name": "test"}))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        state = json.load(urllib.request.urlopen(f"{base}/state"))
        scenario = json.load(urllib.request.urlopen(f"{base}/scenario"))
    finally:
        server.shutdown()
        f.close()
    assert state["state"]["phase"] == "enroute"
    assert state["received"] == 1
    assert scenario == {"name": "test"}
