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

import csv
import logging
import threading
from contextlib import asynccontextmanager

from apscheduler.schedulers.base import BaseScheduler
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from wingtip import (
    airspace,
    altitude,
    charts,
    faa_data,
    fixes,
    geocode,
    nearby,
    places,
    publications,
    registry,
    remarks,
    sua,
    water,
    weather,
)
from wingtip import airspace_at, congested, cycle_pack, data_cycles, schedule, traffic as traffic_store
from wingtip import airports as airport_table

from . import chart_model, chart_refresh, errors, openapi_document, tracing
from .mcp import server as mcp
from .chart_cycle import check as chart_cycle
from .feeds import watch as feeds_watch
from .router_basics import PROCESSED_DIR
from wingtip.aircraft import UnknownAircraft
from wingtip.planning import StillComputing
from .routers import airports, airspace as airspace_router, basemaps, briefing, chart, classb, devml, devservices, notes, plan, clearance
from .routers import copilot, emergency, feeds, figures, gonogo, live, packs, pilot, route_options, system, terrain, coach, words, plates
from .routers import aircraft_form, airplanes, studio, studio_drafts, studio_history, weather_flow
from .routers import forecast_run, logbook_draft, notam_rank, offline, traffic, weather_loop, weather_map, window
from .schemas.common import Index
from .settings import get_settings

# Nothing else in the process configured logging, so every log.info() in
# this codebase -- this file's own, and every one already written in
# wingtip/weather.py and wingtip/charts.py before this -- was going nowhere:
# Python's root logger defaults to WARNING, and uvicorn's own --log-level
# only reaches its own uvicorn.access/uvicorn.error loggers, not a plain
# logging.getLogger(__name__) anywhere else in the process. Found while
# adding the timing lines in wingtip.altitude and app.routers.classb
# (2026-09-23) and running one live to see it -- nothing appeared.
# LOG_LEVEL, not a hardcoded INFO, so a noisy deploy can be turned down.
# The environment is read and checked here at the latest (wingtip.config
# reads it on import): a malformed value -- a word where a number goes --
# stops the planner at boot with SettingsError naming the variable,
# rather than on the first request that needs it.
logging.basicConfig(level=get_settings().log_level)

log = logging.getLogger(__name__)

# How often the FAA's files are checked for a new edition, whether those
# on disk are still in their cycle, and whether the registry is a day old.
EDITIONS_CHECK_EVERY_S = 6 * 3600
#: Whether the FAA's aircraft registry is downloaded and read here
#: (wingtip.registry): on, but on a test stack (infra/docker-compose.ci.yml).
REGISTRY_REFRESH = get_settings().registry_refresh
#: Whether a new edition of the FAA's NASR files (airports, frequencies,
#: navaids, Class B/C/D) and its obstacle file is fetched here
#: (check_faa_editions): on, but on a test stack. Its own switch, not the
#: charts': production draws no charts (CHARTS_AUTO_REFRESH=0), and gated
#: on that, it went on reading the edition it first fetched, cycle after
#: cycle -- a changed frequency or a redrawn Class D unseen.
FAA_DATA_AUTO_REFRESH = get_settings().faa_data_auto_refresh
#: Whether the cycle pack (wingtip.cycle_pack) is built here, from the files the
#: planner holds, once a cycle: on, but on a test stack, which reads the
#: files themselves and need not write 400 MB a run.
CYCLE_PACK = get_settings().cycle_pack
# Set once the reference data below is loaded: the health probe reports
# it, so a test run against a fresh stack can wait for a planner that
# answers at full speed rather than one still parsing airspace under its first requests.
WARM = threading.Event()


