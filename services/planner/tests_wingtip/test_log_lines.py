"""wingtip.log_lines: a record as one JSON line with the request's id and
its traceback, a text line with the id in brackets, and both bounded."""

import io
import json
import logging

import pytest
from wingtip import log_lines


@pytest.fixture(autouse=True)
def _root_kept():
    """The root logger as it was after each test: configure replaces its handlers."""
    root = logging.getLogger()
    handlers, level = root.handlers[:], root.level
    yield
    root.handlers[:] = handlers
    root.setLevel(level)


def _line(fmt: str, message: str, exc: bool = False) -> str:
    log_lines.configure("INFO", fmt)
    out = io.StringIO()
    logging.getLogger().handlers[0].setStream(out)
    log = logging.getLogger("wingtip.test")
    if exc:
        try:
            raise ValueError("bad sheet")
        except ValueError:
            log.exception(message)
    else:
        log.info(message)
    return out.getvalue().strip()


def test_a_json_line_carries_the_request_id_and_the_error():
    held = log_lines.request_id.set("abc-123")
    try:
        record = json.loads(_line("json", "navlog C81 KDLH", exc=True))
    finally:
        log_lines.request_id.reset(held)
    assert record["level"] == "ERROR" and record["logger"] == "wingtip.test"
    assert record["message"] == "navlog C81 KDLH" and record["request_id"] == "abc-123"
    assert "ValueError: bad sheet" in record["error"] and record["time"].endswith("+00:00")


def test_outside_a_request_there_is_no_id_and_text_says_so():
    assert "request_id" not in json.loads(_line("json", "warm"))
    assert "[-] warm" in _line("text", "warm")


def test_a_long_message_is_cut():
    record = json.loads(_line("json", "x" * (log_lines.MAX_CHARS + 50)))
    assert len(record["message"]) < log_lines.MAX_CHARS + 30 and record["message"].endswith("(50 cut)")
