"""The route planner: two airport idents in, a chart with the course and
its checkpoints out, plus the dead-reckoning nav log for the legs between
them.

This is the human-facing surface of everything else in the project. The
chart reader finds what the sectional draws along the course, the chart
model scores it (wingtip.chartmodel, loaded by app.chart_scorer),
the engine's checkpoints_select narrows them to the handful worth flying, and wingtip.navlog turns those into legs
with real wind and magnetic variation -- but none of that is inspectable
from a JSON response. Seeing the checkpoints on the sectional is the only
way to judge whether they are findable in the air, which is the question
the whole model exists to answer.

Split of responsibility, and why it falls this way:

- The retrain job (services/jobs/retrain) trains and promotes the chart
  model (wingtip.chartmodel, wingtip.model_registry); this service only loads
  the promoted one and scores with it (app.chart_scorer), with the same
  pinned scikit-learn. It was a model-service container of its own
  until 2026-11-06.
- This service owns everything route-shaped: reading the chart along
  it, scoring what it finds, computing the nav log, and drawing it.
- The charts job (services/jobs/charts) renders a cycle's tiles and
  builds the map's overlay tiles; this service serves them, and draws a
  tile on request only where the job has not drawn it yet.

The endpoints live in app.routers, one module per concern; the work they
share -- resolving a route, scoring it, the nav-log arithmetic, the
corridor read -- is in the modules next to this one, and every shape
they send is a model in app.schemas.
"""

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from prometheus_client import make_asgi_app
from wingtip import chart_upkeep, log_lines, schedule, weather
from wingtip import traffic as traffic_store
from wingtip.aircraft import UnknownAircraft
from wingtip.planning import StillComputing

from . import errors, local_guard, openapi_document, route_metrics, tracing
from .feeds import watch as feeds_watch
from .request_ids import RequestIds
from .mcp import server as mcp
from .routers import airports, airspace as airspace_router, basemaps, briefing, chart, classb, devml, devservices, notes, plan, clearance
from .routers import airport_card, airport_charts, airport_stops, navlog
from .routers import copilot, emergency, feeds, figures, gonogo, live, packs, pilot, route_options, system, terrain, coach, words, plates
from .routers import aircraft_form, airplanes, library, studio, studio_drafts, studio_history, weather_flow
from .routers import forecast_run, logbook_draft, notam_rank, offline, plate_sets, traffic, weather_loop, weather_map, window
from .schemas.common import Index
from .settings import get_settings
from .warm_up import WARM, warm_reference_data

# Nothing else in the process configured logging, so every log.info() in
# this codebase -- this file's own, and every one already written in
# wingtip/weather.py and wingtip/charts.py before this -- was going nowhere:
# Python's root logger defaults to WARNING, and uvicorn's own --log-level
# only reaches its own uvicorn.access/uvicorn.error loggers, not a plain
# logging.getLogger(__name__) anywhere else in the process. Found while
# adding the timing lines in wingtip.altitude and app.routers.classb
# (2026-09-23) and running one live to see it -- nothing appeared.
# LOG_LEVEL, not a hardcoded INFO, so a noisy deploy can be turned down;
# LOG_FORMAT=json in production, one JSON object a line with the page's
# request id (wingtip.log_lines, app.request_ids).
# The environment is read and checked here at the latest (wingtip.config
# reads it on import): a malformed value -- a word where a number goes --
# stops the planner at boot with SettingsError naming the variable,
# rather than on the first request that needs it.
log_lines.configure(get_settings().log_level, get_settings().log_format)

log = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    # The planner's periodic work, each a job on one scheduler (wingtip.schedule):
    # the warm-up's checks once it is done (app.warm_up), and from now
    # whether the live feeds and the weather still come in (app.feeds), a
    # check a minute. The feeds themselves are read by ingest into the
    # stores the planner reads: none here.
    on = schedule.scheduler()
    schedule.every(on, feeds_watch.CHECK_EVERY_S, feeds_watch.check, name="feed-watch")
    schedule.every(on, traffic_store.PRUNE_EVERY_S, traffic_store.prune, name="live-store-prune")
    # On AWS, older cycles' chart sheets off the data disk (chart_upkeep.prune_behind_served).
    schedule.every(on, chart_upkeep.PRUNE_EVERY_S, chart_upkeep.prune_behind_served, name="chart-sheets-prune", now=False)
    on.start()
    threading.Thread(target=warm_reference_data, args=(on,), name="reference-data-warm-up", daemon=True).start()
    yield
    on.shutdown(wait=False)


app = FastAPI(title="Wingtip Maps planner", lifespan=_lifespan)
# Nothing but the gateway and the machine's own tools: no web page, by a
# rebound name or from another site (app.local_guard).
app.add_middleware(local_guard.LocalOnly)
# What failed lately, for the Dev console (app.errors).
app.add_middleware(errors.RecordFailures)
# Each route's calls, failures and times, for the owner's status page
# (app.route_metrics); the same figures in Prometheus's text at /metrics,
# on the planner's own port only (the gateway forwards /api/planner/*).
app.add_middleware(route_metrics.CountCalls)
app.mount("/metrics", make_asgi_app(registry=route_metrics.METRICS.registry))
# The page's request id on each log line (app.request_ids); added last, so
# it is outermost and RecordFailures' own lines carry it too.
app.add_middleware(RequestIds)
# Traces, where an OTLP endpoint is set (app.tracing).
tracing.instrument(app)


@app.exception_handler(weather.WeatherServiceError)
async def _weather_service_error(request: Request, exc: weather.WeatherServiceError):
    # One place, not one try/except per call site -- weather.py's
    # functions are called from /api/plan, /api/navlog and /api/briefing
    # alike, and a down or slow
    # aviationweather.gov should read as "the weather source is
    # unavailable" everywhere, not a raw 500.
    errors.record_for(request, 502, str(exc))
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(StillComputing)
async def _still_computing(request: Request, exc: StillComputing):
    # A computation for this route has run past its limit (wingtip.planning):
    # a 504 that says what it is still waiting on, and that asking again
    # in a minute gets the answer it goes on to cache.
    errors.record_for(request, 504, str(exc))
    return JSONResponse(status_code=504, content={"detail": str(exc)})


@app.exception_handler(UnknownAircraft)
async def _unknown_aircraft(request: Request, exc: UnknownAircraft):
    # A profile asked by a name no stock one goes by (wingtip.aircraft): the
    # request's fault, a 422 with its words, from every endpoint alike.
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/")
def index() -> Index:
    """This service has no pages. The front end is built into the Spring Boot gateway's jar and served
    from there, which is also the only thing that calls this -- so this answers a health probe and
    says where the UI went."""
    return Index(service="planner", ui="served by the gateway at /app", warm=WARM.is_set())


# Every router, here and not inside another (.importlinter's routers-independent), in the
# order their paths are matched and the OpenAPI document lists them; a few to a line.
ROUTERS = (
    (plan, navlog, chart, briefing, notes, devml, system, classb, devservices, airports, airport_card, airport_charts, airport_stops),
    (airspace_router, traffic, basemaps),
    (route_options, gonogo, figures, clearance, packs, words, weather_map, weather_flow, weather_loop, forecast_run),
    (pilot, live, feeds, terrain, window, emergency, copilot, logbook_draft, notam_rank, offline, plate_sets, coach),
    (mcp, plates, studio_history, studio, studio_drafts, aircraft_form, airplanes, library),
)
for group in ROUTERS:
    for module in group:
        app.include_router(module.router)

app.openapi = openapi_document.with_streams(app)
