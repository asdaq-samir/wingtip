"""GET /api/status/feeds: each live feed's last message or fetch and
whether it is stale (app.feeds.watch, wingtip.feed_health)."""
from fastapi import APIRouter

from ..feeds import watch
from ..feeds.schemas import FeedHealth

router = APIRouter()


@router.get("/api/status/feeds", response_model=FeedHealth)
def feeds() -> FeedHealth:
    """SWIM's STDDS, FNS, TFMS, ITWS and SFDPS from ingest's beats, each
    weather product from the weather service, and which have been stale
    for FEED_ALERT_AFTER_MIN, as checked each minute. On its own for
    anything that polls on the stack's network (the gateway's mail, one
    day), and in /api/status for the console."""
    return FeedHealth(**watch.snapshot())
