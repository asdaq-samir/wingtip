"""What the plan's endpoints and the nav log's stream share as a request's
dependencies (app.routers.plan, app.routers.navlog)."""

from typing import Annotated

from fastapi import Query

from . import chart_model


async def read_ahead(
    ahead: Annotated[
        bool,
        Query(
            description="Asked ahead of the pilot -- a Recent or Saved route planned while "
            "the page is idle: its chart reads wait behind the route on screen's"
        ),
    ] = False,
) -> None:
    """The request's chart reads as reads ahead (chart_model.READ_AHEAD).
    Async, so it is set in the request's own context, which the endpoint's
    thread and a streamed body's are copied from."""
    chart_model.READ_AHEAD.set(ahead)
