"""The live feeds' health: GET /api/status/feeds, and /api/status's feeds."""

from pydantic import BaseModel


class FeedState(BaseModel):
    """One live feed (wingtip.feed_health): a SWIM feed ingest reads
    ("swim") or a weather product ("weather"); its state -- "ok", "stale"
    or "off" (not set up) -- and why, its last message or fetch, since when
    it has been stale, and whether that is long enough to be an alert."""

    name: str
    kind: str
    what: str
    state: str
    detail: str | None = None
    last_at: str | None = None
    messages: int | None = None
    stale_since: str | None = None
    alerting: bool = False


class FeedHealth(BaseModel):
    """Every live feed as last checked (each minute), and after how many
    minutes stale a feed is an alert; `webhook` whether alerts are POSTed
    anywhere (FEED_ALERT_WEBHOOK)."""

    checked_at: str | None
    alert_after_min: int
    webhook: bool = False
    feeds: list[FeedState] = []
