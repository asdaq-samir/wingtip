"""ingest.nms: the NOTAM Management Service API signed in, its initial load
fetched and read in chunks, then its changes, each turn chosen by what the
store holds. The store's side (one row a NOTAM, the full set) is
wingtip.notams' own test (tests_wingtip/test_notams_full_set.py); here it
is a stand-in that records what it was handed, and the API a stand-in
session that answers as NMS does."""

import gzip
import json

import pytest

from ingest import nms

ROOT = '<message:AIXMBasicMessage xmlns:message="http://www.aixm.aero/schema/5.1/message">'


def member(n: int) -> str:
    return f"<message:hasMember><event:Event>{n}</event:Event></message:hasMember>"


class Answer:
    def __init__(self, body=b"", kind="application/octet-stream", status=200):
        self.content = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.headers = {"Content-Type": kind}
        self.status_code = status

    def json(self):
        return json.loads(self.content)

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class Session:
    """NMS as a stand-in: a token, the load's pointer and file, and changes."""

    def __init__(self, load: bytes):
        self.load = load
        self.asked: list[tuple[str, dict, dict]] = []

    def post(self, url, auth, data, timeout):
        self.asked.append((url, data, {"auth": auth}))
        return Answer({"access_token": "t1", "expires_in": 1799}, "application/json")

    def get(self, url, params=None, headers=None, timeout=None):
        self.asked.append((url, params or {}, headers or {}))
        if url.endswith("/v1/notams/il"):
            return Answer({"status": "Success", "data": {"url": "/nmsapi/v1/content/abc"}}, "application/json")
        if "/v1/content/" in url:
            return Answer(self.load)
        return Answer({"status": "Success", "data": {"aixm": ["<a/>", "<b/>"]}}, "application/json")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("NMS_API_CLIENT_ID", "id")
    monkeypatch.setenv("NMS_API_CLIENT_SECRET", "secret")
    nms.get_settings.cache_clear()
    doc = '<?xml version="1.0"?>' + ROOT + "".join(member(n) for n in range(5)) + "</message:AIXMBasicMessage>"
    return nms.Client(session=Session(gzip.compress(doc.encode())))


@pytest.fixture
def store(monkeypatch):
    """What the store was handed, and what it says it holds."""
    kept = {"loaded": [], "heard": [], "synced": [], "state": (None, None)}

    def loaded(messages, asked=None, now=None):
        kept["loaded"].append(list(messages))
        return 5

    monkeypatch.setattr(nms.notams, "loaded", loaded)
    monkeypatch.setattr(nms.notams, "heard", lambda xml, now=None: kept["heard"].append(xml) or 1)
    monkeypatch.setattr(nms.notams, "synced", lambda now=None: kept["synced"].append(now))
    monkeypatch.setattr(nms.notams, "nms_state", lambda: kept["state"])
    return kept


def test_off_until_the_faas_credentials_are_set(monkeypatch):
    monkeypatch.delenv("NMS_API_CLIENT_ID", raising=False)
    monkeypatch.delenv("NMS_API_CLIENT_SECRET", raising=False)
    nms.get_settings.cache_clear()
    assert nms.configured() is False
    assert nms.start(on=None) is False


def test_a_store_with_no_load_is_loaded_whole_in_chunks_signed_in(client, store, monkeypatch):
    monkeypatch.setattr(nms, "CHUNK", 2)
    nms.job(client)
    token, pointer, file = client.session.asked
    assert token[0] == "https://api-nms.aim.faa.gov/v1/auth/token" and token[1] == {"grant_type": "client_credentials"}
    assert token[2]["auth"] == ("id", "secret")
    assert pointer[0] == "https://api-nms.aim.faa.gov/nmsapi/v1/notams/il"
    assert pointer[2]["Authorization"] == "Bearer t1" and pointer[2]["nmsResponseFormat"] == "AIXM"
    assert file[0] == "https://api-nms.aim.faa.gov/nmsapi/v1/content/abc"
    # Five members in chunks of two, each under the root's own tag.
    [chunks] = store["loaded"]
    assert len(chunks) == 3 and all(c.startswith(ROOT) and c.endswith("</message:AIXMBasicMessage>") for c in chunks)
    assert chunks[2] == ROOT + member(4) + "</message:AIXMBasicMessage>"
    assert nms.STATE["connected"] and nms.STATE["error"] is None


def test_after_a_load_its_changes_are_asked_from_a_day_before_it(client, store):
    store["state"] = (1_800_000_000.0, None)
    nms.job(client)
    url, params, _ = client.session.asked[-1]
    assert url == "https://api-nms.aim.faa.gov/nmsapi/v1/notams"
    # The load at 2027-01-15T08:00:00Z, less a day and the minute of overlap.
    assert params == {"lastUpdatedDate": "2027-01-14T07:59:00Z"}
    assert store["heard"] == ["<a/>", "<b/>"] and len(store["synced"]) == 1


def test_a_store_a_day_behind_is_loaded_again(client, store):
    store["state"] = (1.0, 2.0)
    nms.job(client)
    assert store["loaded"] and not store["heard"]


def test_a_failed_turn_is_said_and_leaves_the_store_as_it_was(client, store):
    client.session.post = lambda *a, **k: Answer(status=401)
    nms.job(client)
    assert not nms.STATE["connected"] and "401" in nms.STATE["error"]
    assert store["loaded"] == [] and store["synced"] == []


def test_a_gzipped_load_small_enough_is_read_whole():
    doc = ROOT + member(1) + "</message:AIXMBasicMessage>"
    assert list(nms.chunks(nms._unpacked(gzip.compress(doc.encode())))) == [doc]
