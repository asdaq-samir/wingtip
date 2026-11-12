"""Shared locations and thresholds, deliberately free of heavy imports.

`wingtip.pipeline` owns the pipeline logic but pulls in requests/pyarrow and
the OSM/FAA modules just by being imported, so anything that only needs
to know *where* the data lives -- planner, for one -- would drag
that whole chain in for three constants. Keeping them here means a consumer
pays for pathlib and nothing else.

wingtip.pipeline re-exports these, so `from wingtip.pipeline import
CANDIDATES_PATH` keeps working for the notebooks and the training run.

It is also where every environment variable the Python reads is
declared, once, typed, with its default: `Settings` below, read through
`get_settings()`. wingtip and the planner (app.settings re-exports it)
ask it rather than os.environ, so a malformed value fails in one place
with a message naming the variable, and the list of knobs is one class
to read rather than a grep. pydantic-settings is the one import that
costs anything here, and pydantic is in every image that imports wingtip.
"""

import functools
from pathlib import Path

from pydantic import ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"

PROCESSED_DIR = DATA_DIR / "processed"


def corridor_paths(dep: str, dest: str) -> tuple[Path, Path]:
    """A corridor's candidates CSV and feature table, named for its two
    idents. The one place the names are made: the planner's build and its
    corridor list, and the pipeline's own defaults, all ask here."""
    slug = f"{dep.lower()}_{dest.lower()}"
    return PROCESSED_DIR / f"candidates_{slug}.csv", PROCESSED_DIR / f"features_{slug}.parquet"


CANDIDATES_PATH, FEATURES_PATH = corridor_paths("C81", "KDLH")
LABELS_PATH = DATA_DIR / "labels" / "spottability_ratings.csv"

# How long the planner works on a plan before answering that it is still
# working (a 504 naming what it waits on; the answer is kept for the next
# ask). The slowest real altitude selection seen was a little over two
# minutes, on a bad aviationweather.gov day. A client's own timeout
# should follow from it, so a slow plan reads as the planner's answer
# and not as a planner that could not be reached.
PLAN_LIMIT_S = 240

# Who wingtip says it is to the sources it downloads from. Most take the
# project's own name; the FAA's sites (and the Census geocoder's) 403 a
# bare python-requests User-Agent and want one that reads as a browser's.
REQUEST_HEADERS = {"User-Agent": "wingtip-maps/0.1"}
FAA_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; wingtip-maps/0.1)"}

# Below this many labeled examples, a train/test split and 5-fold CV
# aren't meaningful (some rating classes may have 0-1 examples), so
# retrain() refuses to run rather than let scikit-learn raise an opaque
# stratify/fold-count error.
MIN_LABELED_ROWS = 30

# The VFR charts themselves: the FAA publishes every sectional and
# terminal area chart as a georeferenced TIFF, free, on the 56-day
# chart cycle. wingtip.charts downloads the ones a route needs and renders
# the map's tiles from them -- the chart exactly as printed, served by
# this app, with no hosted map service in between. (Two came and went
# before this: the FAA's own ArcGIS tile cache, which went behind a
# login around 2026-09-03, then Texas A&M's public mirror of the same
# data, which had no tile cache and no chart west of Duluth.)
#
# Chart editions are listed on the products page, each under a
# cycle-dated URL; when the page cannot be reached, the cycle is the
# engine's 56-day arithmetic (wingtip.data_cycles).
FAA_VFR_PRODUCTS_PAGE = "https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/vfr/"
FAA_VISUAL_ZIP_URL = "https://aeronav.faa.gov/visual/{cycle}/{folder}/{name}.zip"
FAA_ENROUTE_ZIP_URL = "https://aeronav.faa.gov/enroute/{cycle}/{name}.zip"

# --- The environment ---


def _switch(value):
    """A switch as the code has always read one: on unless it is "0"
    (compose and infra write 0 and 1)."""
    return value.strip() != "0" if isinstance(value, str) else value


