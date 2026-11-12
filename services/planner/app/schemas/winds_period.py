"""Whose winds a plan flies (the totals' `winds`): its own file, as
plan.py is past its size."""

from typing import Literal

from pydantic import BaseModel


class WindsPeriod(BaseModel):
    """Whose winds and temperatures aloft a plan flies, and for when (read
    by services/weather, from wingtip.weather_store; wingtip.winds_aloft):
    where the map's timeline holds the departure, the Aviation Weather
    Center's GFA winds the map draws (or NOAA's GFS in their place once
    AWC's are past their margin), read at each leg's time, `use_from` to
    `use_to` the grid's hours round the departure; past it, the GFS's at
    the old FB stations by period, for use `use_from` to `use_to` (FAA
    Order JO 7110.10 TBL 9-3-1's windows round the forecast hour). ISO
    UTC. `run` AWC's cycle or the GFS's run, `forecast_hour` the hour of
    it read; `label` the nav log's words ("AWC winds, 12Z"); `source`
    "awc", "gfs" (in AWC's place) or "gfs-stations"; `fallback` where
    NOAA's stand in for AWC's; `stale` where the run is past its source's
    cadence and margin, as the map's legend says it; `modelled` where they
    are model output said as such (NOAA's GFS)."""

    valid_at: str
    use_from: str
    use_to: str
    modelled: bool = False
    run: str | None = None
    forecast_hour: int | None = None
    label: str | None = None
    source: Literal["awc", "gfs", "gfs-stations"] | None = None
    fallback: bool = False
    stale: bool = False