def _prepare_corridor_charts() -> None:
    """The FAA charts under every corridor already built here -- a
    sectional is a 70 MB download and a minute of preparation the first
    time, which should happen now rather than under the first pilot's
    map. The corridor's candidate file gives its extent."""
    for path in sorted(PROCESSED_DIR.glob("candidates_*.csv")):
        lats, lons = [], []
        with path.open() as f:
            for row in csv.DictReader(f):
                try:
                    lats.append(float(row["lat"]))
                    lons.append(float(row["lon"]))
                except (KeyError, ValueError):
                    continue
        if lats:
            # Every kind the map can draw over the corridor: the base
            # charts (sectional, IFR low) and the two a Class B card
            # pins over them (TAC, IFR area). It was the VFR pair only,
            # the daily refresh fetching the rest -- and a stack started
            # from nothing with that refresh off, CI's, had no IFR chart
            # for the tests that switch to one.
            charts.prepare_for_bbox((min(lons), min(lats), max(lons), max(lats)), kinds=("sec", "tac", "ifr_low", "ifr_area"))


def check_faa_editions() -> None:
    """The FAA's files fetched again a new edition at a time
    (wingtip.faa_data.refresh_editions) where FAA_DATA_AUTO_REFRESH is on
    -- every EDITIONS_CHECK_EVERY_S, as a cycle starts on a known day and a
    check is three page reads -- and what changed read again here rather
    than under a pilot's request (the airspace's shapes alone are half a
    minute). A check that fails (the FAA's index out of reach) is logged by
    the scheduler and made again at the next turn."""
    if not FAA_DATA_AUTO_REFRESH:
        return
    refreshed = faa_data.refresh_editions(altitude.DEFAULT_FAA_CACHE_DIR)
    if refreshed:
        log.info("FAA files refreshed: %s", ", ".join(refreshed))
        airspace.preload(altitude.DEFAULT_FAA_CACHE_DIR)
        faa_data.preload_obstacles(altitude.DEFAULT_FAA_CACHE_DIR)
        remarks.preload()
        fixes.preload()
        if CYCLE_PACK:
            cycle_pack.ensure(altitude.DEFAULT_FAA_CACHE_DIR)
            cycle_pack.ensure_phone()
            chart_refresh.ask_for_overlays()


def check_chart_cycle() -> None:
    """The chart cycle, each chart_refresh.CHECK_EVERY_S: app.chart_refresh
    decides what that starts, and the next cycle is staged ahead of its
    date (CHARTS_CYCLE_AUTO)."""
    if chart_refresh.AUTO_REFRESH:
        chart_refresh.maybe_refresh()
    chart_cycle.maybe_stage_next()


def _schedule_checks(on: BaseScheduler) -> None:
    """What the planner keeps checking once its data is warm, each a job on
    its scheduler (wingtip.schedule). The weather is not among them: the
    weather service (services/weather) fetches it on its own schedule into
    the store the planner reads (wingtip.weather_store, #535)."""
    # Whether the FAA's data on disk is still in its cycle
    # (wingtip.data_cycles): with the refreshes off (production), nothing
    # fetches a new edition, and an old one reads as if nothing were wrong.
    # Checked on every switch's setting; the log is told once a day while
    # one is out of date.
    schedule.every(on, EDITIONS_CHECK_EVERY_S, data_cycles.warn_if_out_of_date, name="faa-data-cycles")
    # The FAA's files a new edition at a time: now, and four times a day.
    schedule.every(on, EDITIONS_CHECK_EVERY_S, check_faa_editions, name="faa-editions")
    # The aircraft registry, read again once it is a day old (each check a
    # look at the file's age): now as well, so a warm-up read that failed is
    # tried again, and after a good one refresh() sees a fresh file and does
    # nothing.
    if REGISTRY_REFRESH:
        schedule.every(on, EDITIONS_CHECK_EVERY_S, registry.refresh, name="aircraft-registry")
    # The chart cycle, an hour from now: the warm-up has just checked it.
    schedule.every(on, chart_refresh.CHECK_EVERY_S, check_chart_cycle, name="chart-cycle", now=False)


