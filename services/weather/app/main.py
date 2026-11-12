"""The weather service: every product the planner reads fetched on its own
schedule into the weather store (wingtip.weather_store), and a health
check that says how fresh each is.

    python -m app.main

Each product is fetched as soon as the service starts, then every
`every_s` while a pilot is planning (the planner read the store in the
last WEATHER_IN_USE_S) and every `idle_every_s` otherwise (app.settings).
A product being fetched is not started again; a failure is logged and
written beside the stored copy (weather_store.write_attempt), which the
planner goes on serving while its product's own validity lasts, and the
product is tried again at its next turn. Each source is asked as it asks
to be: the cache files rather than per-route queries (aviationweather.gov's
API terms), each only if it has changed, wingtip's User-Agent on every
request (the FAA's browser-like one where its sites want it).

GET / (or /health) answers 200 while the process runs, with each
product's age: {"status": "ok" | "stale", "in_use", "products": {name:
{"fetched_at", "age_s", "until", "servable", "failing", "error",
"every_s", "stale"}}}. A product is stale once its copy is older than
three of its idle turns, or past its own validity; "stale" overall if any
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
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from collections.abc import Callable

from wingtip import tracing, weather_store

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
    *(Product(name, _source(name), "reports") for name in aviationweather.SOURCES),
    *(Product(f"winds-{hr}", _winds(hr), "winds") for hr in gfs.PERIODS),
    Product("glmp", glmp.fetch_latest, "glmp"),
    Product("glmp-forecast", glmp_forecast.fetch_latest, "glmp"),
    Product("spc-outlook", spc.fetch_outlook, "outlook"),
    Product("tfrs", tfr.fetch, "tfrs"),
    Product("radar", radar.fetch, "radar"),
    Product("satellite", satellite.fetch, "satellite"),
    Product("flow", flow.fetch, "flow"),
)

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
    """When each product was last tried, and which are being fetched."""

    def __init__(self, products=PRODUCTS):
        self.products = {p.name: p for p in products}
        self.tried: dict[str, float] = {}
        self.running: set[str] = set()
        self.lock = threading.Lock()

    def due(self, now: float) -> list[Product]:
        """The products whose turn has come and that are not being fetched."""
        busy = in_use(now)
        with self.lock:
            return [
                p
                for name, p in self.products.items()
                if name not in self.running and now - self.tried.get(name, float("-inf")) >= p.every_s(busy)
            ]

    def run(self, product: Product) -> None:
        """One product fetched, its failure logged and written beside its copy."""
        with self.lock:
            if product.name in self.running:
                return
            self.running.add(product.name)
            self.tried[product.name] = time.time()
        started = time.time()
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
        except Exception as err:  # noqa: BLE001 -- one product's bug must not stop the others' schedule
            log.exception("%s failed", product.name)
            weather_store.write_attempt(product.name, started, f"{type(err).__name__}: {err}"[:500])
        finally:
            with self.lock:
                self.running.discard(product.name)

    def loop(self, stop: threading.Event) -> None:
        settings = get_settings()
        with ThreadPoolExecutor(max_workers=settings.workers, thread_name_prefix="fetch") as pool:
            while not stop.is_set():
                for product in self.due(time.time()):
                    with self.lock:
                        # Marked tried now, so the next tick does not queue it again.
                        self.tried[product.name] = time.time()
                    pool.submit(self.run, product)
                stop.wait(settings.tick_s)


def health(now: float | None = None) -> dict:
    """Each product's freshness, as GET / answers it."""
    now = time.time() if now is None else now
    busy = in_use(now)
    products = {}
    for product in PRODUCTS:
        record = weather_store.read(product.name)
        tried = weather_store.attempt(product.name)
        age = None if record is None else round(now - record.fetched_at, 1)
        servable = weather_store.servable(record, now)
        failing = bool(tried and tried.get("error") and (record is None or tried["attempted"] >= record.fetched_at))
        products[product.name] = {
            "fetched_at": record.fetched_at if record else None,
            "age_s": age,
            "until": record.until if record else None,
            "servable": servable,
            "failing": failing,
            "error": tried.get("error") if failing else None,
            "every_s": product.every_s(busy),
            "stale": not servable or age is None or age > 3 * product.every_s(False),
        }
    stale = any(p["stale"] for p in products.values())
    return {"status": "stale" if stale else "ok", "in_use": busy, "products": products}


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

    logging.basicConfig(level=wingtip_settings().log_level, format="%(asctime)s %(name)s %(levelname)s %(message)s")
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
    Schedule().loop(stop)
    server.shutdown()


if __name__ == "__main__":
    main()
