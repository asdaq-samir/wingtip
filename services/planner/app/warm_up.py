"""The planner's warm-up and its periodic checks (started by app.main's
lifespan): the reference data every request reads, loaded at start
rather than under the first pilot's request, and what is checked again
once it is warm (the FAA's editions, the chart cycle). The FAA's
aircraft registry is ingest's to read (ingest.history), off the
planner's process."""

import csv
import logging
import threading

from apscheduler.schedulers.base import BaseScheduler
from wingtip import (
    airport_comms,
    airspace,
    altitude,
    chart_prepare,
    faa_data,
    faa_editions,
    fixes,
    geocode,
    icing_forecast,
    nearby,
    pattern,
    places,
    publication_prune,
    publications,
    remarks,
    sua,
    water,
    weather,
)
from wingtip import airspace_at, chart_serving, congested, cycle_pack, data_cycles, library, phone_pack, procedures, schedule
from wingtip import airports as airport_table

from . import chart_model, chart_refresh
from .chart_cycle import check as chart_cycle
from .router_basics import PROCESSED_DIR
from .settings import get_settings

log = logging.getLogger(__name__)

# How often the FAA's files are checked for a new edition, and whether
# those on disk are still in their cycle.
EDITIONS_CHECK_EVERY_S = 6 * 3600
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
#: Whether the documents library's publications are fetched here
#: (wingtip.library): on, but on a test stack, whose suite stubs them.
FAA_LIBRARY_REFRESH = get_settings().faa_library_refresh
#: How often the library's sources are looked at for a new edition: the
#: eCFR is issued each working day, the FAA's books a few times a year.
LIBRARY_CHECK_EVERY_S = 24 * 3600
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
            chart_prepare.prepare_for_bbox((min(lons), min(lats), max(lons), max(lats)), kinds=("sec", "tac", "ifr_low", "ifr_area"))


def check_faa_editions() -> None:
    """The FAA's files fetched again a new edition at a time
    (wingtip.faa_editions.refresh_editions) where FAA_DATA_AUTO_REFRESH is on
    -- every EDITIONS_CHECK_EVERY_S, as a cycle starts on a known day and a
    check is three page reads -- and what changed read again here rather
    than under a pilot's request (the airspace's shapes alone are half a
    minute). A check that fails (the FAA's index out of reach) is logged by
    the scheduler and made again at the next turn."""
    if not FAA_DATA_AUTO_REFRESH:
        return
    refreshed = faa_editions.refresh_editions(altitude.DEFAULT_FAA_CACHE_DIR)
    # The next cycle's files fetched ahead in its week before 0901Z, for the
    # changeover to put in place with nothing to download.
    faa_editions.stage_next(altitude.DEFAULT_FAA_CACHE_DIR)
    if refreshed:
        log.info("FAA files refreshed: %s", ", ".join(refreshed))
        airspace.preload(altitude.DEFAULT_FAA_CACHE_DIR)
        faa_data.preload_obstacles(altitude.DEFAULT_FAA_CACHE_DIR)
        remarks.preload()
        fixes.preload()
        if CYCLE_PACK:
            cycle_pack.ensure(altitude.DEFAULT_FAA_CACHE_DIR)
            phone_pack.ensure_phone()
            chart_refresh.ask_for_overlays()


def check_procedures() -> None:
    """The next AIRAC cycle's CIFP fetched ahead in its week before 0901Z
    (wingtip.faa_editions.stage_next_cifp), and the cycle in force's fetched
    now where it is not on disk yet: the procedures are fetched on a pilot's
    first ask otherwise, 53 MB under his request. On whatever
    FAA_DATA_AUTO_REFRESH says, as that first ask fetches it regardless."""
    faa_editions.stage_next_cifp()
    procedures.cifp_path()


def at_changeover() -> None:
    """At 0902Z each day, a minute after an AIRAC or charting edition takes
    over (the engine's `data_cycle`): on a changeover day the next cycle's
    files go into place now (fetched ahead, `check_faa_editions`), the
    procedures and the d-TPP and Chart Supplement indexes of the new cycle
    are read, and what the map serves is decided again, rather than at the
    six-hourly check's next turn, up to six hours later. A day with no
    change costs a look at what is on disk."""
    check_faa_editions()
    check_procedures()
    publications.preload()
    publication_prune.prune()
    chart_serving.forget_serving()


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
    schedule.every(on, EDITIONS_CHECK_EVERY_S, check_procedures, name="faa-procedures")
    # And a minute after each 0901Z: an edition takes over then, not at the
    # six-hourly check's next turn.
    schedule.daily_at(on, 9, 2, at_changeover, name="faa-changeover")
    # The documents library (wingtip.library), now and once a day.
    if FAA_LIBRARY_REFRESH:
        schedule.every(on, LIBRARY_CHECK_EVERY_S, library.refresh, name="faa-library")
    # The chart cycle, an hour from now: the warm-up has just checked it.
    schedule.every(on, chart_refresh.CHECK_EVERY_S, check_chart_cycle, name="chart-cycle", now=False)


def warm_reference_data(on: BaseScheduler) -> None:
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
        # Every field's runways from NASR (wingtip.nasr_fields) and their
        # ends' right traffic and positions (wingtip.pattern): the first
        # briefing after a restart read them, 2.4 s where the next took
        # 18 ms (4.8 and 0.5 s of a cold briefing's 5.4 s profiled in the
        # planner's container, 2026-11-27).
        ("runways", lambda: airport_comms.get_runways("KORD")),
        ("runway ends", lambda: pattern.right_traffic_ends("KORD")),
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
    # And the forecast icing and the ground under it (wingtip.icing_forecast.warm):
    # the first IFR Go / No-Go or Brief after a deploy paid 0.6 s for them.
    try:
        icing_forecast.warm()
    except Exception:  # noqa: BLE001 -- the first IFR Go / No-Go reads them itself
        log.exception("forecast icing warm-up failed")

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
        publication_prune.prune()
    except Exception:  # noqa: BLE001
        log.exception("publications warm-up failed")
    # And the towns Nearest can be asked from (wingtip.geocode), a megabyte
    # from the Census Bureau the first time.
    try:
        geocode.preload()
    except Exception:  # noqa: BLE001
        log.exception("towns warm-up failed")

    # The cycle pack, from the files read above, where the one on disk is
    # not of them: a new cycle's first start writes it (a minute or so),
    # and every start after reads its airspace and towns from it. Then the
    # phones' packs of it, by region (/api/cycle-packs).
    if CYCLE_PACK:
        try:
            cycle_pack.ensure(altitude.DEFAULT_FAA_CACHE_DIR)
            phone_pack.ensure_phone()
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
        from . import landmark_cells

        try:
            built = landmark_cells.build_on_disk()
            if built:
                log.info("%d chart cells of lakes and towns read", built)
        except Exception:  # noqa: BLE001 -- a corridor is read whole meanwhile, and the next start tries again
            log.exception("chart cells not read")

    if get_settings().landmarks_build:
        threading.Thread(target=_build_landmarks, name="landmark-cells", daemon=True).start()

    _schedule_checks(on)
