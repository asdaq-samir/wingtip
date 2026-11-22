"""The weather service: every product the planner reads fetched on its own
schedule into the weather store (wingtip.weather_store), and a health
check that says how fresh each is.

    python -m app.main

Each product is a job on wingtip's scheduler (wingtip.schedule), fetched
as soon as the service starts, then every `every_s` while a pilot is
planning (the planner read the store in the last WEATHER_IN_USE_S) and
every `idle_every_s` otherwise (app.settings): the job comes at the
planning pace and lets turns go by while nobody plans. A product being
fetched is not started again (the scheduler's one run at a time); a
failure is logged and
written beside the stored copy (weather_store.write_attempt), which the
planner goes on serving while its product's own validity lasts, and the
product is tried again at its next turn. Each source is asked as it asks
to be: the cache files rather than per-route queries (aviationweather.gov's
API terms), each only if it has changed, wingtip's User-Agent on every
request (the FAA's browser-like one where its sites want it).

GET / (or /health) answers 200 while the process runs, with each
product's age: {"status": "ok" | "stale", "in_use", "products": {name:
{"fetched_at", "age_s", "until", "servable", "failing", "error",
"every_s", "stale"}}}, "fetched_at" and the age from when the copy was
last confirmed (fetched, or found unchanged since). A product is stale
once that is older than three of its idle turns, or past its own validity; "stale" overall if any
is. The answer says so rather than failing the container's health, since
a restart fetches nothing an outage at NOAA would give.
"""

from __future__ import annotations

import json
import logging
import signal
import threading
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from collections.abc import Callable

from apscheduler.schedulers.base import BaseScheduler
from wingtip import log_lines, schedule, tracing, weather_store

from . import aviationweather, fetch, flow, gfs, glmp, glmp_forecast, radar, satellite, spc, tfr
from .settings import get_settings

log = logging.getLogger("weather")


@dataclass(frozen=True)
class Product:
    name: str
    run: Callable[[], object]
    every: str
    """The settings' prefix of its two intervals (reports, winds, ...)."""

    def every_s(self, in_use: bool) -> float:
        settings = get_settings()
        return getattr(settings, f"{self.every}_every_s" if in_use else f"{self.every}_idle_every_s")


def _source(name: str) -> Callable[[], None]:
    return lambda: aviationweather.fetch_source(name)


def _winds(fcst_hr: str) -> Callable[[], None]:
    return lambda: gfs.fetch_period(fcst_hr)


#: Every product, in the order a fresh start fetches them: what a plan
#: reads first.
PRODUCTS = (
    *(Product(name, _source(name), "airmets" if name == "airmets" else "reports") for name in aviationweather.SOURCES),
    *(Product(f"winds-{hr}", _winds(hr), "winds") for hr in gfs.PERIODS),
    Product("glmp", glmp.fetch_latest, "glmp"),
    Product("glmp-forecast", glmp_forecast.fetch_latest, "glmp"),
    Product("spc-outlook", spc.fetch_outlook, "outlook"),
    Product("tfrs", tfr.fetch, "tfrs"),
    Product("radar", radar.fetch, "radar"),
    Product("satellite", satellite.fetch, "satellite"),
    Product("flow", flow.fetch, "flow"),
)



def products() -> tuple[Product, ...]:
    """The products this service fetches: every one, but the flow layer
    only while WEATHER_FLOW_ON says so (settings.flow_on), so a parked
    layer costs no download and no memory."""
    on = get_settings().flow_on
    return tuple(p for p in PRODUCTS if on or p.name != "flow")


#: What a fetch may fail with: its source, in its own words.
FAILURES = (
    fetch.FetchFailed,
    gfs.ModelWindsUnavailable,
    flow.FlowUnavailable,
    glmp.GlmpUnavailable,
    tfr.TfrUnavailable,
    radar.RadarUnavailable,
    satellite.SatelliteUnavailable,
    ET.ParseError,
    OSError,
    ValueError,
)


def in_use(now: float | None = None) -> bool:
    """Whether a pilot is planning: the planner read the store lately."""
    return (time.time() if now is None else now) - weather_store.last_asked() < get_settings().in_use_s


