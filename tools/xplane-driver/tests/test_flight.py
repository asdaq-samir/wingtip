"""The test flight against a stub of XPPython3's xp: the airplane placed on
the path with the flight model off and on the ground at its wheels, a
state line a second to the feed, the scripted traffic beside it, and on
the autopilot X-Plane's own flight model between the two points the file
names."""

import json
import socket

import pytest

PLANEPATH = "sim/operation/override/override_planepath"
POS = "sim/flightmodel/position/"


def spec(port, fly="path"):
    def point(name, phase, lat, alt_m, speed, ground=False, alt_ft=None):
        return {
            "name": name,
            "phase": phase,
            "ground": ground,
            "lat": lat,
            "lon": -89.0,
            "alt_m": alt_m,
            "alt_ft": alt_ft,
            "speed_mps": speed,
        }

    return {
        "name": "a short test flight",
        "fly": fly,
        "feed": {"host": "127.0.0.1", "port": port},
        "points": [
            point("Start", "takeoff", 43.0, 260.0, 0.0, ground=True),
            point("Lift-off", "takeoff", 43.003, 260.0, 30.0, ground=True),
            point("Up", "climb", 43.02, 600.0, 45.0, alt_ft=1968.5),
            point("Over", "enroute", 43.04, 600.0, 45.0, alt_ft=1968.5),
            point("Down", "landing", 43.05, 260.0, 25.0, ground=True),
            point("Stop", "rollout", 43.051, 260.0, 0.0, ground=True),
        ],
        "climb_mps": 4.0,
        "descent_mps": 3.0,
        "climb_fpm": 800,
        "descent_fpm": 600,
        "rest_s": 5.0,
        "autopilot": {"from": "Up", "to": "Over"} if fly == "autopilot" else None,
        "power": {"climb": 1.0, "enroute": 0.7},
        "traffic": [
            {
                "callsign": "N4SIM",
                "hex": "a4f001",
                "after": "Lift-off",
                "delay_s": 10.0,
                "for_s": 20.0,
                "ahead_m": 3000.0,
                "right_m": 1000.0,
                "above_m": 150.0,
                "speed_mps": 50.0,
                "turn_deg": -90.0,
            }
        ],
    }


@pytest.fixture
def feed():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("127.0.0.1", 0))
    sock.setblocking(False)
    yield sock
    sock.close()


def lines(sock):
    """What has come in on the feed so far. Read as the flight goes, as the
    Mac's feed reads it: a socket left unread until the end keeps only what
    its receive buffer holds (Linux's default, 212,992 bytes, held 166 of
    the flight's 219 lines and dropped the rest, the last among them)."""
    out = []
    while True:
        try:
            out.append(json.loads(sock.recv(65535)))
        except BlockingIOError:
            return out


def fly(fake_xp, tmp_path, feed, kind="path"):
    from wingtip_replay.flight import FlightRun
    from wingtip_replay.player import Log

    fake_xp.data[POS + "y_agl"] = 1.2  # the wheels under the reference point
    run = FlightRun(spec(feed.getsockname()[1], kind), Log(str(tmp_path / "log.txt")))
    run.start()
    return run


def test_the_airplane_is_placed_on_the_path_and_its_state_sent_each_second(fake_xp, tmp_path, feed):
    run = fly(fake_xp, tmp_path, feed)
    assert fake_xp.data[PLANEPATH] == [1]
    heights, sent = [], []
    for _ in range(10_000):
        if run.done:
            break
        run.frame(0.5)
        heights.append(fake_xp.data[POS + "local_y"])
        sent += lines(feed)
    assert run.done
    assert fake_xp.data[PLANEPATH] == [0]
    assert [s["seq"] for s in sent] == list(range(1, len(sent) + 1))
    assert len(sent) == run.out.seq  # every line sent came in
    assert sent[0]["phase"] == "takeoff" and sent[0]["on_ground"] is True
    assert heights[0] == pytest.approx(1.2)  # on the stub's ground, at the wheels
    assert max(s["alt_m"] for s in sent) == pytest.approx(600.0, abs=1.0)
    assert any(not s["on_ground"] for s in sent)
    assert sent[-1]["done"] is True and sent[-1]["point"] == "Down"
    assert sent[1]["t"] - sent[0]["t"] >= 1.0
    assert sent[5]["lat"] > sent[0]["lat"]  # north, from X-Plane's own latitude
    assert {s["phase"] for s in sent} >= {"takeoff", "climb", "enroute", "landing", "rollout"}


def test_the_scripted_traffic_comes_after_its_point_and_goes(fake_xp, tmp_path, feed):
    run = fly(fake_xp, tmp_path, feed)
    sent = []
    for _ in range(10_000):
        if run.done:
            break
        run.frame(0.5)
        sent += lines(feed)
    with_traffic = [s for s in sent if s["traffic"]]
    assert with_traffic, "the traffic was never sent"
    first = with_traffic[0]
    assert first["traffic"][0]["callsign"] == "N4SIM"
    assert first["traffic"][0]["alt_m"] > first["alt_m"]
    assert with_traffic[-1]["t"] - first["t"] <= 21.0
    assert not sent[-1]["traffic"]


def test_on_the_autopilot_x_plane_flies_between_the_two_points(fake_xp, tmp_path, feed):
    run = fly(fake_xp, tmp_path, feed, "autopilot")
    for _ in range(10_000):
        run.frame(0.5)
        if run.mode == "autopilot":
            break
    assert fake_xp.data[PLANEPATH] == [0]
    assert "sim/autopilot/servos_on" in fake_xp.commands
    run.frame(0.5)
    assert "sim/cockpit2/autopilot/heading_dial_deg_mag_pilot" in fake_xp.data
    assert fake_xp.data["sim/cockpit2/autopilot/altitude_dial_ft"] == pytest.approx(1968.5)
    assert fake_xp.data["sim/cockpit2/engine/actuators/throttle_ratio_all"] == 0.7  # the leg to Over is en route
    # X-Plane flies it past Over (the stub does not move it by itself).
    x, _, z = fake_xp.worldToLocal(43.041, -89.0, 600.0)
    fake_xp.setDatad(POS + "local_x", x)
    fake_xp.setDatad(POS + "local_z", z + 30.0)
    run.frame(0.5)
    assert run.mode == "path" and run.ap_done
    assert fake_xp.data[PLANEPATH] == [1]
    assert "sim/autopilot/servos_off_any" in fake_xp.commands
    for _ in range(10_000):
        if run.done:
            break
        run.frame(0.5)
    assert run.done
