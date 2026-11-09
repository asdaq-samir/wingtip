"""app.tracing: off, a Claude call's recorder does nothing; on, the call
is a span named by its model with the feature and the tokens used, and
none of the prompt or the answer; a streamed call's span survives being
stepped in fresh contexts, as Starlette steps a generator."""
import contextvars
from types import SimpleNamespace

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from app import tracing

MESSAGE = SimpleNamespace(
    model="claude-haiku-5-5", stop_reason="end_turn",
    content=[SimpleNamespace(type="text", text="the secret answer")],
    usage=SimpleNamespace(input_tokens=120, output_tokens=40, cache_read_input_tokens=0, cache_creation_input_tokens=None),
)


@pytest.fixture
def traced(monkeypatch):
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr(tracing, "_tracer", provider.get_tracer("test"))
    yield exporter
    provider.shutdown()


def test_off_the_recorder_does_nothing(monkeypatch):
    monkeypatch.setattr(tracing, "_tracer", None)
    with tracing.claude_call("words", "claude-haiku-5-5") as used:
        used.add(MESSAGE)
    assert used.span is None and used.totals == {}


def test_without_an_endpoint_nothing_is_instrumented(monkeypatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    assert tracing.instrument(object()) is False


def test_a_call_is_a_span_with_its_model_and_tokens_and_no_text(traced):
    with tracing.claude_call("words", "claude-haiku-5-5") as used:
        used.add(MESSAGE)
    (span,) = traced.get_finished_spans()
    assert span.name == "chat claude-haiku-5-5"
    attributes = dict(span.attributes)
    assert attributes["gen_ai.system"] == "anthropic"
    assert attributes["gen_ai.request.model"] == "claude-haiku-5-5"
    assert attributes["wingtip.feature"] == "words"
    assert attributes["gen_ai.usage.input_tokens"] == 120
    assert attributes["gen_ai.usage.output_tokens"] == 40
    assert "gen_ai.usage.cache_creation_input_tokens" not in attributes
    assert not any("secret" in str(v) for v in attributes.values())


def test_a_tool_runners_turns_add_up(traced):
    with tracing.claude_call("assistant", "claude-opus-5-5", current=False) as used:
        used.add(MESSAGE)
        used.add(MESSAGE)
    (span,) = traced.get_finished_spans()
    assert span.attributes["gen_ai.usage.input_tokens"] == 240
    assert span.attributes["wingtip.claude.turns"] == 2


def test_a_streamed_call_stepped_in_fresh_contexts_ends_its_span(traced):
    def stream():
        with tracing.claude_call("narrative", "claude-haiku-5-5", current=False) as used:
            yield "first"
            used.add(MESSAGE)
            yield "second"

    lines = stream()
    # Each step in its own copy of the context, as Starlette's threadpool does.
    got = [contextvars.copy_context().run(next, lines) for _ in range(2)]
    with pytest.raises(StopIteration):
        contextvars.copy_context().run(next, lines)
    assert got == ["first", "second"]
    (span,) = traced.get_finished_spans()
    assert span.attributes["wingtip.feature"] == "narrative"
    assert span.status.is_ok
