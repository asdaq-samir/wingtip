"""The FAA's NOTAM Management Service API (NMS-API, decision 0059): the
full set of NOTAMs in force, which SWIM's feed (ingest.swim) never sends,
into wingtip.notams' store, then its changes every few minutes.

- The initial load (GET /nmsapi/v1/notams/il): every NOTAM in force, a
  compressed AIXM 5.1 file the API points to, once when the store holds
  none and again whenever the store has fallen a day behind
  (RELOAD_AFTER_S).
- The changes (GET /nmsapi/v1/notams?lastUpdatedDate=...): each NOTAM
  issued, replaced or cancelled since the last ask, every EVERY_S, the
  most often NMS allows.

Both are AIXM as FNS sends it, read by the engine's same rule
(notams_fns), so a NOTAM heard from both is one row of the store, kept by
its place and number (wingtip.notams). Signed in with OAuth 2.0's client
credentials (RFC 6749 4.4): the client id and secret the FAA issues with
access, which is asked of it by mail (docs/partners/faa-nms-api.md). Off
until NMS_API_CLIENT_ID and NMS_API_CLIENT_SECRET are set.

The paths, the token's and the response's shapes are those the FAA's
onboarding gives (nms-api.yaml), as third-party clients of the API use
them; they were not checked against the FAA's own document, which comes
with access: TODO(nms-access) check them against it when it does.
"""

from __future__ import annotations

import gzip
import io
import logging
import re
import time
import zipfile
from datetime import datetime, timezone
from urllib.parse import urljoin

from apscheduler.schedulers.base import BaseScheduler
from wingtip import notams, outside, schedule

from .settings import get_settings

log = logging.getLogger(__name__)

#: How often the changes are asked, s: NMS allows one ask of its changes
#: each three minutes in production.
EVERY_S = 180.0
#: How far behind the store may fall before the whole set is loaded
#: again, s: NMS allows one initial load a day.
RELOAD_AFTER_S = 24 * 3600.0
#: How far before the last ask the next one asks from, s: a NOTAM NMS
#: stamped as the last ask was made is not missed; one asked twice is
#: kept once.
OVERLAP_S = 60.0
#: How many of a load's NOTAMs are read in one go, so the engine never
#: holds the country's 80,000 at once.
CHUNK = 500
#: A timeout for each request, s: the load's file is tens of megabytes.
TIMEOUT_S = 120.0

#: The last ask's state, written to the store as ingest's beat (ingest.main).
STATE: dict = {"connected": False, "messages": 0, "items": 0, "last_at": None, "error": None}


def configured() -> bool:
    settings = get_settings()
    return bool(settings.nms_api_host and settings.nms_api_client_id and settings.nms_api_client_secret)


class Client:
    """NMS's API signed in: a bearer token asked for with the client's
    credentials, asked again a minute before it ends."""

    def __init__(self, session=None):
        settings = get_settings()
        self.host = settings.nms_api_host.rstrip("/")
        self.auth = (settings.nms_api_client_id, settings.nms_api_client_secret)
        self.session = session or outside.session(pool=2)
        self.token: str | None = None
        self.until = 0.0

    def _bearer(self) -> str:
        if self.token is None or time.time() >= self.until:
            resp = self.session.post(f"{self.host}/v1/auth/token", auth=self.auth, data={"grant_type": "client_credentials"}, timeout=30)
            resp.raise_for_status()
            body = resp.json()
            self.token = body["access_token"]
            self.until = time.time() + float(body.get("expires_in", 1800)) - 60
        return self.token

    def get(self, path: str, **params):
        """A GET of the API's `path`, AIXM asked for: one under /nmsapi
        ("v1/notams"), or one from the host's root ("/nmsapi/v1/content/...")."""
        headers = {"Authorization": f"Bearer {self._bearer()}", "nmsResponseFormat": "AIXM", "Accept": "*/*"}
        url = urljoin(f"{self.host}/nmsapi/", path)
        resp = self.session.get(url, params=params, headers=headers, timeout=TIMEOUT_S)
        resp.raise_for_status()
        return resp


