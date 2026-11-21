"""GDL 90 as written here, held to the specification's own examples and to
the frames the engine's receiver tests are built from
(apps/web/src/lib/fixtures/gdl90.json, by engine/crates/receiver/tests/stream.rs)."""

import json

from conftest import REPO
from sim_flight import gdl90

STREAM = json.loads((REPO / "apps/web/src/lib/fixtures/gdl90.json").read_text())
FIRST = bytes.fromhex(STREAM["datagrams"][0]["hex"])
STEP = 180.0 / (1 << 23)


def frames(data: bytes) -> list[bytes]:
    """The datagram's frames, each with its flags."""
    out, at = [], 0
    while (at := data.find(b"\x7e", at)) >= 0:
        end = data.index(b"\x7e", at + 1)
        out.append(data[at : end + 1])
        at = end + 1
    return out


def unframe(framed: bytes) -> bytes:
    """The message inside a frame, unescaped, its CRC checked and taken off."""
    body = bytearray()
    escaped = False
    for byte in framed[1:-1]:
        if escaped:
            body.append(byte ^ 0x20)
            escaped = False
        elif byte == 0x7D:
            escaped = True
        else:
            body.append(byte)
    message, check = bytes(body[:-2]), body[-2] | body[-1] << 8
    assert gdl90.crc(message) == check
    return message


def test_the_specifications_heartbeat_is_framed_with_its_crc():
    # 560-1058-00 Rev A, 2.2.4: 7E 00 81 41 DB D0 08 02 B3 8B 7E.
    assert gdl90.frame(bytes.fromhex("008141dbd00802")) == bytes.fromhex("7e008141dbd00802b38b7e")


def test_the_specifications_traffic_report_is_written_byte_for_byte():
    # 3.5.4's example: N825V, 44.90708 N 122.99488 W, 5,000 ft, airborne,
    # NIC 10, NACp 9, 123 kt, climbing 64 ft/min, track 45, light.
    report = gdl90.Report(
        address=0xAB4549,
        lat=0x1FEF15 * STEP,
        lon=(0xA88978 - (1 << 24)) * STEP,
        pressure_ft=5000,
        airborne=True,
        speed_kt=123,
        vertical_fpm=64,
        track_deg=45,
        callsign="N825V",
        nic=10,
        nacp=9,
    )
    assert gdl90.traffic(report) in frames(FIRST)


def test_own_ship_is_written_as_the_engines_test_stream_has_it():
    # stream.rs: N12345, A12345, 41.95 N 87.9 W, 3,000 ft, 110 kt, track 90;
    # its longitude's 0x7E escaped (7D 5E).
    report = gdl90.Report(
        address=0xA12345,
        lat=41.95,
        lon=-87.9,
        pressure_ft=3000,
        airborne=True,
        speed_kt=110,
        vertical_fpm=0,
        track_deg=90,
        callsign="N12345",
    )
    written = gdl90.ownship(report)
    assert b"\x7d\x5e" in written
    assert written in frames(FIRST)


def test_the_geometric_altitude_is_in_five_foot_steps():
    assert gdl90.geo_altitude(3200) in frames(FIRST)


def test_a_flag_or_escape_inside_is_escaped_and_the_crc_covers_the_bytes_before():
    message = bytes((0x0A, 0x7E, 0x7D, 0x01))
    framed = gdl90.frame(message)
    assert framed[0] == framed[-1] == 0x7E
    assert 0x7E not in framed[1:-1]
    assert unframe(framed) == message


def test_the_heartbeat_carries_the_seconds_since_midnight_and_its_17th_bit():
    beat = unframe(gdl90.heartbeat(70000))
    assert beat[:2] == bytes((0x00, 0x81))
    assert beat[2] == 0x81  # 70,000 is over 65,535: the 17th bit, and UTC OK
    assert beat[3:5] == (70000 & 0xFFFF).to_bytes(2, "little")


def test_unknown_figures_are_written_as_the_specification_marks_them():
    report = gdl90.Report(address=1, lat=0, lon=0, pressure_ft=None, airborne=False, speed_kt=None, vertical_fpm=None, track_deg=None)
    data = unframe(gdl90.ownship(report))[1:]  # the 27 bytes after the ID
    assert data[10] == 0xFF and data[11] >> 4 == 0x0F  # altitude 0xFFF
    assert data[11] & 0x0F == 0  # on the ground, no track
    assert data[13] == 0xFF and data[14] >> 4 == 0x0F  # speed 0xFFF
    assert (data[14] & 0x0F) << 8 | data[15] == 0x800  # vertical speed unknown
