"""Where the flow layer's pictures are kept (app.flow and its parts):
each a blob in the weather store named for its hour, its field and the
run or cycle that made it ("flow-2026111214-wind-060-c2026111212f02"),
so a picture's name, and the planner's address of it, changes only when
what it shows does, and the planner may tell browsers to keep it
(wingtip.weather_flow's immutable pictures)."""

from __future__ import annotations

import re
from datetime import datetime

from wingtip import weather_store


def tag(run: str, step: int, also: str | None = None) -> str:
    """A short, address-safe name of the run (ISO) and forecast hour that
    made a picture, and of a second run blended into it."""
    digits = re.sub(r"\D", "", run)[:10]
    out = f"c{digits}f{int(step):02d}"
    if also:
        out += "h" + re.sub(r"\D", "", also)[:10]
    return out


def store(valid: datetime, name: str, made_by: str, body: bytes) -> str:
    """A picture stored; its blob's name."""
    stored_as = f"flow-{valid:%Y%m%d%H}-{name}-{made_by}"
    weather_store.write_blob(stored_as, body, ".png")
    return stored_as


def stored(part: dict) -> bool:
    """Whether every picture a held part lists is still in the store."""
    return all(weather_store.blob_exists(n, ".png") for n in part.get("files", {}).values())


def made_by(blob: str) -> str:
    """The run tag a blob's name ends with (store's)."""
    return blob.rsplit("-", 1)[-1]