def _unpacked(body: bytes) -> str:
    """A load's file as text: gzipped, zipped (its members one after
    another) or as it came."""
    if body[:2] == b"\x1f\x8b":
        body = gzip.decompress(body)
    elif body[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(body)) as z:
            body = b"".join(z.read(name) for name in z.namelist())
    return body.decode("utf-8", "replace")


_DOCUMENT = re.compile(r"<\?xml[^>]*\?>")
_ROOT = re.compile(r"<(?![?!])([\w.:-]+)[^>]*>")
_MEMBER = re.compile(r"<((?:[\w.-]+:)?hasMember)\b.*?</\1>", re.S)


def chunks(text: str, size: int = CHUNK):
    """A load's AIXM in messages the engine reads, each `size` of its
    members at most under its root's own tag (its namespaces with it): one
    document of the whole set, or several one after another."""
    for doc in (d for d in _DOCUMENT.split(text) if d.strip()):
        root = _ROOT.search(doc)
        members = [m.group(0) for m in _MEMBER.finditer(doc)]
        if root is None or len(members) <= size:
            yield doc
            continue
        for at in range(0, len(members), size):
            yield root.group(0) + "".join(members[at : at + size]) + f"</{root.group(1)}>"


def _messages(resp) -> list[str]:
    """The AIXM messages of a search's answer, {"data": {"aixm": [...]}}."""
    data = (resp.json() or {}).get("data") or {}
    return [m for m in data.get("aixm") or [] if isinstance(m, str)]


def initial_load(client: Client) -> int:
    """Every NOTAM in force, into the store. The API answers with the
    file itself, a redirect to it (followed) or {"data": {"url"}}, a path
    to fetch it from. How many NOTAMs it gave."""
    asked = time.time()
    resp = client.get("v1/notams/il")
    if "json" in resp.headers.get("Content-Type", ""):
        url = ((resp.json() or {}).get("data") or {}).get("url")
        if not url:
            raise ValueError("NMS's initial load gave no file")
        # A link elsewhere (a signed download) is fetched as it is; one of
        # the API's own, signed in.
        resp = client.session.get(url, timeout=TIMEOUT_S) if url.startswith("http") else client.get(url)
        resp.raise_for_status()
    found = notams.loaded(chunks(_unpacked(resp.content)), asked=asked)
    log.info("NMS initial load: %d NOTAMs", found)
    return found


def _stamp(t: float) -> str:
    return datetime.fromtimestamp(int(t), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def update(client: Client, since: float) -> int:
    """The NOTAMs issued, replaced or cancelled since `since`, into the
    store, which is then up to date to when they were asked. How many
    NOTAMs they gave."""
    asked = time.time()
    messages = _messages(client.get("v1/notams", lastUpdatedDate=_stamp(since - OVERLAP_S)))
    found = sum(notams.heard(m) for m in messages)
    notams.synced(asked)
    STATE["messages"] += len(messages)
    return found


def job(client: Client) -> None:
    """One turn: the whole set where the store holds none or has fallen a
    day behind, else the changes since the last; the turn's state kept
    for the beat. A failure leaves the store as it was: it is not the
    full set once FULL_SYNC_WITHIN_S has passed (wingtip.notams.full_set)."""
    now = time.time()
    loaded, synced = notams.nms_state()
    try:
        if loaded is None or now - (synced or loaded) > RELOAD_AFTER_S:
            found = initial_load(client)
        else:
            # The first changes after a load reach back to before its file
            # was made (wingtip.notams.LOAD_AGE_S).
            found = update(client, synced or loaded - notams.LOAD_AGE_S)
        STATE.update(connected=True, error=None, last_at=time.time())
        STATE["items"] += found
    except Exception as err:  # noqa: BLE001 -- any failure: asked again next turn
        STATE.update(connected=False, error=f"{type(err).__name__}: {str(err)[:200]}")
        log.warning("NMS: %s", STATE["error"])


def start(on: BaseScheduler) -> bool:
    """The NMS job on `on` every EVERY_S, where its credentials are set."""
    if not configured():
        return False
    schedule.every(on, EVERY_S, job, name="nms", args=(Client(),))
    return True
