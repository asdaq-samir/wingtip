"""The charts' lines in /api/status: each kind's tile pyramid (charts.pyramid,
charts.building) and the next chart cycle (charts.next). Kept here, apart
from app.schemas.system, which imports them: system importing this module
and this one importing system's pyramid models made each fail to import
first on its own (a circular import)."""

from pydantic import BaseModel


class PyramidPass(BaseModel):
    """A pass of the charts job's `pyramid` under way: sheets done of
    the sheets it set out to render, and the one it is on."""

    started_at: str
    done: int
    total: int
    current: str | None


class PyramidProgress(BaseModel):
    """One kind of chart's tile pyramid for a cycle. What finished passes
    have left -- the sheets rendered, when the last finished, the tiles
    written -- and the pass under way, if any. `complete` is every sheet
    the FAA publishes of the kind rendered; `missing` names the rest."""

    kind: str
    zooms: list[int]
    sheets: list[str]
    finished_at: str | None
    tiles: int
    current_pass: PyramidPass | None = None
    complete: bool
    missing: list[str] = []


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
