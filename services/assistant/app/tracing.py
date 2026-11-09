"""Traces of the assistant, when there is somewhere to send them: with
OTEL_EXPORTER_OTLP_ENDPOINT set (docker-compose sets it to Jaeger's with
TRACING=1), every request it answers is a span under the gateway's, each
call to the planner (requests) and to Anthropic's API (httpx, the SDK's
client) one under it with the traceparent passed on, and each Claude
call a span of its own (`claude_call`) with the model and the tokens it
used -- never the prompt or the answer, which are the pilot's. Log lines
written inside a span end with its trace_id and span_id.

Without the endpoint, as in production and the tests, nothing of
OpenTelemetry is imported, `claude_call` hands back a recorder that does
nothing, and nothing is sent.

The planner's own tracing is wingtip.tracing; this service ships without
wingtip, so it has its own, the same few lines."""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager

log = logging.getLogger(__name__)

#: The tracer once `instrument` has set one up; None while tracing is off.
_tracer = None

REQUEST_ID_HEADER = b"x-request-id"

#: The container's health check (GET /, every few seconds), left out: a
#: trace each buried the real requests in Jaeger. A regular expression
#: searched in the request's whole URL, as the instrumentation reads it.
HEALTH_CHECK = r"^https?://[^/]+/$"


def _tag_request_id(span, scope: dict) -> None:
    """The page's request id, as the gateway sends it on, on the span."""
    if span is None or not span.is_recording():
        return
    for name, value in scope.get("headers") or ():
        if name == REQUEST_ID_HEADER:
            span.set_attribute("wingtip.request_id", value.decode("latin-1")[:64])
            return


def instrument(app) -> bool:
    """Instruments `app`, requests and httpx when an OTLP endpoint is set;
    False, and nothing done, when it is not."""
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        return False
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
    from opentelemetry.instrumentation.requests import RequestsInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    name = os.environ.get("OTEL_SERVICE_NAME", "assistant")
    provider = TracerProvider(resource=Resource.create({"service.name": name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    use(trace.get_tracer("wingtip.assistant"))
    FastAPIInstrumentor.instrument_app(app, server_request_hook=_tag_request_id, excluded_urls=HEALTH_CHECK)
    RequestsInstrumentor().instrument()
    HTTPXClientInstrumentor().instrument()
    log.info("tracing %s to %s", name, endpoint)
    return True


def use(tracer) -> None:
    """Tracing on with `tracer` (instrument's, or a test's): Claude calls
    recorded and log lines stamped."""
    global _tracer
    _tracer = tracer
    for name in ("", "uvicorn", "uvicorn.access", "uvicorn.error"):
        for handler in logging.getLogger(name).handlers:
            if not isinstance(handler.formatter, _TraceStamp):
                handler.setFormatter(_TraceStamp(handler.formatter))


class Usage:
    """What a Claude call is recorded with: `add` each message it got
    back (a tool runner gets one a turn). Does nothing with tracing off."""

    def __init__(self, span=None):
        self.span = span
        self.totals: dict[str, int] = {}
        self.turns = 0

    def add(self, message) -> None:
        if self.span is None or message is None:
            return
        usage = getattr(message, "usage", None)
        for field in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"):
            got = getattr(usage, field, None)
            if isinstance(got, int):
                self.totals[field] = self.totals.get(field, 0) + got
                self.span.set_attribute(f"gen_ai.usage.{field}", self.totals[field])
        for attribute, value in (("gen_ai.response.model", getattr(message, "model", None)),
                                 ("gen_ai.response.finish_reasons", getattr(message, "stop_reason", None))):
            if isinstance(value, str):
                self.span.set_attribute(attribute, [value] if attribute.endswith("reasons") else value)
        self.turns += 1
        self.span.set_attribute("wingtip.claude.turns", self.turns)


@contextmanager
def claude_call(feature: str, model: str, *, current: bool = True):
    """A span around one Claude call (or a tool runner's turns), named as
    OpenTelemetry's GenAI conventions name one ("chat <model>"), with the
    feature asking it; yields a Usage to `add` each message to.

    `current` False for a call that spans a streamed response's yields
    (the narrative, the assistant): Starlette steps a generator in a
    fresh copy of the context each time, so a span made current in one
    step cannot be let go of in another; it is still a child of the
    request's span, and Anthropic's HTTP call is its sibling."""
    if _tracer is None:
        yield Usage()
        return
    attributes = {"gen_ai.system": "anthropic", "gen_ai.operation.name": "chat",
                  "gen_ai.request.model": model, "wingtip.feature": feature}
    if current:
        with _tracer.start_as_current_span(f"chat {model}", attributes=attributes) as span:
            yield Usage(span)
        return
    span = _tracer.start_span(f"chat {model}", attributes=attributes)
    try:
        yield Usage(span)
    except BaseException as err:
        from opentelemetry.trace import Status, StatusCode

        if not isinstance(err, GeneratorExit):
            span.record_exception(err)
            span.set_status(Status(StatusCode.ERROR, type(err).__name__))
        raise
    finally:
        span.end()


class _TraceStamp(logging.Formatter):
    """The handler's own line, with the current span's trace_id and
    span_id after it where there is one."""

    def __init__(self, inner: logging.Formatter | None):
        super().__init__()
        self.inner = inner or logging.Formatter(logging.BASIC_FORMAT)

    def format(self, record: logging.LogRecord) -> str:
        from opentelemetry import trace

        line = self.inner.format(record)
        context = trace.get_current_span().get_span_context()
        if context.is_valid:
            line += f" trace_id={context.trace_id:032x} span_id={context.span_id:016x}"
        return line
