"""app.tracing: Claude calls are the anthropic SDK's own spans, so what is
tested here is ours: with no provider registered a feature's span does
nothing, with one it is a span named for the feature, and the log stamp
carries the current span's ids."""

import logging

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app import tracing


@pytest.fixture
def traced(monkeypatch):
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(tracing.trace, "get_tracer", lambda name: provider.get_tracer(name))
    yield exporter
    provider.shutdown()


def test_without_an_endpoint_nothing_is_instrumented(monkeypatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    assert tracing.instrument(object()) is False


def test_without_a_provider_a_feature_span_is_a_no_op():
    with tracing.feature("words"):
        pass


def test_a_feature_is_a_span_named_for_it(traced):
    with tracing.feature("words"):
        pass
    (span,) = traced.get_finished_spans()
    assert span.name == "wingtip.words"
    assert span.attributes["wingtip.feature"] == "words"


def test_a_log_line_in_a_span_ends_with_its_ids(traced):
    record = logging.LogRecord("x", logging.INFO, __file__, 1, "said", None, None)
    stamp = tracing._TraceStamp(None)
    with tracing.feature("words"):
        line = stamp.format(record)
        assert " trace_id=" in line and " span_id=" in line
    assert "trace_id" not in stamp.format(record)
