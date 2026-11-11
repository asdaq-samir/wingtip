"""app.tracing: off without an endpoint, and on, the page's request id
(as the gateway sends it on) is the request span's wingtip.request_id."""

from opentelemetry.sdk.trace import TracerProvider

from app import tracing


def test_without_an_endpoint_the_app_is_left_alone(monkeypatch):
    monkeypatch.setattr(tracing.tracing, "start", lambda *_: False)
    assert tracing.instrument(object()) is False


def test_the_request_id_goes_on_the_requests_span():
    span = TracerProvider().get_tracer("test").start_span("GET /api/navlog")
    tracing._tag_request_id(span, {"headers": [(b"accept", b"*/*"), (b"x-request-id", b"page-42")]})
    assert span.attributes["wingtip.request_id"] == "page-42"
    span.end()


def test_the_health_check_is_left_out_and_nothing_else():
    import re

    assert re.search(tracing.HEALTH_CHECK, "http://localhost:8000/")
    assert not re.search(tracing.HEALTH_CHECK, "http://planner:8000/api/navlog?dep=C81&dest=KMSN")
    assert not re.search(tracing.HEALTH_CHECK, "http://planner:8000/api/status/")


def test_a_request_without_an_id_is_not_tagged():
    span = TracerProvider().get_tracer("test").start_span("GET /")
    tracing._tag_request_id(span, {"headers": []})
    assert "wingtip.request_id" not in span.attributes
    span.end()
