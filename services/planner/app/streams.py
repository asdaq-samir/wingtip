"""The routers' NDJSON streams (the nav log's, the corridor read's): one
line a message, and a failure after the first line sent as the last."""

import logging

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from wingtip import log_lines, weather
from wingtip.planning import StillComputing

log = logging.getLogger(__name__)


def line(message: BaseModel) -> str:
    """One NDJSON line, serialised through the message's own model so
    the stream can only ever carry the shapes app.schemas declares."""
    return message.model_dump_json(by_alias=True) + "\n"


def ndjson(lines, on_error) -> StreamingResponse:
    """One JSON object per line, sent as each is produced. The headers keep
    any proxy in between (nginx, the Spring gateway) from buffering lines
    until the stream ends, which would defeat streaming entirely.

    `on_error` builds the stream's "error" message. Once the first line
    is out the status is fixed at 200, so a failure after that -- a
    weather fetch, the corridor read -- cannot become a
    502 any more; left alone it would simply truncate the body, which a
    browser cannot tell from a stream still loading. It becomes the last
    line instead, and the page ends with a message rather than a spinner.
    """
    return StreamingResponse(
        _ending_in_an_error_line(lines, on_error),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _ending_in_an_error_line(lines, on_error):
    try:
        yield from lines
    except HTTPException as err:
        yield line(on_error(detail=str(err.detail)))
    except (weather.WeatherServiceError, StillComputing) as err:
        yield line(on_error(detail=str(err)))
    except Exception as err:  # noqa: BLE001 -- the stream is committed; the client gets the line, the log gets the trace
        log.exception("stream failed after the response had started")
        # Said plainly, with the request's id to find the trace in the log:
        # the exception's own text can hold a path or a SQLite statement
        # (the security review of 2026-11-23, Low 10).
        ref = f", request {log_lines.request_id.get()}" if log_lines.request_id.get() else ""
        yield line(on_error(detail=f"The planner hit an error working this out ({type(err).__name__}{ref})."))
