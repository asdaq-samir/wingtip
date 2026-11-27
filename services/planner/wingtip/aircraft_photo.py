"""A photo of this very airplane, for its card: the newest Planespotters.net
has of it, by its transponder's address or its registration
(api.planespotters.net/pub/photos/hex/{hex}, .../reg/{reg}), with its
photographer and the link to the photo's own page.

Planespotters.net's photo API terms (planespotters.net/photo/api, read
2026-11-14 from the copy archived 2026-11-05; the live page turns away a
script) allow it, free and with no key, on these conditions, each kept
here or by the app that shows it:
- "Each photo must credit the photographer in text visible next to the
  image, and the thumbnail must lead back to the photo's page at
  Planespotters.net using the link URL from the API response": the
  answer's `photographer` and `link`, for the card to show.
- A server "must send a unique, descriptive User-Agent header that
  identifies the application ... and includes a contact URL or email":
  the planner's setting PLANESPOTTERS_CONTACT; unset, no photo is asked.
- "API JSON responses may be cached for up to 24 hours": KEEP_S, in the
  live store (wingtip.traffic.store's answers), pruned past it each minute.
- "Image binaries must be fetched straight from the thumbnail /
  thumbnail_large URLs we return, by the same browser or device that
  displays them", and "All URLs returned by the API ... must be used
  unchanged": the planner passes the URLs on and never fetches, keeps or
  serves the image itself.
- "You may call the API from your own backend and pass the results to
  your own website or app"; offering them to anyone else "through a
  public or third-party API, feed, bulk export, or dataset" is not, so
  the answer is the app's own route alone: not in the MCP connector's
  tools nor the gateway's documented public API.
- "Photos and metadata returned by the API must not be used to train,
  fine-tune, evaluate, or otherwise build datasets for machine-learning or
  AI models": none is.

A pilot's card asks for it apart from the airplane's record, so the record
never waits on Planespotters.net.
"""

from __future__ import annotations

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

from . import outside
from .config import get_settings, user_agent
from .traffic import store

log = logging.getLogger(__name__)

API = "https://api.planespotters.net/pub/photos/{by}/{key}"
#: How long an answer is kept, s: the terms' most, a day.
KEEP_S = 24 * 3600
TIMEOUT_S = 5.0
SOURCE = "Planespotters.net"
#: Both ways of asking, side by side: one after the other a cold card waited
#: up to 2 x TIMEOUT_S where the address had none (round 4's audit).
_ASKING = ThreadPoolExecutor(max_workers=4, thread_name_prefix="planespotters")
_HEX = re.compile(r"^[0-9a-f]{6}$")


def read(answer: dict) -> dict | None:
    """The first photo of the API's answer as the card shows it, its URLs
    unchanged; None where it has none."""
    photos = answer.get("photos") or []
    if not photos:
        return None
    p = photos[0]
    thumb, large = p.get("thumbnail") or {}, p.get("thumbnail_large") or {}
    if not p.get("link") or not (thumb.get("src") or large.get("src")):
        return None
    return {
        "thumbnail": thumb.get("src"),
        "thumbnail_large": large.get("src"),
        "width": (large.get("size") or thumb.get("size") or {}).get("width"),
        "height": (large.get("size") or thumb.get("size") or {}).get("height"),
        "photographer": p.get("photographer"),
        "link": p["link"],
        "source": SOURCE,
    }


def photo(hex_id: str | None, registration: str | None) -> dict | None:
    """This airplane's photo by its address or its registration, both asked
    at once, the first with a photo given; None where there is none, the
    API cannot be asked now, or no contact is set to ask it with. Kept a
    day, a photo or its absence; an answer missing for a failed ask is not."""
    contact = get_settings().planespotters_contact
    hex_id = (hex_id or "").lower()
    reg = re.sub(r"\s+", "", registration or "").upper()
    tries = [("hex", hex_id)] if _HEX.fullmatch(hex_id) else []
    tries += [("reg", reg)] if reg else []
    if not contact or not tries:
        return None
    key = "/".join(f"{by}:{value}" for by, value in tries)
    kept, found = store.kept_answer("photo", key, time.time())
    if kept:
        return found
    headers = {"User-Agent": user_agent(f"+{contact}")}
    failed = False
    for done in as_completed([_ASKING.submit(_ask, by, value, headers) for by, value in tries]):
        answer = done.result()
        if answer is _FAILED:
            failed = True
        elif answer:
            found = answer
            break
    else:
        if failed:
            return None  # not kept: asked again next time
    store.keep_answer("photo", key, found, time.time() + KEEP_S)
    return found


_FAILED = object()


def _ask(by: str, value: str, headers: dict):
    """One way's photo (`read`), None where it has none, _FAILED where it could not be asked now."""
    try:
        resp = outside.get(API.format(by=by, key=value), headers=headers, timeout=TIMEOUT_S)
        resp.raise_for_status()
        return read(resp.json())
    except (requests.RequestException, ValueError):
        log.info("Planespotters.net photo of %s not had now", value, exc_info=True)
        return _FAILED
