"""wingtip.tracing: off, it costs nothing and changes nothing; on, each
engine rule asked inside a traced request is a span named by the rule
with no payload, a weather product read is one too, nothing is traced
outside a request, and a log line written inside a span ends with its
ids. On over an in-memory exporter, never a collector."""

import json
import logging

import pytest
import wingtip_native
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from wingtip import tracing, weather_store


@pytest.fixture
def traced(monkeypatch):
    """Tracing on for one test, over an in-memory exporter; the engine's
    call and the tracer as they were afterwards."""
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(wingtip_native, "call", wingtip_native.call)
    monkeypatch.setattr(tracing, "_tracer", provider.get_tracer("test"))
    tracing._trace_engine_calls()
    yield exporter
    provider.shutdown()


def test_off_nothing_is_wrapped_and_a_span_is_a_nullcontext(monkeypatch):
    monkeypatch.setattr(tracing, "_tracer", None)
    assert not tracing.enabled()
    with tracing.span("anything", root=True) as span:
        assert span is None
    assert not getattr(wingtip_native.call, "_traced", False)


def test_off_start_does_nothing_without_an_endpoint(monkeypatch):
    monkeypatch.setattr(tracing, "_tracer", None)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    from wingtip.config import get_settings

    get_settings.cache_clear()
    try:
        assert tracing.start("planner") is False
        assert tracing._tracer is None
    finally:
        get_settings.cache_clear()


def test_an_engine_rule_in_a_request_is_a_span_named_by_the_rule_without_its_payload(traced):
    with tracing.span("GET /api/navlog", root=True):
        answer = json.loads(wingtip_native.call("altitude_limits", "{}"))
    assert "class_a_floor_ft" in answer
    spans = {s.name: s for s in traced.get_finished_spans()}
    rule = spans["engine altitude_limits"]
    assert dict(rule.attributes) == {"wingtip.engine.rule": "altitude_limits"}
    assert rule.parent.span_id == spans["GET /api/navlog"].context.span_id


def test_an_engine_rule_outside_a_request_makes_no_trace(traced):
    wingtip_native.call("altitude_limits", "{}")
    assert traced.get_finished_spans() == ()


def test_a_rule_that_refuses_is_a_span_with_its_error(traced):
    with tracing.span("request", root=True), pytest.raises(ValueError):
        wingtip_native.call("no_such_rule", "{}")
    rule = next(s for s in traced.get_finished_spans() if s.name == "engine no_such_rule")
    assert not rule.status.is_ok


def test_a_weather_product_read_is_a_span(traced, tmp_path, monkeypatch):
    monkeypatch.setattr(weather_store, "store_dir", lambda: tmp_path)
    with tracing.span("request", root=True):
        assert weather_store.read("metars") is None
    read = next(s for s in traced.get_finished_spans() if s.name == "weather_store.read")
    assert read.attributes["wingtip.weather.product"] == "metars"


def test_a_log_line_in_a_span_ends_with_its_ids(traced):
    stamp = tracing._TraceStamp(logging.Formatter("%(message)s"))
    record = logging.LogRecord("x", logging.INFO, __file__, 1, "asked", None, None)
    assert stamp.format(record) == "asked"
    with tracing.span("request", root=True) as span:
        line = stamp.format(record)
    context = span.get_span_context()
    assert line == f"asked trace_id={context.trace_id:032x} span_id={context.span_id:016x}"
