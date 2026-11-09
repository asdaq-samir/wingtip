"""The dry run played against the forecast (wingtip.forecast_run): the run's
points and fields in, what the airplane meets when it gets there out --
each point's forecast, each leg's worst category, each field's TAF at its
time, and the alerts under the minimums or into an advisory area. The
rule is the engine's (forecast_run)."""

from fastapi import APIRouter
from wingtip import forecast_run

from ..gateway import PUBLIC_READ_BY_POST
from ..schemas.forecast_run import ForecastRun, ForecastRunAsk

router = APIRouter()


@router.post("/api/forecast/run", response_model=ForecastRun, openapi_extra=PUBLIC_READ_BY_POST)
def forecast_dry_run(ask: ForecastRunAsk) -> ForecastRun:
    """The dry run against the forecast for the hours it flies: a product
    that cannot be had is named in `unavailable`, the rest still read."""
    played = forecast_run.play(
        [p.model_dump() for p in ask.track],
        [f.model_dump() for f in ask.fields],
        ask.rules,
        ask.minimums.model_dump() if ask.minimums else None,
    )
    return ForecastRun(**played)