def _none_if_blank(value):
    """An unset-or-empty variable as None, the way `os.environ.get(...)
    or None` read it: compose passes `${VAR:-}` through as an empty
    string."""
    return None if isinstance(value, str) and not value.strip() else value


class Settings(BaseSettings):
    """Every environment variable wingtip and the planner read, by its
    own name (case aside; the field `log_level` is LOG_LEVEL), with its
    default. Unset optional keys (the ADS-B keys) are None,
    which is how each feature knows it is off. The Claude models and ANTHROPIC_API_KEY are the assistant
    service's (services/assistant, app.settings): the planner calls no model."""

    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    # wingtip
    #: The CloudFront base (with key prefix) the map's tiles come from on AWS; None locally.
    chart_tiles_url: str | None = None
    #: The S3 bucket a chart refresh publishes the cycle's tiles to; None locally.
    chart_tiles_bucket: str | None = None
    #: The key prefix inside that bucket.
    chart_tiles_prefix: str = "tiles"
    #: How many chart sheets may be downloaded and prepared at once (wingtip.charts).
    charts_prepare_at_once: int = 2
    #: Whether a tile may download a sheet it needs (CHARTS_FETCH_FOR_TILES=0 in CI).
    charts_fetch_for_tiles: bool = True
    #: wingtip.filed_routes' SQLite store of the FAA's filed routes.
    filed_store: Path = DATA_DIR / "raw" / "faa_filed" / "filed.sqlite"
    #: Where the weather service (services/weather) writes the weather it
    #: fetches and the planner reads it (wingtip.weather_store).
    weather_store: Path = DATA_DIR / "raw" / "weather"
    #: wingtip.notams' SQLite store of NOTAMs.
    notam_store: Path = DATA_DIR / "raw" / "faa_notams" / "notams.sqlite"
    #: SageMaker's channel folders and model folder, set only inside a Training Job (wingtip.pipeline).
    sm_channel_features: str | None = None
    sm_channel_labels: str | None = None
    sm_model_dir: str | None = None
    #: ADS-B Exchange's RapidAPI key; None turns that source off (wingtip.traffic).
    adsbx_rapidapi_key: str | None = None
    #: ADS-B Exchange requests a month at most, short of the plan's 10,000.
    adsbx_monthly_requests: int = 9000
    #: Where the month's ADS-B Exchange count is kept across restarts.
    adsbx_usage_file: Path = DATA_DIR / "raw" / "adsbx_usage.json"
    #: Whether adsb.fi's open data is asked for watched airplanes (0 in production until adsb.fi agrees).
    adsbfi_open_data: bool = True
    #: wingtip.traffic.store's SQLite store of the live feeds (the FAA's radar,
    #: the followed airplanes and their tracks, where the map looks): written by
    #: ingest (services/ingest) and the planner both, on the data folder they share.
    live_store: Path = DATA_DIR / "raw" / "live" / "live.sqlite"
    #: wingtip.live_reports' SQLite store of what SWIM says now of airports
    #: and airspace (wind shear alerts, flow programs, RVR, D-ATIS, special
    #: activity airspace, departures): written by ingest, read by the planner.
    reports_store: Path = DATA_DIR / "raw" / "live" / "reports.sqlite"

    # The planner (services/planner/app)
    #: The logging level for the planner.
    log_level: str = "INFO"
    #: Whether the FAA aircraft registry is downloaded and read (0 on a test stack).
    registry_refresh: bool = True
    #: Whether the cycle pack is built once a cycle (0 on a test stack).
    cycle_pack: bool = True
    #: Whether the chart's landmark cells are read at start (0 in CI).
    landmarks_build: bool = True
    #: Where the landmark cells are kept; None means beside the cycle's tiles.
    chart_landmarks_dir: Path | None = None
    #: Whether the planner starts the charts job when a cycle or its overlay tiles are due (0 in production, which schedules it).
    charts_auto_refresh: bool = True
    #: Whether the planner starts the crash-leads job (services/jobs/crash) every
    #: crash_leads_every_min through the dev-services sidecar: the Studio's crash drafts.
    crash_leads_auto: bool = True
    crash_leads_every_min: int = 30
    #: Whether the planner fetches a new edition of the FAA's NASR files and
    #: obstacle file on its own (0 on a test stack): on in production, whatever the charts do.
    faa_data_auto_refresh: bool = True
    #: The "HH:MM-HH:MM" window a cycle's render may start in, or blank for any time.
    charts_refresh_window: str = "01:00-06:00"
    #: How many render processes the charts job's run of a cycle gets (compose passes it to both).
    charts_refresh_workers: int = 1
    #: Whether the planner starts the charts job's `next` run, which draws the
    #: FAA's next chart cycle ahead of its effective date into a folder the
    #: map does not serve until that date (wingtip.chart_next): on for a
    #: machine of one's own, 0 in production (the AWS task draws each cycle)
    #: and in CI. Its own switch, not CHARTS_AUTO_REFRESH's.
    charts_cycle_auto: bool = True
    #: How many days before the next cycle's effective date its staging may start.
    charts_cycle_lead_days: int = 7
    #: How many minutes a live feed may read stale before the planner says
    #: so as an alert (app.feed_health): the console's row, a log warning
    #: and FEED_ALERT_WEBHOOK.
    feed_alert_after_min: int = 15
    #: Where an alert is POSTed as JSON when a feed has been stale that
    #: long, and again when it is back; None posts nothing (the log and
    #: the console still say it).
    feed_alert_webhook: str | None = None
    #: The weather service's health answer (services/weather, GET /), which
    #: says how fresh each product is by its own schedule; None reads only
    #: the weather store's fetch times.
    weather_url: str | None = "http://weather:8000"
    #: Whether the chart model reads tiles in the planner's own process pool.
    chart_reads_in_process: bool = True
    #: The OTLP collector traces go to; None sends none (app.tracing).
    otel_exporter_otlp_endpoint: str | None = None
    #: The service name on those traces.
    otel_service_name: str = "planner"
    #: The browser key for Google's Map Tiles API; blank offers no Google overlay.
    google_maps_api_key: str = ""
    #: The compose stack's dev-services sidecar; None everywhere else.
    dev_services_url: str | None = None
    #: The gateway's address (GATEWAY_URL), for the status page's health probe
    #: and the connector's records and signing keys (app.mcp).
    gateway_url: str = "http://gateway:8080"
    #: The gateway's own port for the services alone (GATEWAY_INTERNAL_URL,
    #: its app.internal.port), which no compose file publishes: the
    #: connector's records are asked there (app.mcp.records).
    gateway_internal_url: str = "http://gateway:8081"
    #: Who issues the connector's tokens: the gateway's public address
    #: (MCP_ISSUER); None serves no /mcp (app.mcp).
    mcp_issuer: str | None = None
    #: The connector's public address, the audience its tokens must carry
    #: (MCP_RESOURCE_URL); the issuer's /mcp when unset.
    mcp_resource_url: str | None = None
    #: The secret the gateway's /internal/mcp records ask for (MCP_INTERNAL_TOKEN).
    mcp_internal_token: str | None = None
    #: Tool calls one pilot's connector may make a minute and a day (app.mcp.limits).
    mcp_calls_per_minute: int = 30
    mcp_calls_per_day: int = 600

    read_switches = field_validator(
        "charts_fetch_for_tiles",
        "adsbfi_open_data",
        "registry_refresh",
        "cycle_pack",
        "landmarks_build",
        "charts_auto_refresh",
        "crash_leads_auto",
        "faa_data_auto_refresh",
        "chart_reads_in_process",
        "charts_cycle_auto",
        mode="before",
    )(_switch)

    @field_validator(
        "chart_tiles_url", "dev_services_url", "feed_alert_webhook", "weather_url", "mcp_resource_url", "mcp_issuer", mode="before"
    )
    @classmethod
    def read_base_url(cls, value):
        """A base address without its trailing slash, None where blank."""
        return _none_if_blank(value.rstrip("/") if isinstance(value, str) else value)

    read_blank_as_unset = field_validator("chart_tiles_bucket", "chart_landmarks_dir", "mcp_internal_token", mode="before")(_none_if_blank)

    @field_validator("chart_tiles_prefix", mode="before")
    @classmethod
    def read_prefix(cls, value):
        return value.strip("/") if isinstance(value, str) else value

    @field_validator("charts_refresh_window", "google_maps_api_key", mode="before")
    @classmethod
    def read_stripped(cls, value):
        return value.strip() if isinstance(value, str) else value


