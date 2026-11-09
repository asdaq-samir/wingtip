"""The in-flight copilot's data (wingtip.copilot): the fields round the
airplane with their METARs, the areas on the rest of the route and ITWS's
alerts at the destination, in one answer for the apps, which ask the
engine's copilot_watch with it and their own GPS. Its own schemas, here
beside the route, as the copilot is a part of its own."""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from wingtip import copilot

from ..emergency.schemas import EmergencyField
from ..gateway import PUBLIC

router = APIRouter()


class CopilotField(EmergencyField):
    """A landing field as the engine's best_fields reads it (the emergency
    assistant's), with whether NASR lists fuel sold there."""

    fuel: bool = False


class CopilotArea(BaseModel):
    """A TFR, a special-use area SFDPS has spoken of, or a convective
    SIGMET on the rest of the route, at a point the route meets it (a
    SIGMET's, inside its area): whether it is in force now, when it
    starts and ends (UNIX s)."""

    kind: str
    id: str | None = None
    name: str | None = None
    lat: float
    lon: float
    active: bool | None = None
    starts_s: float | None = None
    until_s: float | None = None


class CopilotItws(BaseModel):
    """An ITWS alert at the destination or the alternate (AIM 4-3-7)."""

    airport: str
    alert: str
    words: str


class CopilotAround(BaseModel):
    """What the copilot reads now; `unavailable` names a source ("tfr",
    "sua") that could not be read, `at` when this was gathered."""

    fields: list[CopilotField]
    areas: list[CopilotArea]
    itws: list[CopilotItws]
    unavailable: list[str]
    at: float


def _path(text: str) -> list[tuple[float, float]]:
    """The rest of the route, "lat,lon;lat,lon;...", at most 60 points."""
    if not text.strip():
        return []
    try:
        points = [(float(a), float(b)) for a, b in (p.split(",") for p in text.split(";") if p.strip())]
    except ValueError as err:
        raise HTTPException(422, "path is latitude,longitude pairs separated by semicolons.") from err
    if any(not (-90 <= la <= 90 and -180 <= lo <= 180) for la, lo in points):
        raise HTTPException(422, "path has a point off the globe.")
    return points[:60]


@router.get("/api/copilot/around", response_model=CopilotAround, openapi_extra=PUBLIC)
def copilot_around(
    lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180),
    dest: str = Query(min_length=2, max_length=7), alternate: str | None = Query(None, max_length=7),
    path: str = Query("", description="The rest of the route from the airplane, lat,lon;lat,lon"),
) -> CopilotAround:
    """The fields near the airplane and the destination with their
    weather, runway and fuel, the TFRs, active special-use areas and
    convective SIGMETs on the rest of the route, and ITWS's alerts at the
    destination and alternate: the inputs of the engine's copilot_watch,
    which the app asks with its own GPS. Nothing is judged here."""
    return CopilotAround(**copilot.around(lat, lon, dest.upper(), alternate.upper() if alternate else None, _path(path)))
