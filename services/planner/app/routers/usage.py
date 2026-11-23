"""Each finished day's calls by route (app.usage_days), for the gateway's
nightly rollup into Postgres: asked by the gateway alone, on the stack's
own network, never forwarded."""

from datetime import date

from fastapi import APIRouter, Query

from .. import usage_days
from ..gateway import INTERNAL_GATEWAY
from ..schemas.system import UsageDay, UsageDays

router = APIRouter()


@router.get("/api/usage/daily", response_model=UsageDays, openapi_extra=INTERNAL_GATEWAY)
def usage_daily(since: date = Query(description="The first UTC day wanted, YYYY-MM-DD")) -> UsageDays:
    """Every route's calls on each finished UTC day from `since` on, today
    left out until it is over: totals by route template, method and status,
    tied to no pilot (docs/privacy-inventory.md)."""
    return UsageDays(days=[UsageDay(**row) for row in usage_days.days(since)])
