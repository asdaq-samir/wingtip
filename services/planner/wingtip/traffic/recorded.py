"""The tracks recorded here and the airplanes followed: those whose card has been opened, whose
flights are recorded from any source, card open or not. Both are kept in the live store
(wingtip.traffic.store), which the planner and ingest share: the planner records an open card's
airplane, ingest the followed ones the FAA's radar and adsb.lol hear, and a restart of either loses
none of it."""

from __future__ import annotations

import functools
import hashlib
import hmac
import re

from ..config import get_settings
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
#: The most airplanes followed at once: each is asked of adsb.lol in the
#: background, so made-up addresses must not crowd out pilots' own (the
#: security review of 2026-11-23, M5). Past it, the card opened longest ago
#: goes.
FOLLOW_MOST = 500
#: The most one pilot follows at once, their share of FOLLOW_MOST: past it
#: their own card opened longest ago goes, never another pilot's (the
#: safety audit of 2026-11-23, M5: one account's 500 card opens had pushed
#: every other pilot's followed airplanes out).
FOLLOW_EACH = 20
#: A followed airplane no source has heard from in this long, s, followed
#: no more: an address made up, or one no feeder hears.
FOLLOW_UNHEARD_S = 86400.0

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


def followed() -> list[str]:
    """The addresses of every airplane followed, the card opened latest first."""
    return store.followed()


@functools.cache
def _share_key() -> bytes:
    """FOLLOW_SHARE_KEY where the settings give it, else the store's own."""
    key = get_settings().follow_share_key
    return key.encode() if key else store.share_key()


def share_of(pilot: str) -> str:
    """A pilot's share of the followed airplanes, by a short keyed hash of
    their id (HMAC-SHA-256 with a server secret): the store counts a
    pilot's follows without naming them, and without the key no one can
    tell whose share is whose by hashing ids they guess, an email or a
    number in order among them (docs/privacy-inventory.md; the round 6
    audit, P1)."""
    return hmac.new(_share_key(), pilot.encode(), hashlib.sha256).hexdigest()[:12] if pilot else ""


def follow(hex_id: str, pilot: str = "") -> None:
    """An airplane followed from now on: its card opened, by `pilot` (the
    one share "" for a follow no pilot asked, ingest's and the tests').
    Kept in the store, so a restart does not forget it: the owner's N3429J,
    its card opened before a restart and nothing heard of it since, was
    followed no more while the following lived in the planner's memory.
    Each opening starts its FOLLOW_KEEP_S again."""
    key = _key(hex_id)
    if key is not None:
        store.follow(key, share_of(pilot), _wall(), FOLLOW_EACH, FOLLOW_MOST)


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
