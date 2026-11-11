"""The tracks recorded here and the airplanes followed: those whose card has been opened, whose
flights are recorded from any source, card open or not. Both are kept in the live store
(wingtip.traffic.store), which the planner and ingest share: the planner records an open card's
airplane, ingest the followed ones the FAA's radar and adsb.fi hear, and a restart of either loses
none of it."""

from __future__ import annotations

import re

from . import store
from .common import _wall

#: A recorded track is kept this long, s: the archive's own reach
#: (ARCHIVE_DAYS), its flights listed with the archive's.
RECORD_KEEP_S = 30 * 86400.0
#: An airplane is followed no more this long after its card was last
#: opened, s: following is for an airplane someone is watching, and an
#: open-ended list of other people's airplanes recorded for good is not
#: what the privacy policy promises (docs/privacy-inventory.md, 30 days).
FOLLOW_KEEP_S = 30 * 86400.0

# An airplane's ICAO address, six hex digits (a TIS-B one's "~" taken off):
# all its track is kept by. The addresses come from the feeds and from
# requests; one that is not this is neither followed nor recorded, so junk
# ids from requests cannot grow the store.
_ICAO_HEX = re.compile(r"[0-9a-f]{6}")


def _key(hex_id: str) -> str | None:
    key = hex_id.lstrip("~").lower()
    return key if _ICAO_HEX.fullmatch(key) else None


def _followed(hex_id: str) -> bool:
    key = _key(hex_id)
    return key is not None and store.is_followed(key)


def followed() -> set[str]:
    """The addresses of every airplane followed."""
    return store.followed()


def follow(hex_id: str) -> None:
    """An airplane followed from now on: its card opened. Kept in the store,
    so a restart does not forget it: the owner's N3429J, its card opened
    before a restart and nothing heard of it since, was followed no more
    while the following lived in the planner's memory. Each opening starts
    its FOLLOW_KEEP_S again."""
    key = _key(hex_id)
    if key is not None:
        store.follow(key, _wall())


def _record(hex_id: str, plane: dict) -> None:
    """A watched airplane's report kept as a trace point is (`_points`), its
    time when it was heard, not when it was asked; nothing where the track
    already has a point as late."""
    key = _key(hex_id)
    if key is None:
        return
    at = round(_wall() - (plane.get("seen_s") or 0.0), 1)
    point = {
        "t": at,
        "lat": plane["lat"],
        "lon": plane["lon"],
        "alt_ft": plane.get("altitude_ft"),
        "gs_kt": plane.get("speed_kt"),
        "track_deg": plane.get("track_deg"),
        "vrate_fpm": plane.get("vertical_fpm"),
        "new_leg": False,
        "plane": plane,
    }
    store.record(key, point, at - RECORD_KEEP_S)


def _recorded(hex_id: str) -> list[dict]:
    key = _key(hex_id)
    return store.points(key) if key is not None else []


def _last_recorded(hex_id: str) -> dict | None:
    key = _key(hex_id)
    return store.last_point(key) if key is not None else None