class SettingsError(ValueError):
    """A malformed environment variable, named as compose and infra write it."""


@functools.cache
def get_settings() -> Settings:
    """The environment, read and checked once. A malformed value (a word
    where a number goes) raises SettingsError naming the variable. Tests
    that change the environment clear the cache (get_settings.cache_clear())."""
    try:
        return Settings()
    except ValidationError as err:
        bad = "; ".join(f"{'_'.join(str(part) for part in e['loc']).upper()}={e.get('input')!r}: {e['msg']}" for e in err.errors())
        raise SettingsError(f"The environment has a malformed setting: {bad}") from None


# On AWS the tiles are not served by the planner at all: a refresh task
# publishes each cycle's pyramid to an S3 bucket behind CloudFront, and
# the map fetches tiles from there. CHART_TILES_URL is the CloudFront
# base (with the key prefix) the planner tells the browser about and
# reads the served cycle from; CHART_TILES_BUCKET is where the refresh
# publishes. Unset locally, where the planner serves its own tiles.
CHART_TILES_URL = get_settings().chart_tiles_url
CHART_TILES_BUCKET = get_settings().chart_tiles_bucket
CHART_TILES_PREFIX = get_settings().chart_tiles_prefix

# Where the downloaded rasters and the tiles rendered from them live --
# both under data/raw, which is not tracked. The whole country is 64
# sheets (about 5 GB with their overviews) and a quarter of a million
# tiles (about 3 GB): the `.nosync` suffix is what keeps iCloud Drive
# from syncing a folder, and this repository lives under a Desktop it
# syncs. Any other machine sees an ordinary folder name.
CHARTS_DIR = DATA_DIR / "raw" / "charts.nosync"
CHART_TILE_CACHE_DIR = DATA_DIR / "raw" / "chart_tiles.nosync"

