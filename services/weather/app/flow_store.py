"""Where the flow layer's pictures are kept (app.flow and its parts):
each a blob in the weather store named for its hour, its field and the
run or cycle that made it ("flow-2026111214-wind-060-c2026111212f02"),
so a picture's name, and the planner's address of it, changes only when
what it shows does, and the planner may tell browsers to keep it
(wingtip.weather_flow's immutable pictures).

Beside them, the wind and temperature at the levels as numbers, one
array a part and hour ("flowwinds-2026111214-awc-c2026111212f02", fields
x levels x rows x cols on the half-degree grid, float16: a tenth of a
knot or degree, far finer than the forecast), which the planner reads a
route's winds aloft from (wingtip.winds_aloft)."""

from __future__ import annotations

import re
from datetime import datetime

import numpy as np
from wingtip import weather_store

#: The numbers' arrays' names begin so; nothing else in the store does.
NUMBERS_PREFIX = "flowwinds-"


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


def store_numbers(valid: datetime, name: str, made_by: str, levels: list[dict], fields: dict[str, list[np.ndarray]]) -> dict:
    """A part's numbers stored, one array of its fields at its levels:
    {"array" (its name), "fields" (in the array's order), "levels" [{"id",
    "ft"}]}."""
    names = list(fields)
    stack = np.stack([np.stack(fields[f]) for f in names]).astype(np.float16)
    stored_as = f"{NUMBERS_PREFIX}{valid:%Y%m%d%H}-{name}-{made_by}"
    weather_store.write_array(stored_as, stack)
    return {"array": stored_as, "fields": names, "levels": levels}


def stored(part: dict) -> bool:
    """Whether every picture a held part lists, and its numbers, are still
    in the store."""
    numbers = part.get("numbers")
    if numbers and not weather_store.blob_exists(numbers["array"], ".npy"):
        return False
    return all(weather_store.blob_exists(n, ".png") for n in part.get("files", {}).values())


def made_by(blob: str) -> str:
    """The run tag a blob's name ends with (store's)."""
    return blob.rsplit("-", 1)[-1]
