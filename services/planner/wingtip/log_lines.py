"""How the processes that run wingtip (the planner, the weather service,
ingest) write their log: one line a record, on stderr, which Docker hands
to CloudWatch in production (infra/docker-compose.prod.yml) and keeps in
its own log locally.

- LOG_FORMAT=json (production): each line one JSON object, {"time",
  "level", "logger", "message", "request_id", "error"}, which CloudWatch
  Logs Insights reads by field (`filter request_id = "..."`). Text
  (the default, locally): time, level, logger, the request id in
  brackets, the message.
- The request id is the page's X-Request-Id, which the gateway passes on
  with every call it forwards (its RequestIdFilter and TraceHeaders);
  the planner's middleware (app.request_ids) holds it for the request,
  so a pilot's report of an id finds the gateway's lines and the
  planner's both. Work done in a thread of its own has none.
- Bounded: a message is cut at MAX_CHARS and a traceback at MAX_TRACE, so
  one record cannot fill a log (the gateway's are bounded the same way by
  CloudWatch's month, ServerLogGroup).
"""

from __future__ import annotations

import contextvars
import json
import logging
import sys
from datetime import datetime, timezone

#: The request being answered's id, where there is one (app.request_ids).
request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_id", default=None)

#: A message longer than this is cut, and says so.
MAX_CHARS = 4000
#: A traceback is kept to its last lines, where the error is.
MAX_TRACE = 8000

TEXT = "%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s"


def _cut(text: str, limit: int, keep_end: bool = False) -> str:
    if len(text) <= limit:
        return text
    return f"...({len(text) - limit} cut) " + text[-limit:] if keep_end else text[:limit] + f" ...({len(text) - limit} cut)"


class _WithRequestId(logging.Filter):
    """Each record with the request's id, or "-" outside one."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id.get() or "-"
        return True


class _Text(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        line = super().format(record)
        return _cut(line, MAX_CHARS + MAX_TRACE)


class JsonLines(logging.Formatter):
    """A record as one line of JSON."""

    def format(self, record: logging.LogRecord) -> str:
        out = {
            "time": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": _cut(record.getMessage(), MAX_CHARS),
        }
        rid = getattr(record, "request_id", None)
        if rid and rid != "-":
            out["request_id"] = rid
        if record.exc_info:
            out["error"] = _cut(self.formatException(record.exc_info), MAX_TRACE, keep_end=True)
        return json.dumps(out, ensure_ascii=False)


def configure(level: str | int, fmt: str = "text") -> None:
    """The root logger writing every record, at `level`, as `fmt` says
    ("json" or "text"), each with the request's id. Replaces whatever
    handler was there, so calling it again changes the format."""
    handler = logging.StreamHandler(sys.stderr)
    handler.addFilter(_WithRequestId())
    handler.setFormatter(JsonLines() if fmt.strip().lower() == "json" else _Text(TEXT))
    logging.basicConfig(level=level, handlers=[handler], force=True)
