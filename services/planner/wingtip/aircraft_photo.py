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
  live store (wingtip.kept_answers), pruned past it each minute.
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

import functools
import logging
import re
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from enum import Enum

import requests

from . import kept_answers, outside, ratelimit, single_flight
from .figure import number
from .config import get_settings, user_agent

log = logging.getLogger(__name__)

API = "https://api.planespotters.net/pub/photos/{by}/{key}"
#: How long an answer is kept, s: the terms' most, a day.
KEEP_S = 24 * 3600
TIMEOUT_S = 5.0
SOURCE = "Planespotters.net"
#: The registration is asked too where the address has not answered in this
#: long, s (a hedged ask): one after the other a cold card waited up to
#: 2 x TIMEOUT_S where the address had none (round 4's audit), and both at
#: once doubled every card's requests to Planespotters.net (round 5's).
HEDGE_S = 1.0
#: After a refusal, a 5xx or no answer in time, Planespotters.net is not
#: asked for this long, s (its Retry-After where longer, held to an hour):
#: while it failed every card's open asked it again, both ways, and the
#: shared session asked each up to three times more on a 429 or 5xx,
#: honouring Retry-After up to 30 s inside the card's request (round 6's
#: audit, N5). Its terms limit the requests a server may send.
HOLD_S = 60.0
_SOURCE = ratelimit.Gate(hold_most_s=3600.0)
_ASKING = ThreadPoolExecutor(max_workers=4, thread_name_prefix="planespotters")
_HEX = re.compile(r"^[0-9a-f]{6}$")


class Asked(Enum):
    """How one way's ask ended: a photo, none to be had, or not asked now (not kept)."""

    PHOTO = "photo"
    NONE = "none"
    FAILED = "failed"


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
    """This airplane's photo by its address, else its registration; None
    where there is none, the API cannot be asked now, or no contact is set
    to ask it with. The registration is asked once the address has none,
    or has not answered in HEDGE_S; the address's photo is the one given
    where both have one in hand. Kept a day, a photo or its absence; an
    answer missing for a failed ask is not."""
    contact = get_settings().planespotters_contact
    hex_id = (hex_id or "").lower()
    reg = re.sub(r"\s+", "", registration or "").upper()
    tries = [("hex", hex_id)] if _HEX.fullmatch(hex_id) else []
    tries += [("reg", reg)] if reg else []
    if not contact or not tries:
        return None
    key = "/".join(f"{by}:{value}" for by, value in tries)
    kept, found = kept_answers.kept("photo", key, time.time())
    if kept:
        return found
    # Two phones opening one airplane at once: one asks, the other waits for its answer.
    with single_flight.one_at_a_time(("planespotters", key)):
        kept, found = kept_answers.kept("photo", key, time.time())
        if kept:
            return found
        if _SOURCE.held(time.monotonic()):
            return None
        headers = {"User-Agent": user_agent(f"+{contact}")}
        answers = _hedged([lambda by=by, value=value: _ask(by, value, headers) for by, value in tries])
        found = next((a for state, a in answers if state is Asked.PHOTO), None)
        if found is None and any(state is Asked.FAILED for state, _ in answers):
            return None  # not kept: asked again next time
        kept_answers.keep("photo", key, found, time.time() + KEEP_S)
        return found


def _hedged(asks: list) -> list[tuple[Asked, dict | None]]:
    """Each way's answer that came, in the order asked, stopping at the
    first photo: the first way asked in the pool, the next once it has
    none or has not answered in HEDGE_S; a way's photo first in the list
    wherever its answer is in hand."""
    first = _ASKING.submit(asks[0])
    done, _ = wait([first], timeout=HEDGE_S)
    # A first way refused is not followed by the second: the source is held.
    if len(asks) == 1 or (done and first.result()[0] is not Asked.NONE):
        return [first.result()]
    if done:
        return [first.result(), asks[1]()]
    second = _ASKING.submit(asks[1])
    pending = {first, second}
    while pending:
        _, pending = wait(pending, return_when=FIRST_COMPLETED)
        answers = [f.result() for f in (first, second) if f.done()]
        if any(state is Asked.PHOTO for state, _ in answers):
            return answers
    return answers


def _ask(by: str, value: str, headers: dict) -> tuple[Asked, dict | None]:
    """One way's answer: (PHOTO, the photo as `read` gives it), (NONE, None) or (FAILED, None)."""
    if _SOURCE.held(time.monotonic()):
        return Asked.FAILED, None
    try:
        resp = _get(API.format(by=by, key=value), headers=headers, timeout=TIMEOUT_S)
        if resp.status_code == 429 or resp.status_code >= 500:
            _SOURCE.hold(max(HOLD_S, number(resp.headers.get("Retry-After")) or 0.0), time.monotonic())
        resp.raise_for_status()
        found = read(resp.json())
    except (requests.RequestException, ValueError) as err:
        if not isinstance(err, requests.HTTPError):
            _SOURCE.hold(HOLD_S, time.monotonic())
        log.info("Planespotters.net photo of %s not had now", value, exc_info=True)
        return Asked.FAILED, None
    return (Asked.PHOTO, found) if found else (Asked.NONE, None)


@functools.cache
def _session():
    # One try: the card's TIMEOUT_S is the most a way waits, and a refusal
    # holds the source (_SOURCE) where the shared session asked again.
    return outside.session(retries=False, pool=4)


def _get(url: str, **kwargs):
    return _session().get(url, **kwargs)
