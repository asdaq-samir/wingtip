"""The next chart cycle's line in /api/status (charts.next)."""

from pydantic import BaseModel

from ..schemas.system import PyramidProgress


class NextCycle(BaseModel):
    """The FAA's next chart cycle, staged ahead of its date by the charts
    job's `next` run (wingtip.chart_next): its folder name and effective
    date, the day staging may start (`lead_days` before), whether the
    planner starts it (CHARTS_CYCLE_AUTO), and what the job last said --
    `state` one of waiting, not_published, no_turn, staging, staged,
    failed, swapped -- with when, and how far its pyramid has got."""

    cycle: str
    effective: str
    stage_from: str
    lead_days: int
    auto: bool
    state: str
    detail: str | None = None
    updated_at: str | None = None
    progress: dict[str, PyramidProgress] = {}
