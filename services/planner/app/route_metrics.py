"""How each of the planner's routes is answering, for the owner's status
page (the Dev console's System tab, its Routes page): how many calls since
the planner started, how many failed (500 or more), and how long they took
at the 50th and 95th percentile.

Prometheus's own client keeps the figures (prometheus_client, a counter
and a histogram), so the same numbers are served in Prometheus's text at
/metrics on the planner's own port for a scraper, should one ever be run;
the gateway forwards only /api/planner/* (x-gateway), so it is never
public. Each call is named by its route's template ("/api/airport/{ident}"),
never its address: a point, an ident or a query a pilot asked never
becomes a label, so nothing of a pilot's is in the figures. Held in
memory, from the planner's start, as app.errors holds its failures.
"""

import math
import time
from dataclasses import dataclass

from prometheus_client import CollectorRegistry, Counter, Histogram
from starlette.routing import Match

from . import usage_days

#: The histogram's upper ends in seconds: a tile's few milliseconds to a
#: route planned past its half-minute limit (wingtip.planning).
BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0)

#: A call no route matched (a 404 from the router): one name for all of
#: them, so a stranger's guesses cannot add labels without end.
UNMATCHED = "(no route)"


@dataclass(frozen=True)
class RouteFigures:
    """One route and method's calls since the planner started."""

    route: str
    method: str
    count: int
    errors: int
    p50_ms: float | None
    p95_ms: float | None

    @property
    def error_rate(self) -> float:
        return self.errors / self.count if self.count else 0.0


class RouteMetrics:
    """The planner's counter and histogram, in a registry of their own so
    a test can hold its own and nothing else's metrics are served."""

    def __init__(self, registry: CollectorRegistry | None = None):
        self.registry = registry or CollectorRegistry()
        self.calls = Counter(
            "planner_requests",
            "Calls answered, by route template, method and status",
            ["route", "method", "status"],
            registry=self.registry,
        )
        self.seconds = Histogram(
            "planner_request_seconds",
            "Time to answer, by route template and method",
            ["route", "method"],
            buckets=BUCKETS,
            registry=self.registry,
        )

    def observe(self, route: str, method: str, status: int, seconds: float) -> None:
        self.calls.labels(route, method, str(status)).inc()
        self.seconds.labels(route, method).observe(seconds)

    def snapshot(self) -> list[RouteFigures]:
        """Every route called since the start, the busiest first."""
        counts: dict[tuple[str, str], list[int]] = {}
        for family in self.calls.collect():
            for sample in family.samples:
                if not sample.name.endswith("_total"):
                    continue
                key = (sample.labels["route"], sample.labels["method"])
                both = counts.setdefault(key, [0, 0])
                both[0] += int(sample.value)
                if int(sample.labels["status"]) >= 500:
                    both[1] += int(sample.value)
        buckets: dict[tuple[str, str], list[tuple[float, float]]] = {}
        for family in self.seconds.collect():
            for sample in family.samples:
                if sample.name.endswith("_bucket"):
                    key = (sample.labels["route"], sample.labels["method"])
                    buckets.setdefault(key, []).append((float(sample.labels["le"]), sample.value))
        rows = []
        for key, (count, failed) in counts.items():
            cumulative = sorted(buckets.get(key, []))
            rows.append(
                RouteFigures(
                    route=key[0],
                    method=key[1],
                    count=count,
                    errors=failed,
                    p50_ms=_ms(quantile(0.5, cumulative)),
                    p95_ms=_ms(quantile(0.95, cumulative)),
                )
            )
        return sorted(rows, key=lambda r: (-r.count, r.route, r.method))


def quantile(share: float, cumulative: list[tuple[float, float]]) -> float | None:
    """A share's value from a histogram's cumulative buckets (upper end,
    count up to it), as Prometheus's histogram_quantile works it out: the
    bucket the rank falls in, interpolated linearly within it, from 0 for
    the first; in the open-ended last bucket, the highest finite end.
    None with no calls."""
    if not cumulative or cumulative[-1][1] == 0:
        return None
    rank = share * cumulative[-1][1]
    lower, below = 0.0, 0.0
    for upper, count in cumulative:
        if count >= rank:
            if math.isinf(upper):
                return lower
            if count == below:
                return upper
            return lower + (upper - lower) * (rank - below) / (count - below)
        lower, below = upper, count
    return lower


def _ms(seconds: float | None) -> float | None:
    return None if seconds is None else round(seconds * 1000, 1)


def route_of(scope: dict) -> str:
    """The template of the route that answered, from the scope where the
    router left it, else matched again as the router matches."""
    route = scope.get("route")
    if route is not None and hasattr(route, "path"):
        return route.path
    for candidate in scope["app"].router.routes:
        match, _ = candidate.matches(scope)
        if match == Match.FULL:
            return getattr(candidate, "path", UNMATCHED)
    return UNMATCHED


#: The planner's own, served at /metrics and read by /api/status.
METRICS = RouteMetrics()


class CountCalls:
    """Counts and times each call, to its last byte, by its route's
    template; a call that raised before answering is counted a 500, as
    FastAPI answers it, and let through. Plain ASGI, as RequestIds is:
    Starlette's BaseHTTPMiddleware cost every call, each tile among them,
    some 40 us and a task of its own (react-perf round 4, L2)."""

    def __init__(self, app, metrics: RouteMetrics = METRICS):
        self.app = app
        self.metrics = metrics

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        status = 500

        async def answering(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, answering)
        finally:
            route = route_of(scope)
            self.metrics.observe(route, scope["method"], status, time.perf_counter() - started)
            # And the day's totals kept on disk (app.usage_days), by the same labels.
            usage_days.count(route, scope["method"], status)
