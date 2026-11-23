"""GDL 90 written, as a portable ADS-B receiver sends it to UDP port 4000:
the stream the phones' receiver listens for and the engine's receiver_read
reads (engine/crates/receiver). The simulator is the receiver here, so its
own ship and the scripted traffic reach the iPhone and the Android app as
a Stratux's or a Sentry's would.

Only writing: every figure read from the stream is the engine's, and the
runner has the engine read back what was sent (scripts/dev/sim-flight.sh).
The layouts are Garmin's GDL 90 Data Interface Specification
(560-1058-00 Rev A): the frame and its CRC (2.2), the Heartbeat (3.1), the
Ownship Report and the Traffic Report, which share one layout (3.4, 3.5),
and the Ownship Geometric Altitude (3.8). Standard library only.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass

FLAG = 0x7E
ESCAPE = 0x7D

HEARTBEAT, OWNSHIP, GEO_ALTITUDE, TRAFFIC = 0x00, 0x0A, 0x0B, 0x14

#: A latitude or longitude step: 180 / 2^23 degrees (3.5.1.4).
_STEPS_PER_DEG = (1 << 23) / 180.0


def _crc_table() -> list[int]:
    """CRC-CCITT's table, the specification's own code (2.2.3)."""
    table = []
    for i in range(256):
        crc = (i << 8) & 0xFFFF
        for _ in range(8):
            crc = ((crc << 1) ^ (0x1021 if crc & 0x8000 else 0)) & 0xFFFF
        table.append(crc)
    return table


_TABLE = _crc_table()


def crc(message: bytes) -> int:
    """The frame check of a message (its ID and data), as 2.2.3 computes it."""
    value = 0
    for byte in message:
        value = _TABLE[value >> 8] ^ ((value << 8) & 0xFFFF) ^ byte
    return value


def frame(message: bytes) -> bytes:
    """The message with its CRC (least significant byte first), the flag
    and control-escape bytes inside escaped (2.2.1), between two flags."""
    check = crc(message)
    body = message + bytes((check & 0xFF, check >> 8))
    out = bytearray([FLAG])
    for byte in body:
        if byte in (FLAG, ESCAPE):
            out += bytes((ESCAPE, byte ^ 0x20))
        else:
            out.append(byte)
    out.append(FLAG)
    return bytes(out)


def heartbeat(seconds_of_day: int, gps_valid: bool = True) -> bytes:
    """The Heartbeat (3.1): GPS position valid and the UAT initialised in
    the first status byte, UTC OK and the time stamp's 17th bit in the
    second, the seconds since 0000Z least significant byte first, and no
    uplink or basic messages counted."""
    stamp = int(seconds_of_day) % 86400
    status1 = (0x80 if gps_valid else 0x00) | 0x01
    status2 = ((stamp >> 16) & 0x01) << 7 | 0x01
    return frame(bytes((HEARTBEAT, status1, status2, stamp & 0xFF, (stamp >> 8) & 0xFF, 0, 0)))


@dataclass(frozen=True)
class Report:
    """One airplane, as the Ownship and Traffic Reports carry it (3.5.1):
    feet, knots and feet a minute, the track true."""

    address: int
    lat: float
    lon: float
    pressure_ft: float | None
    airborne: bool
    speed_kt: float | None
    vertical_fpm: float | None
    track_deg: float | None
    callsign: str = ""
    emitter: int = 1  # light, under 15,500 lb (3.5.1.10)
    nic: int = 8
    nacp: int = 9
    address_type: int = 0  # ADS-B with an ICAO address (3.5.1.2)


def _semicircles(degrees: float) -> bytes:
    raw = int(round(degrees * _STEPS_PER_DEG)) & 0xFFFFFF
    return raw.to_bytes(3, "big")


def _report_bytes(r: Report) -> bytes:
    """The 27 data bytes (3.5.1): status and address type, address,
    latitude, longitude, altitude in 25 ft steps from -1,000 ft and the
    miscellaneous indicators, NIC and NACp, horizontal and vertical
    velocity, track in 360/256 degree steps, emitter, call sign, and no
    emergency."""
    altitude = 0xFFF if r.pressure_ft is None else max(0, min(0xFFE, int(round((r.pressure_ft + 1000.0) / 25.0))))
    # Misc (3.5.1.5): bit 3 airborne, bits 0-1 the track's kind (01 true
    # track, 00 none valid), not extrapolated.
    misc = (0x08 if r.airborne else 0x00) | (0x01 if r.track_deg is not None else 0x00)
    speed = 0xFFF if r.speed_kt is None else max(0, min(0xFFE, int(round(r.speed_kt))))
    if r.vertical_fpm is None:
        vertical = 0x800
    else:
        vertical = max(-510, min(510, int(round(r.vertical_fpm / 64.0)))) & 0xFFF
    track = 0 if r.track_deg is None else int(round((r.track_deg % 360.0) / (360.0 / 256.0))) & 0xFF
    callsign = r.callsign.upper().encode("ascii", "replace")[:8].ljust(8, b" ")
    return (
        bytes(((0 << 4) | (r.address_type & 0x0F),))
        + (r.address & 0xFFFFFF).to_bytes(3, "big")
        + _semicircles(r.lat)
        + _semicircles(r.lon)
        + bytes(((altitude >> 4) & 0xFF, ((altitude & 0x0F) << 4) | misc))
        + bytes((((r.nic & 0x0F) << 4) | (r.nacp & 0x0F),))
        + bytes(((speed >> 4) & 0xFF, ((speed & 0x0F) << 4) | ((vertical >> 8) & 0x0F), vertical & 0xFF))
        + bytes((track, r.emitter & 0xFF))
        + callsign
        + b"\x00"
    )


def ownship(report: Report) -> bytes:
    """The Ownship Report (3.4), framed."""
    return frame(bytes((OWNSHIP,)) + _report_bytes(report))


def traffic(report: Report) -> bytes:
    """A Traffic Report (3.5), framed."""
    return frame(bytes((TRAFFIC,)) + _report_bytes(report))


def geo_altitude(feet: float, vfom_m: int = 10) -> bytes:
    """The Ownship Geometric Altitude (3.8): 5 ft steps, then the vertical
    figure of merit in metres, no vertical warning."""
    steps = int(round(feet / 5.0))
    return frame(bytes((GEO_ALTITUDE,)) + struct.pack(">hH", steps, vfom_m & 0x7FFF))
