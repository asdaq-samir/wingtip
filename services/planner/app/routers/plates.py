"""An approach's plate on the map (wingtip.plates, wingtip.plate_page): where
its plan view and its whole page go, and their pictures."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from wingtip import plates, publications

from ..gateway import PUBLIC, SHARED
from ..router_basics import DIAGRAM_CACHE
from ..schemas.plates import PlateOverlay

router = APIRouter()

#: What the overlay answers of what plate_overlay keeps.
OVERLAY_KEYS = ("cycle", "name", "south", "west", "north", "east", "fixes", "circling", "page")


def _placed(ident: str, procedure: str) -> dict:
    """The plate placed, or 404."""
    found = plates.plate_overlay(ident, procedure)
    if found is None:
        raise HTTPException(404, f"No plate placed for {procedure.strip().upper()!r} at {ident.strip().upper()!r}.")
    return found


@router.get(
    "/api/airport/{ident}/procedures/{procedure}/plate",
    response_model=PlateOverlay,
    responses={
        404: {"description": "No plate for the approach, or its plate's fixes do not place it"},
        503: {"description": "The FAA's procedure file could not be had"},
    },
    openapi_extra=PUBLIC,
)
def airport_procedure_plate(ident: str, procedure: str) -> PlateOverlay:
    """An approach's plate placed on the map for the approach picked
    (wingtip.plates): where its plan view's picture goes, and its whole
    page's (`page`, wingtip.plate_page), made once a cycle from the FAA's
    d-TPP plate and its own georeference, and whether it publishes
    circling minimums. 404 where the field has no plate for it, the plate
    has no georeference, or the FAA cannot be reached."""
    try:
        found = _placed(ident, procedure)
    except RuntimeError as err:
        raise HTTPException(503, f"The FAA's procedure file could not be had: {err}") from err
    return {k: found.get(k) for k in OVERLAY_KEYS}


def _picture(cycle: str, ident: str, procedure: str, key: str) -> FileResponse:
    if cycle != publications.dtpp_cycle():
        raise HTTPException(404, f"Not the d-TPP cycle in force: {cycle}.")
    found = _placed(ident, procedure)
    if found.get(key) is None or not found[key].exists():
        raise HTTPException(404, f"No picture of the plate for {procedure.strip().upper()!r} at {ident.strip().upper()!r}.")
    return FileResponse(found[key], media_type="image/png", headers={"Cache-Control": DIAGRAM_CACHE})


@router.get(
    "/api/approach-plate/{cycle}/{ident}/{procedure}.png",
    response_class=FileResponse,
    responses={200: {"content": {"image/png": {}}}, 404: {"description": "No plate placed for it in that cycle"}},
    openapi_extra=SHARED,
)
def approach_plate(cycle: str, ident: str, procedure: str) -> FileResponse:
    """The plan view of an approach's plate placed on the map
    (`airport_procedure_plate`), as a picture: black on clear, north up,
    for the cycle in force."""
    return _picture(cycle, ident, procedure, "png")


@router.get(
    "/api/approach-plate-page/{cycle}/{ident}/{procedure}.png",
    response_class=FileResponse,
    responses={200: {"content": {"image/png": {}}}, 404: {"description": "No page placed for it in that cycle"}},
    openapi_extra=SHARED,
)
def approach_plate_page(cycle: str, ident: str, procedure: str) -> FileResponse:
    """An approach plate's whole page placed on the map
    (`airport_procedure_plate`'s `page`), as a picture: greyscale on solid
    white, drawn between the page's four corners, for the cycle in force."""
    return _picture(cycle, ident, procedure, "page_png")
