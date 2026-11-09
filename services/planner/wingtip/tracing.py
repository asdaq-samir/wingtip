"""Traces, for the processes that run wingtip (the planner, the weather
service, ingest): OpenTelemetry's spans sent over OTLP where
OTEL_EXPORTER_OTLP_ENDPOINT is set, which docker-compose does only with
TRACING=1 and the tracing profile's Jaeger up (docs/LOCAL-DEV.md,
"Tracing"). Unset, as in production and the tests, `start` returns at
once, nothing of OpenTelemetry is imported, `span` is a nullcontext and
the engine's calls are the engine's own.

On, `start` gives the process:

- a tracer provider that batches its spans to the collector, named by
  OTEL_SERVICE_NAME;
- a span under the current one for every call made with requests (each
  source: aviationweather.gov, the FAA, the USGS, adsb.fi), with the
  W3C traceparent on it;
- the current context carried into threads and ThreadPoolExecutor
  workers, so a plan's legs worked out in a pool stay in its trace;
- a span for every rule asked of the engine (wingtip_native.call), named
  "engine <rule>" with the rule's name as wingtip.engine.rule and no
  payload, made only inside a span already recording (a request's, a
  fetch's) so start-up and background work make no traces of their own;
- trace_id and span_id at the end of each log line written inside a span.

A service's own module adds what is its alone (app.tracing in the
planner: the FastAPI app and the page's request id)."""
from __future__ import annotations

import logging
from contextlib import nullcontext

from .config import get_settings

log = logging.getLogger(__name__)

#: The tracer once `start` has set one up; None while tracing is off.
_tracer = None


def enabled() -> bool:
    return _tracer is not None


def start(service_name: str | None = None) -> bool:
    """Tracing set up for this process if an OTLP endpoint is set; False,
    and nothing done or imported, if not. A second call does nothing."""
    global _tracer
    settings = get_settings()
    if _tracer is not None:
        return True
    if not settings.otel_exporter_otlp_endpoint:
        return False
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.requests import RequestsInstrumentor
    from opentelemetry.instrumentation.threading import ThreadingInstrumentor
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    name = service_name or settings.otel_service_name
    provider = TracerProvider(resource=Resource.create({"service.name": name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    use(trace.get_tracer("wingtip"))
    RequestsInstrumentor().instrument()
    ThreadingInstrumentor().instrument()
    log.info("tracing %s to %s", name, settings.otel_exporter_otlp_endpoint)
    return True


def use(tracer) -> None:
    """Tracing on with `tracer` (start's, or a test's over an in-memory
    exporter): the engine's calls traced and log lines stamped."""
    global _tracer
    _tracer = tracer
    _trace_engine_calls()
    stamp_logs()


def span(name: str, *, root: bool = False, **attributes):
    """A span named `name` around a block, current while it runs. Inside
    no recording span it is skipped unless `root` (a scheduled fetch is a
    trace of its own; a store read at start-up is no trace at all). Off,
    a nullcontext."""
    if _tracer is None:
        return nullcontext()
    if not root:
        from opentelemetry import trace

        if not trace.get_current_span().is_recording():
            return nullcontext()
    return _tracer.start_as_current_span(name, attributes={k: v for k, v in attributes.items() if v is not None})


def _trace_engine_calls() -> None:
    """wingtip_native.call, wrapped where the module holds it, so every
    caller's `wingtip_native.call(name, ...)` -- the planner's forty-odd
    -- is traced without one of them changed. The payload stays out of
    the span: a plan's figures are the pilot's."""
    import wingtip_native

    asked = wingtip_native.call
    if getattr(asked, "_traced", False):
        return

    def call(name, given):
        with span(f"engine {name}", **{"wingtip.engine.rule": name}):
            return asked(name, given)

    call._traced = True
    call.__wrapped__ = asked
    wingtip_native.call = call


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


def stamp_logs(loggers: tuple[str, ...] = ("", "uvicorn", "uvicorn.access", "uvicorn.error")) -> None:
    """The handlers of `loggers` (the root's, and uvicorn's own, which do
    not reach the root) writing each line with its trace."""
    for name in loggers:
        for handler in logging.getLogger(name).handlers:
            if not isinstance(handler.formatter, _TraceStamp):
                handler.setFormatter(_TraceStamp(handler.formatter))