# A sectional is printed at 1:500,000 (about 42 m per pixel in the
# FAA's raster), which is a web-mercator zoom of 12 at these latitudes;
# past that there is nothing more to see. It is the map's only base
# layer, so it is drawn all the way out to zoom 3, where the whole
# country fits a phone screen (59 degrees of longitude is 335 px
# there) and the chart is its own colours at a five-hundredth of its
# resolution: terrain tint, water, and the cities as yellow dots. A
# terminal area chart is 1:250,000, one zoom further in, and only
# worth drawing close up.
VFR_SECTIONAL_MAX_ZOOM = 12
VFR_SECTIONAL_MIN_ZOOM = 3
VFR_TAC_MAX_ZOOM = 13
VFR_TAC_MIN_ZOOM = 10
# The IFR enroute charts, as alternative base layers: the low-altitude
# sheets are 1:1,000,000 or so (65 m per pixel in the FAA's rasters,
# zoom 11), the high-altitude ones coarser still.
IFR_LOW_MAX_ZOOM = 11
IFR_LOW_MIN_ZOOM = 3
IFR_HIGH_MAX_ZOOM = 10
IFR_HIGH_MIN_ZOOM = 3
# The IFR area charts, the enroute charts' own terminal-area sheets
# (28 m per pixel, terminal-area scale), as an overlay over the IFR
# bases close in.
IFR_AREA_MAX_ZOOM = 13
IFR_AREA_MIN_ZOOM = 9
