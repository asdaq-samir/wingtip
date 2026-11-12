"""Traces of the assistant, when there is somewhere to send them: with
OTEL_EXPORTER_OTLP_ENDPOINT set (docker-compose sets it to Jaeger's with
TRACING=1), every request it answers is a span under the gateway's and
each call to the planner (requests) one under it with the traceparent
passed on. Every Claude call is a span of the anthropic SDK's own
OpenTelemetry tracing (2.8.0, on by default, spans from the registered
provider; its content mode stays metadata_only, so never the prompt or
the answer, which are the pilot's), and `feature` puts the feature asking
above it. Log lines written inside a span end with its trace_id and
span_id.

Without the endpoint, as in production and the tests, no provider is
registered, the API's tracer does nothing, and nothing is sent.

The planner's own tracing is wingtip.tracing; this service ships without
wingtip, so it has its own, the same few lines."""

from __future__ import annotations

import logging
import os

from opentelemetry import trace

log = logging.getLogger(__name__)

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
    """Instruments `app` and requests when an OTLP endpoint is set;
    False, and nothing done, when it is not."""
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if os.environ.get("TRACING", "1").strip().lower() in ("0", "false", "no", "off"):
        endpoint = None  # TRACING=0 turns it off even where compose set the endpoint
    if not endpoint:
        return False
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.requests import RequestsInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    name = os.environ.get("OTEL_SERVICE_NAME", "assistant")
    provider = TracerProvider(resource=Resource.create({"service.name": name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    _stamp_logs()
    FastAPIInstrumentor.instrument_app(app, server_request_hook=_tag_request_id, excluded_urls=HEALTH_CHECK)
    RequestsInstrumentor().instrument()
    log.info("tracing %s to %s", name, endpoint)
    return True


def _stamp_logs() -> None:
    """Log lines stamped with the current span's ids."""
    for name in ("", "uvicorn", "uvicorn.access", "uvicorn.error"):
        for handler in logging.getLogger(name).handlers:
            if not isinstance(handler.formatter, _TraceStamp):
                handler.setFormatter(_TraceStamp(handler.formatter))


def feature(name: str):
    """A span for the feature asking Claude, the parent of the SDK's own
    call span (for a call made inside it; a streamed response's yields
    cannot hold a current span, as Starlette steps a generator in fresh
    contexts, so those calls hang from the request's span)."""
    return trace.get_tracer("wingtip.assistant").start_as_current_span(f"wingtip.{name}", attributes={"wingtip.feature": name})


class _TraceStamp(logging.Formatter):
    """The handler's own line, with the current span's trace_id and
    span_id after it where there is one."""

    def __init__(self, inner: logging.Formatter | None):
        super().__init__()
        self.inner = inner or logging.Formatter(logging.BASIC_FORMAT)

    def format(self, record: logging.LogRecord) -> str:
        line = self.inner.format(record)
        context = trace.get_current_span().get_span_context()
        if context.is_valid:
            line += f" trace_id={context.trace_id:032x} span_id={context.span_id:016x}"
        return line
