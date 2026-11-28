"""The tracks recorded here and the airplanes followed: those whose card has been opened, whose
flights are recorded from any source, card open or not. Both are kept in the live store
(wingtip.traffic.store), which the planner and ingest share: the planner records an open card's
airplane, ingest the followed ones the FAA's radar and adsb.lol hear, and a restart of either loses
none of it."""

from __future__ import annotations

import functools
import hashlib
import hmac
import os
import re
import secrets
from pathlib import Path

from ..config import MIN_INTERNAL_TOKEN, get_settings
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
#: background, so made-up addresses must not crowd out pilots' own. Past it, the card opened longest ago
#: goes.
FOLLOW_MOST = 500
#: The most one pilot follows at once, their share of FOLLOW_MOST: past it
#: their own card opened longest ago goes, never another pilot's (one account's 500 card opens had pushed
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


class ShareKeyMissing(RuntimeError):
    """No key to hash the pilots' shares with: the planner does not start."""


def _key_file(path: Path) -> bytes:
    """The development stack's key, made once at random into `path` (the
    planner's own secrets volume, docker-compose.yml) and read back from
    then on, so every restart hashes a pilot alike. Written beside and
    linked into place, so a second process never reads it half written;
    one shorter than a key should be is refused, never used."""
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        fresh = path.with_name(f".{path.name}.{os.getpid()}")
        fd = os.open(fresh, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as out:
            out.write(secrets.token_hex(32))
        try:
            os.link(fresh, path)
        except FileExistsError:
            pass
        finally:
            fresh.unlink()
    key = path.read_text().strip()
    if len(key) < MIN_INTERNAL_TOKEN:
        raise ShareKeyMissing(
            f"FOLLOW_SHARE_KEY_FILE ({path}) holds fewer than {MIN_INTERNAL_TOKEN} characters: delete it to have one made"
        )
    return key.encode()


@functools.cache
def _share_key() -> bytes:
    """FOLLOW_SHARE_KEY, else the development stack's FOLLOW_SHARE_KEY_FILE;
    neither is an error, never a key of the store's own. The key is kept
    apart from the shares it hashes: one kept in the live store beside
    them let whoever read the store test guessed ids."""
    settings = get_settings()
    if settings.follow_share_key:
        return settings.follow_share_key.encode()
    if settings.follow_share_key_file:
        return _key_file(settings.follow_share_key_file)
    raise ShareKeyMissing(
        "FOLLOW_SHARE_KEY is not set: the key the followed airplanes' shares are hashed with "
        "(openssl rand -hex 32; production's deploy.sh writes it from the stack's FollowShareKeySecret)"
    )


def require_share_key() -> None:
    """The planner's start: no key, no start (app.main), rather than a
    first card opened failing."""
    _share_key()


def share_of(pilot: str) -> str:
    """A pilot's share of the followed airplanes, by a short keyed hash of
    their id (HMAC-SHA-256 with a server secret): the store counts a
    pilot's follows without naming them, and without the key no one can
    tell whose share is whose by hashing ids they guess, an email or a
    number in order among them (docs/privacy-inventory.md)."""
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