def _warm_reference_data(on: BaseScheduler) -> None:
    """Every altitude selection needs the controlled-airspace polygons
    and the obstacle table, and both are slow to load cold (about thirty
    and nine seconds from the FAA files, well under a second from the
    caches wingtip keeps beside them); every briefing needs the current
    METAR/TAF/SIGMET datasets, a few downloads; every map needs the
    charts under it. All are loaded here rather than on the first
    pilot's request after a restart. A request arriving mid-load waits
    on the same parse instead of starting another."""
    # The chart reader's processes first, starting beside all of it.
    try:
        chart_model.start_readers()
    except Exception:  # noqa: BLE001 -- the first route's read starts them
        log.exception("chart readers not started")
    for name, load in (
        ("airspace", lambda: airspace.preload(altitude.DEFAULT_FAA_CACHE_DIR)),
        ("obstacles", lambda: faa_data.preload_obstacles(altitude.DEFAULT_FAA_CACHE_DIR)),
        ("weather", weather.preload),
        ("remarks", remarks.preload),
        # The airport search's table and index (wingtip.airports): the first
        # search after a restart built them, three seconds before the
        # first suggestion.
        ("airport search", lambda: airport_table.search_airports("K")),
        # And the lookup of a route's airports by ident (get_airport).
        ("airport lookup", airport_table.preload_lookup),
        ("fixes", fixes.preload),
        # Every special-use area in the country (wingtip.sua): asked for round
        # each route, a new route's were a request of 0.3 to 2.5 s.
        ("special-use airspace", sua.preload),
        # Each Class B to E volume's box (wingtip.airspace_at), for the
        # airspace over a point held on the chart: the shapefile walked
        # once here, not at the first tap.
        ("airspace at a point", lambda: airspace_at.preload(airspace.ensure_class_airspace_shapefile(altitude.DEFAULT_FAA_CACHE_DIR))),
        # The land and large lakes for Routes' way over land (wingtip.water).
        ("water", water.preload),
        # The towns the terrain floor's clearances are set by (wingtip.congested,
        # 14 CFR 91.119(b)): the Census urban areas' outlines read, and the
        # gazetteer's places, before the first route's floor asks.
        ("congested areas", congested.preload),
        # The traffic pattern altitudes from the airport file (wingtip.faa_data):
        # its parse was 11.8 s of a cold KBOS to KSAN's plan (Session1's
        # profile, 2026-10-23).
        ("patterns", lambda: faa_data.pattern_agl_ft("KJFK", altitude.DEFAULT_FAA_CACHE_DIR)),
        # And its charted, open fields, a route's checkpoint candidates.
        (
            "route airports",
            lambda: faa_data.load_route_airports(
                faa_data.ensure_nasr_file("APT_BASE.csv", altitude.DEFAULT_FAA_CACHE_DIR), (0.0, 0.0, 0.0, 0.0)
            ),
        ),
        ("charts", _prepare_corridor_charts),
    ):
        try:
            load()
        except Exception:  # noqa: BLE001 -- the first altitude selection will load it, and report its own error
            log.exception("%s warm-up failed", name)
    WARM.set()

    # First after warm, as every airport's card reads them: the fields'
    # contacts (wingtip.faa_data.airport_contact) and frequencies
    # (airport_frequencies), each read once a cycle -- three and two and a
    # half seconds the first card after a restart waited on (KRFD's 4.8 s,
    # 2026-10-10), while the place names and indexes below were read first.
    try:
        faa_data.airport_contact("KORD", altitude.DEFAULT_FAA_CACHE_DIR)
    except Exception:  # noqa: BLE001
        log.exception("airport contacts warm-up failed")
    try:
        faa_data.airport_frequencies("KORD", altitude.DEFAULT_FAA_CACHE_DIR)
    except Exception:  # noqa: BLE001
        log.exception("airport frequencies warm-up failed")
    # And Overture's places files' footers (wingtip.nearby.warm): the map's
    # Stops and a card's Info read a field's places, 2.5 s cold, 0.3 s after.
    try:
        nearby.warm()
    except Exception:  # noqa: BLE001 -- a stop is chosen on time and fuel alone until it is in
        log.exception("nearby places warm-up failed")

    # After warm, not before it: the first start downloads the USGS's
    # place names (wingtip.places), and nothing waits on them -- a waypoint
    # is only left undescribed until they are in.
    try:
        places.preload()
    except Exception:  # noqa: BLE001
        log.exception("places warm-up failed")
    # The same for the airport diagrams' and Chart Supplement's indexes
    # (wingtip.publications), once per edition: a card only links them.
    try:
        publications.preload()
    except Exception:  # noqa: BLE001
        log.exception("publications warm-up failed")
    # And the towns Nearest can be asked from (wingtip.geocode), a megabyte
    # from the Census Bureau the first time.
    try:
        geocode.preload()
    except Exception:  # noqa: BLE001
        log.exception("towns warm-up failed")
    # And the FAA's aircraft registry (wingtip.registry), for a tracked
    # airplane's card: 73 MB from the FAA and half a minute's read, once a
    # day; a card before it is in shows no registration. Its own switch
    # (REGISTRY_REFRESH), not the charts': the server draws no charts
    # (CHARTS_AUTO_REFRESH=0 there too), and gated on that, it never read
    # the registry at all. Off on a test stack, which downloads nothing it need not.
    if REGISTRY_REFRESH:
        try:
            registry.refresh()
        except Exception:  # noqa: BLE001 -- the next day's check tries again
            log.exception("aircraft registry not read")

    # The cycle pack, from the files read above, where the one on disk is
    # not of them: a new cycle's first start writes it (a minute or so),
    # and every start after reads its airspace and towns from it. Then the
    # phones' packs of it, by region (/api/cycle-packs).
    if CYCLE_PACK:
        try:
            cycle_pack.ensure(altitude.DEFAULT_FAA_CACHE_DIR)
            cycle_pack.ensure_phone()
        except Exception:  # noqa: BLE001 -- the files are read as they were; the next start tries again
            log.exception("cycle pack not built")
        # Its overlay tiles are the charts job's to build (app.chart_refresh).
        chart_refresh.ask_for_overlays()

    check_chart_cycle()

    # And the chart's lakes and towns, read once a cycle under the
    # sectionals on disk (app.landmarks), so a new route's corridor read
    # takes them from there in under half the time. In a thread of its
    # own: a first build is many minutes. Imported here, not at the top, so a planner with it
    # off (LANDMARKS_BUILD=0, infra/docker-compose.ci.yml) never loads the reader.
    def _build_landmarks() -> None:
        from . import landmarks

        try:
            built = landmarks.build_on_disk()
            if built:
                log.info("%d chart cells of lakes and towns read", built)
        except Exception:  # noqa: BLE001 -- a corridor is read whole meanwhile, and the next start tries again
            log.exception("chart cells not read")

    if get_settings().landmarks_build:
        threading.Thread(target=_build_landmarks, name="landmark-cells", daemon=True).start()

    _schedule_checks(on)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    # The planner's periodic work, each a job on one scheduler (wingtip.schedule):
    # the warm-up's checks once it is done (_schedule_checks), and from now
    # whether the live feeds and the weather still come in (app.feeds), a
    # check a minute. The feeds themselves are read by ingest into the
    # stores the planner reads: none here.
    on = schedule.scheduler()
    schedule.every(on, feeds_watch.CHECK_EVERY_S, feeds_watch.check, name="feed-watch")
    schedule.every(on, traffic_store.PRUNE_EVERY_S, traffic_store.prune, name="live-store-prune")
    on.start()
    threading.Thread(target=_warm_reference_data, args=(on,), name="reference-data-warm-up", daemon=True).start()
    yield
    on.shutdown(wait=False)


app = FastAPI(title="Wingtip Maps planner", lifespan=_lifespan)
# What failed lately, for the Dev console (app.errors).
app.add_middleware(errors.RecordFailures)
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
    (plan, chart, briefing, notes, devml, system, classb, devservices, airports, airspace_router, traffic, basemaps),
    (route_options, gonogo, figures, clearance, packs, words, weather_map, weather_flow, weather_loop, forecast_run),
    (pilot, live, feeds, terrain, window, emergency, copilot, logbook_draft, notam_rank, offline, coach),
    (mcp, plates, studio_history, studio, studio_drafts, aircraft_form, airplanes),
)
for group in ROUTERS:
    for module in group:
        app.include_router(module.router)

app.openapi = openapi_document.with_streams(app)
