"""The shapes app.routers.system sends and takes, as Pydantic models."""

from pydantic import BaseModel

from ..chart_cycle.schemas import NextCycle, PyramidProgress
from ..feeds.schemas import FeedHealth
from .common import DataCycle, PickSummary


class ServiceStatus(BaseModel):
    up: bool
    detail: str | None = None


class Services(BaseModel):
    """The gateway and its database, probed from here -- its liveness and
    its readiness group, which includes the database -- rather than by
    the browser: a phone's probes queued behind its chart
    tiles on one HTTP/1.1 connection pool and timed out, and the
    console read "no answer" for a gateway that had just served it."""

    gateway: ServiceStatus | None = None
    db: ServiceStatus | None = None


class DataFile(BaseModel):
    name: str
    downloaded_at: str | None


class WeatherDataset(BaseModel):
    name: str
    fetched_at: str | None


class ModelSnapshot(BaseModel):
    model_type: str | None
    trained_at: str | None
    cv_mae: float | None
    held_out_mae: float | None
    n_labeled: int | None
    n_features: int


class ModelVersion(BaseModel):
    name: str
    model_type: str | None
    trained_at: str | None
    cv_mae: float | None


class ChartModelSnapshot(BaseModel):
    """The promoted chart model (wingtip.chartmodel), against what it has to
    beat on the ratings it held out: the palette's constants
    (`palette_held_out_mae`) and the training ratings' mean. The
    planner's checkpoints move onto the chart once it beats the
    palette."""

    model_type: str | None
    trained_at: str | None
    held_out_mae: float | None
    palette_held_out_mae: float | None
    dummy_held_out_mae: float | None
    n_labeled: int | None
    n_test: int | None


class ModelRegistry(BaseModel):
    current: ModelSnapshot | None
    versions: list[ModelVersion]
    chart: ChartModelSnapshot | None = None


class PipelineStage(BaseModel):
    """One stage of a training run (wingtip.pipeline.run): its name, as
    "chart_retrain", and "pending", "running", "success", "skipped" or
    "failed", with what it came to or why in `detail`."""

    name: str
    state: str
    detail: str | None = None


class PipelineRun(BaseModel):
    """The last training run, as it wrote itself down
    (model_registry.RUN_STATUS_PATH): "running", "success" or "failed",
    the stage under way, every stage, and for one that failed the first
    stage's error ("collect: RuntimeError: ...")."""

    run_id: str | None
    state: str | None
    stage: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    stages: list[PipelineStage] = []
    error: str | None = None


class TrainingReadiness(BaseModel):
    """Whether a retrain has enough to train the chart model on, asked
    before one is started (app.chart_model.readiness): the ratings on a
    detection the trainer would get (`usable`) against what it needs, how
    many of the `rated` are on a point the chart reader no longer finds
    (`off_detection`), and the routes whose chart is still being read,
    which cannot be counted yet. `message` says it in a sentence."""

    usable: int
    needed: int
    ready: bool
    rated: int
    off_detection: int
    reading: list[str]
    message: str


class PipelineStatus(BaseModel):
    """startable: this planner can start a training run -- the compose
    stack's dev-services sidecar answered and the run's container exists
    (`detail` says why not). `training`: whether the ratings are enough
    to retrain on, None where it could not be worked out."""

    startable: bool
    last_run: PipelineRun | None
    detail: str | None
    training: TrainingReadiness | None = None


class CorridorStatus(BaseModel):
    departure_ident: str
    destination_ident: str
    candidates: int | None
    features_built_at: str | None
    labels: PickSummary
    notes: int


class ChartsStatus(BaseModel):
    """`cycle` is the edition the map draws; `current_cycle` the one
    the FAA is on. They differ while a newer cycle is being fetched
    and rendered (`building`, `refresh_running`); the map switches
    once every tile of the new one is there."""

    cycle: str
    current_cycle: str
    # How many FAA chart zips of each kind are downloaded and ready to
    # draw, any cycle.
    prepared: dict[str, int]
    tiles_cached: int
    pyramid: dict[str, PyramidProgress] = {}
    building: dict[str, PyramidProgress] = {}
    refresh_running: bool = False
    # When the planner's own refresh may start a render ("HH:MM-HH:MM"
    # on its clock, blank for any time) and with how many processes.
    refresh_window: str = ""
    refresh_workers: int = 1
    # The next cycle, drawn before its date (app.chart_cycle); None where
    # it could not be worked out.
    next: "NextCycle | None" = None


class ChartRefreshStarted(BaseModel):
    started: bool
    current_cycle: str


class RecentError(BaseModel):
    """A failure the planner answered lately (app.errors): when (UNIX
    seconds), the call, its status and its words."""

    at: float
    method: str
    path: str
    status: int
    detail: str


class Status(BaseModel):
    checked_at: str
    services: Services
    faa_files: list[DataFile]
    weather: list[WeatherDataset]
    charts: ChartsStatus
    model: ModelRegistry
    pipeline: PipelineStatus
    corridors: list[CorridorStatus]
    # What the planner failed at lately, the newest first (app.errors).
    recent_errors: list[RecentError] = []
    # Each FAA data set's edition and whether it is in its cycle; the ones
    # out of date are logged too (wingtip.data_cycles).
    data_cycles: list[DataCycle] = []
    # The live feeds (app.feeds): SWIM's through ingest's beats, the
    # weather's through the weather service.
    feeds: "FeedHealth | None" = None


class RetrainStarted(BaseModel):
    """The training run's container as the sidecar left it: `started`
    false when it was running already."""

    started: bool
    state: str | None
