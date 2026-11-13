"""Traces of the planner, when there is somewhere to send them: with
OTEL_EXPORTER_OTLP_ENDPOINT set (docker-compose sets it to Jaeger's with
TRACING=1), every request the planner answers is a span, under the
gateway's where it sent a traceparent, and under it
each source asked with requests, each rule asked of the engine and each
weather product read (wingtip.tracing), so a slow plan is one trace from
the page's call down. The page's request id (X-Request-Id, which the
gateway passes on) is the span's wingtip.request_id. Without the
endpoint nothing is loaded and nothing is sent."""

from wingtip import tracing

#: The page's id for the request, as the gateway sends it on.
REQUEST_ID_HEADER = b"x-request-id"

#: The container's health check (GET /, every few seconds), left out: a
#: trace each buried the pilots' requests in Jaeger. A regular expression
#: searched in the request's whole URL, as the instrumentation reads it.
HEALTH_CHECK = r"^https?://[^/]+/$"


def _tag_request_id(span, scope: dict) -> None:
    """FastAPIInstrumentor's server_request_hook: the request id on the
    request's span, where the gateway sent one."""
    if span is None or not span.is_recording():
        return
    for name, value in scope.get("headers") or ():
        if name == REQUEST_ID_HEADER:
            span.set_attribute("wingtip.request_id", value.decode("latin-1")[:64])
            return


def instrument(app) -> bool:
    """Instruments `app` (and through wingtip.tracing, requests, threads,
    the engine and the logs) when an OTLP endpoint is set; False, and
    nothing done, when it is not."""
    if not tracing.start():
        return False
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

    FastAPIInstrumentor.instrument_app(app, server_request_hook=_tag_request_id, excluded_urls=HEALTH_CHECK)
    return True
