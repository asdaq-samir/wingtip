"""The routes' calls, failures and times for the owner's status page
(app.route_metrics): each call named by its route's template, never its
address; a failure counted; the percentiles worked out as Prometheus's
histogram_quantile works them; and the figures served at /metrics."""

import math

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from prometheus_client import CollectorRegistry

from app import route_metrics
from app.main import app as planner
from app.route_metrics import CountCalls, RouteMetrics, quantile


def _app(metrics: RouteMetrics) -> FastAPI:
    app = FastAPI()
    app.add_middleware(CountCalls, metrics=metrics)

    @app.get("/api/airport/{ident}")
    def airport(ident: str):
        return {"ident": ident}

    @app.get("/api/broken")
    def broken():
        raise HTTPException(503, "down")

    return app


def test_a_call_is_named_by_its_template_not_what_was_asked():
    metrics = RouteMetrics(CollectorRegistry())
    client = TestClient(_app(metrics))

    for ident in ("KMSN", "KOSH", "KMSN"):
        assert client.get(f"/api/airport/{ident}").status_code == 200

    (row,) = metrics.snapshot()
    assert (row.route, row.method, row.count, row.errors) == ("/api/airport/{ident}", "GET", 3, 0)
    assert row.p50_ms is not None and row.p95_ms is not None
    assert "KMSN" not in str(metrics.snapshot())


def test_failures_count_and_the_busiest_route_comes_first():
    metrics = RouteMetrics(CollectorRegistry())
    client = TestClient(_app(metrics))

    client.get("/api/broken")
    for _ in range(2):
        client.get("/api/airport/KMSN")
    client.get("/nowhere")

    rows = {r.route: r for r in metrics.snapshot()}
    assert metrics.snapshot()[0].route == "/api/airport/{ident}"
    assert rows["/api/broken"].errors == 1
    assert rows["/api/broken"].error_rate == 1.0
    assert rows[route_metrics.UNMATCHED].count == 1
    assert rows[route_metrics.UNMATCHED].errors == 0


def test_the_quantile_is_interpolated_within_its_bucket():
    # 10 calls: 4 under 0.1 s, 4 more under 0.5 s, 2 more under 1 s.
    cumulative = [(0.1, 4.0), (0.5, 8.0), (1.0, 10.0), (math.inf, 10.0)]

    # The 5th of 10 falls a quarter into the 0.1-0.5 bucket.
    assert quantile(0.5, cumulative) == pytest.approx(0.2)
    # The 9.5th, three quarters into the 0.5-1 bucket.
    assert quantile(0.95, cumulative) == pytest.approx(0.875)
    assert quantile(0.5, []) is None
    assert quantile(0.5, [(0.1, 0.0), (math.inf, 0.0)]) is None
    # Past every finite end: the highest finite one, as Prometheus says.
    assert quantile(0.99, [(0.1, 1.0), (math.inf, 10.0)]) == 0.1


def test_the_planners_figures_are_served_at_metrics():
    client = TestClient(planner)
    client.get("/")

    text = client.get("/metrics/").text
    assert "planner_requests_total" in text
    assert "planner_request_seconds_bucket" in text


def test_a_call_that_raised_is_counted_a_500_and_held_for_the_dev_console():
    """Both middlewares in the plain ASGI form (react-perf round 4, L2): an
    exception no handler caught is a 500 in the figures and in the failures
    held, and a streamed answer is timed to its last line."""
    from fastapi.responses import StreamingResponse

    from app import errors

    errors._HELD.clear()
    metrics = RouteMetrics(CollectorRegistry())
    app = _app(metrics)
    app.add_middleware(errors.RecordFailures)

    @app.get("/api/raises/{ident}")
    def raises(ident: str):
        raise RuntimeError("no such table")

    @app.get("/api/stream")
    def stream():
        return StreamingResponse(iter([b"a\n", b"b\n"]), media_type="application/x-ndjson")

    client = TestClient(app, raise_server_exceptions=False)
    assert client.get("/api/raises/KMSN?x=1").status_code == 500
    assert client.get("/api/stream").text == "a\nb\n"
    assert client.get("/api/broken").status_code == 503
    rows = {r.route: r for r in metrics.snapshot()}
    assert (rows["/api/raises/{ident}"].count, rows["/api/raises/{ident}"].errors) == (1, 1)
    assert (rows["/api/stream"].count, rows["/api/stream"].errors) == (1, 0)
    held = errors.recent()
    assert [(e["path"], e["status"]) for e in held] == [("/api/broken", 503), ("/api/raises/KMSN?x=1", 500)]
    assert held[1]["detail"] == "RuntimeError: no such table"
