"""wingtip.outside: the shared, retrying session for outside data sources,
asked of a server on this machine (no live internet)."""

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
import urllib3.util.retry
from wingtip import outside


@pytest.fixture
def source(monkeypatch):
    """A local source answering each request with the next of `answers`
    (status, headers), the last one for ever after; `asked` counts them.
    urllib3's sleeps are recorded rather than slept."""
    slept = []
    monkeypatch.setattr(urllib3.util.retry.time, "sleep", slept.append)
    state = {"answers": [(200, {})], "asked": 0, "slept": slept}

    class Handler(BaseHTTPRequestHandler):
        def _answer(self):
            answers = state["answers"]
            status, headers = answers[min(state["asked"], len(answers) - 1)]
            state["asked"] += 1
            self.send_response(status)
            for key, value in {**headers, "Content-Length": "2"}.items():
                self.send_header(key, value)
            self.end_headers()
            self.wfile.write(b"ok")

        do_GET = do_POST = do_HEAD = _answer

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    state["url"] = f"http://127.0.0.1:{server.server_address[1]}/data"
    yield state
    server.shutdown()
    server.server_close()


def test_the_retry_is_as_the_audit_set_it():
    retry = outside.RETRY
    assert retry.total == 3 and retry.read == 0 and retry.other == 0
    assert set(retry.status_forcelist) == {429, 502, 503, 504}
    assert set(retry.allowed_methods) == {"GET", "HEAD"}
    assert retry.backoff_jitter > 0 and retry.respect_retry_after_header and retry.retry_after_max == 30
    assert not retry.raise_on_status


def test_a_busy_source_is_asked_again_with_a_growing_wait(source):
    source["answers"] = [(503, {}), (502, {}), (200, {})]
    resp = outside.session().get(source["url"], timeout=5)
    assert resp.status_code == 200 and source["asked"] == 3
    # urllib3 waits nothing before the first try again, then 1 s and up to half a second more.
    assert len(source["slept"]) == 1 and 1.0 <= source["slept"][0] <= 1.5


def test_the_last_answer_goes_back_when_the_tries_are_spent(source):
    source["answers"] = [(504, {})]
    resp = outside.get(source["url"], timeout=5)
    assert resp.status_code == 504 and source["asked"] == 4


def test_retry_after_is_honoured_and_held_to_thirty_seconds(source):
    source["answers"] = [(429, {"Retry-After": "7"}), (429, {"Retry-After": "3600"}), (200, {})]
    assert outside.session().get(source["url"], timeout=5).status_code == 200
    assert source["slept"] == [7, 30]


def test_a_post_is_never_asked_twice(source):
    source["answers"] = [(503, {}), (200, {})]
    assert outside.session().post(source["url"], data=b"x", timeout=5).status_code == 503
    assert source["asked"] == 1


def test_live_data_opts_out(source):
    source["answers"] = [(503, {}), (200, {})]
    assert outside.session(retries=False).get(source["url"], timeout=5).status_code == 503
    assert source["asked"] == 1