class Schedule:
    """When each product was last tried, and its turns on the scheduler."""

    def __init__(self, chosen: tuple[Product, ...] | None = None):
        self.products = {p.name: p for p in (products() if chosen is None else chosen)}
        self.tried: dict[str, float] = {}
        self.lock = threading.Lock()

    def due(self, product: Product, now: float) -> bool:
        """Whether this turn of the product's job fetches it: on the first
        turn, on every turn while a pilot is planning (the job's own pace is
        the planning pace), and otherwise once the idle pace has come round,
        to within half a turn, so a turn a moment early is not let go by."""
        with self.lock:
            tried = self.tried.get(product.name)
        if tried is None or in_use(now):
            return True
        return now - tried >= product.every_s(False) - product.every_s(True) / 2

    def turn(self, product: Product) -> None:
        """One turn of a product's job: fetched if it is due."""
        if self.due(product, time.time()):
            self.run(product)

    def run(self, product: Product) -> None:
        """One product fetched, its failure logged and written beside its copy."""
        started = time.time()
        with self.lock:
            self.tried[product.name] = started
        try:
            # A trace of its own where tracing is on (wingtip.tracing): the
            # fetch, each source asked under it, each engine rule it reads with.
            with tracing.span(f"fetch {product.name}", root=True, **{"wingtip.weather.product": product.name}):
                product.run()
            weather_store.write_attempt(product.name, started, None)
            log.info("%s fetched in %.1f s", product.name, time.time() - started)
        except FAILURES as err:
            log.warning("%s not fetched: %s", product.name, err)
            weather_store.write_attempt(product.name, started, str(err)[:500])
        except Exception as err:  # noqa: BLE001 -- written beside the copy, so the planner's health line says why
            log.exception("%s failed", product.name)
            weather_store.write_attempt(product.name, started, f"{type(err).__name__}: {err}"[:500])

    def jobs(self, on: BaseScheduler) -> None:
        """Each product a job at its planning pace, the first turn now, in
        the order a fresh start fetches them."""
        for product in self.products.values():
            schedule.every(on, product.every_s(True), self.turn, name=product.name, args=(product,))


def health(now: float | None = None) -> dict:
    """Each product's freshness, as GET / answers it."""
    now = time.time() if now is None else now
    busy = in_use(now)
    fresh = {}
    for product in products():
        record = weather_store.read(product.name)
        tried = weather_store.attempt(product.name)
        # The age is from the copy's last confirmation, not its writing: a
        # copy found unchanged is not written again (write_if_changed).
        confirmed = weather_store.confirmed_at(product.name, record)
        age = None if confirmed is None else round(now - confirmed, 1)
        servable = weather_store.servable(record, now)
        failing = weather_store.failing(product.name, record)
        fresh[product.name] = {
            "fetched_at": confirmed,
            "age_s": age,
            "until": record.until if record else None,
            "servable": servable,
            "failing": failing,
            "error": tried.get("error") if failing else None,
            "every_s": product.every_s(busy),
            "stale": not servable or age is None or age > 3 * product.every_s(False),
        }
    stale = any(p["stale"] for p in fresh.values())
    return {"status": "stale" if stale else "ok", "in_use": busy, "products": fresh}


class _Health(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 -- http.server's name
        if self.path.split("?")[0] not in ("/", "/health"):
            self.send_error(404)
            return
        body = json.dumps(health()).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):  # noqa: A002 -- http.server's name
        pass  # the health check every few seconds is not news


def main() -> None:
    from wingtip.config import get_settings as wingtip_settings

    # One line a record, JSON in production (LOG_FORMAT, wingtip.log_lines).
    log_lines.configure(wingtip_settings().log_level, wingtip_settings().log_format)
    # Traces with TRACING=1 (docs/LOCAL-DEV.md, "Tracing"); nothing otherwise.
    tracing.start("weather")
    settings = get_settings()
    weather_store.store_dir().mkdir(parents=True, exist_ok=True)
    stop = threading.Event()
    server = ThreadingHTTPServer(("0.0.0.0", settings.port), _Health)
    threading.Thread(target=server.serve_forever, name="health", daemon=True).start()

    def finish(*_):
        stop.set()

    signal.signal(signal.SIGTERM, finish)
    signal.signal(signal.SIGINT, finish)
    log.info("weather service: storing into %s, health on :%d", weather_store.store_dir(), settings.port)
    on = schedule.scheduler(workers=settings.workers)
    Schedule().jobs(on)
    on.start()
    stop.wait()
    on.shutdown(wait=False)
    server.shutdown()


if __name__ == "__main__":
    main()
