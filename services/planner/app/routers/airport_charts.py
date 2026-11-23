"""A field's pictures and charts: its photos and aerial, its airport
diagram, the FAA's charts in force by address, and its instrument
procedures (CIFP), each fetched once and kept for the edition or cycle
(app.routers.airports has the lists and the weather)."""

import logging

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import FileResponse
from wingtip import airport_photos, approach_facts, airports, pattern, procedures, publication_drawing, publication_pages, publications

from ..router_basics import DIAGRAM_CACHE
from ..schemas.airport_procedures import ProcedureDrawing, ProcedureList
from ..schemas.airport_services import AirportPhotos
from ..schemas.airports import ChartPages
from ..gateway import PUBLIC, SHARED

log = logging.getLogger(__name__)

router = APIRouter()


def _runway_ends(source: str) -> list[tuple[float, float]]:
    return [pos for r in airports.get_runways(source) if not r["closed"] for pos in (r.get("end_positions") or {}).values() if pos]


@router.get("/api/airport/{ident}/photos", response_model=AirportPhotos, openapi_extra=SHARED)
def airport_photos_of(ident: str, response: Response) -> dict:
    """The pictures an airport's card swipes through behind its diagram, at
    the owner's ask ("airport photos swipe behind the airport diagram
    thumbnail", 2026-10-23): its aerial (/api/airport-aerial, every US
    field's, from the USGS) and its Wikipedia article's photo where there
    is a free one (wingtip.airport_photos)."""
    place = airports.find_place(ident)
    if place is None:
        raise HTTPException(404, f"No US airport goes by {ident.strip().upper()!r}.")
    try:
        link = airports.wikipedia_link(place["source_ident"])
    except (OSError, ValueError):
        link = None
    photo = airport_photos.ground_photo(place["ident"], link)
    # A day in the browser: the article's photo changes in years.
    response.headers["Cache-Control"] = "public, max-age=86400"
    # Served from here, as the aerial is (/api/airport-photo): the page's
    # image policy does not reach Wikimedia, and a route kept for the air
    # keeps it.
    return {
        "aerial_url": f"/api/planner/airport-aerial/{place['ident']}.jpg",
        "photo": photo and {**photo, "url": f"/api/planner/airport-photo/{place['ident']}.jpg"},
    }


@router.get(
    "/api/airport-photo/{ident}.jpg",
    response_class=FileResponse,
    responses={
        200: {"content": {"image/jpeg": {}}},
        404: {"description": "No such field, or no free photo of it"},
        503: {"description": "Wikimedia could not be reached"},
    },
    openapi_extra=SHARED,
)
def airport_photo(ident: str) -> FileResponse:
    """The field's photo from the ground (`airport_photos_of`), fetched from
    Wikimedia Commons once and kept, a week in the browser."""
    place = airports.find_place(ident)
    if place is None:
        raise HTTPException(404, f"No US airport goes by {ident.strip().upper()!r}.")
    try:
        link = airports.wikipedia_link(place["source_ident"])
    except (OSError, ValueError):
        link = None
    photo = airport_photos.ground_photo(place["ident"], link)
    if photo is None:
        raise HTTPException(404, f"No free photo of {place['ident']}.")
    try:
        path = airport_photos.ground_photo_file(place["ident"], photo["url"])
    except airport_photos.PhotoUnavailable as err:
        raise HTTPException(503, str(err)) from err
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})


@router.get(
    "/api/airport-aerial/{ident}.jpg",
    response_class=FileResponse,
    responses={
        200: {"content": {"image/jpeg": {}}},
        404: {"description": "No such field"},
        503: {"description": "The USGS imagery could not be had"},
    },
    openapi_extra=SHARED,
)
def airport_aerial(ident: str) -> FileResponse:
    """The field's aerial photo from the USGS National Map's imagery
    (public domain), framed on its runways (wingtip.airport_photos.aerial):
    asked of the USGS once and kept, a week in the browser."""
    place = airports.find_place(ident)
    if place is None:
        raise HTTPException(404, f"No US airport goes by {ident.strip().upper()!r}.")
    try:
        path = airport_photos.aerial(place["ident"], place["lat"], place["lon"], _runway_ends(place["source_ident"]))
    except airport_photos.PhotoUnavailable as err:
        raise HTTPException(503, str(err)) from err
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})


@router.get(
    "/api/airport/{ident}/procedures",
    response_model=ProcedureList,
    responses={503: {"description": "The FAA's procedure file could not be had"}},
    openapi_extra=PUBLIC,
)
def airport_procedures(ident: str) -> ProcedureList:
    """The field's instrument procedures -- its approaches, arrivals and
    departures, with the transitions of each -- from the FAA's CIFP for
    the AIRAC cycle in force (wingtip.procedures), for the route's Procedures
    to offer. None for a field the CIFP has none for, as most small ones."""
    try:
        found = procedures.procedures_at(ident)
    except RuntimeError as err:
        raise HTTPException(503, f"The FAA's procedure file could not be had: {err}") from err
    if found:
        return found
    path = procedures.cifp_path()
    return {"airport": ident.strip().upper(), "cycle": procedures.cifp_cycle(path), "stale": procedures.cifp_stale(path), "procedures": []}


@router.get(
    "/api/airport/{ident}/procedures/{procedure}",
    response_model=ProcedureDrawing,
    responses={404: {"description": "No such procedure at the field"}, 503: {"description": "The FAA's procedure file could not be had"}},
    openapi_extra=PUBLIC,
)
def airport_procedure(ident: str, procedure: str, transition: str | None = None) -> ProcedureDrawing:
    """One of the field's procedures drawn for the map, with the
    transition picked (`transition`, one of its `transitions`; none for an
    approach from vectors): its lines, holds and fixes, each fix with the
    altitudes and speed it is crossed at (wingtip.procedures.procedure_drawing);
    an approach with the CIFP's own figures for its fixes' tags
    (`approach`, wingtip.approach_facts; the engine's approach_fix_tags)."""
    try:
        drawn = procedures.procedure_drawing(ident, procedure, transition)
    except RuntimeError as err:
        raise HTTPException(503, f"The FAA's procedure file could not be had: {err}") from err
    if drawn is None:
        raise HTTPException(404, f"No procedure {procedure.strip().upper()!r} at {ident.strip().upper()!r}.")
    if drawn["kind"] == "approach":
        drawn = {**drawn, "approach": approach_facts.approach_facts(ident, procedure)}
    return drawn


@router.get(
    "/api/airport-diagram/{cycle}/{ident}.png",
    response_class=FileResponse,
    responses={200: {"content": {"image/png": {}}}, 404: {"description": "No diagram for the field in that cycle"}},
    openapi_extra=SHARED,
)
def airport_diagram(cycle: str, ident: str) -> FileResponse:
    """The FAA's airport diagram for the field, from the d-TPP cycle in
    force (`airport_diagram_cycle` on its card), as a picture for the card
    to show and a finger to pinch in on: its PDF drawn once and kept for
    the cycle (wingtip.publications). 404 for a field with none -- most small
    ones -- for any cycle but the one in force, and while the FAA cannot
    be reached."""
    path = publication_drawing.airport_diagram_png(ident, cycle)
    if path is None:
        raise HTTPException(404, f"No airport diagram for {ident.strip().upper()!r} in d-TPP cycle {cycle}.")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": DIAGRAM_CACHE})


@router.get(
    "/api/airport-diagram/{cycle}/runways/{ident}.png",
    response_class=FileResponse,
    responses={200: {"content": {"image/png": {}}}, 404: {"description": "No diagram, or its runways not found on it"}},
    openapi_extra=SHARED,
)
def airport_diagram_runways(cycle: str, ident: str) -> FileResponse:
    """The airport diagram cropped to its runways, for the card's
    thumbnail: where the field's runway ends are (wingtip.pattern's, NASR's
    surveyed thresholds) placed on the diagram by its own latitude and
    longitude labels, else its runway-thick strokes (wingtip.publications).
    404 where it has none, or its runways cannot be found on it -- the
    card draws its own sketch then."""
    place = airports.find_place(ident)
    if place is None:
        raise HTTPException(404, f"No US airport goes by {ident.strip().upper()!r}.")
    runways = pattern.with_traffic(airports.get_runways(place["source_ident"]), place["ident"], place["lat"], place["lon"])
    ends = [(e["lat"], e["lon"]) for r in runways if not r["closed"] for e in r["runway_ends"] if e.get("lat") is not None]
    path = publication_drawing.airport_diagram_runways_png(place["ident"], cycle, ends)
    if path is None:
        raise HTTPException(404, f"No airport diagram's runways for {ident.strip().upper()!r} in d-TPP cycle {cycle}.")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": DIAGRAM_CACHE})


@router.get("/api/faa-chart", response_model=ChartPages, openapi_extra=SHARED)
def faa_chart(url: str, response: Response, airport: str | None = None) -> ChartPages:
    """The pages of one of the FAA's charts in force -- by its address on
    aeronav.faa.gov, as a card lists it (`procedures`, the Chart
    Supplement's) -- for the app to show them itself rather than leave for
    the FAA's site: every page of an approach or a departure, of one of
    the FAA's booklets (a region's takeoff minimums) the pages naming
    `airport`, of a Chart Supplement entry each of its pages. 404 for any
    other address; 502 while the FAA cannot be reached, which the edge
    does not keep as it keeps a 404."""
    try:
        pages = publication_pages.chart_pages(url, airport)
    except publications.FaaUnreachable:
        raise HTTPException(502, "The FAA could not be reached.") from None
    if pages is None:
        raise HTTPException(404, "Not one of the FAA's charts in force.")
    # The address names the chart's edition: the same answer for the whole of it.
    response.headers["Cache-Control"] = DIAGRAM_CACHE
    return {"pages": pages}


@router.get(
    "/api/faa-chart/page/{source}/{edition}/{pdf}/{page}.png",
    response_class=FileResponse,
    responses={
        200: {"content": {"image/png": {}}},
        404: {"description": "No such page in force"},
        502: {"description": "The FAA could not be reached"},
    },
    openapi_extra=SHARED,
)
def faa_chart_page(source: str, edition: str, pdf: str, page: int) -> FileResponse:
    """One page of one of the FAA's charts in force as a picture, drawn
    once and kept for its edition, as the airport diagram's is."""
    try:
        path = publication_pages.chart_page_png(source, edition, pdf, page)
    except publications.FaaUnreachable:
        raise HTTPException(502, "The FAA could not be reached.") from None
    if path is None:
        raise HTTPException(404, f"No page {page} of {pdf} in {source} {edition}.")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": DIAGRAM_CACHE})


@router.get(
    "/api/faa-chart/pdf/{source}/{edition}/{pdf}",
    response_class=Response,
    responses={
        200: {"content": {"application/pdf": {}}},
        404: {"description": "No such chart in force"},
        502: {"description": "The FAA could not be reached"},
    },
    openapi_extra=SHARED,
)
def faa_chart_pdf(source: str, edition: str, pdf: str) -> Response:
    """One of the FAA's charts in force as its PDF, kept for its edition,
    for the web's own-ship airport diagram, which reads the page's own
    latitude and longitude labels and hot spots (the engine's
    diagram_labels, diagram_hot_spot_labels) where the phones read the
    same PDF themselves."""
    try:
        data = publication_pages.chart_pdf(source, edition, pdf)
    except publications.FaaUnreachable:
        raise HTTPException(502, "The FAA could not be reached.") from None
    if data is None:
        raise HTTPException(404, f"No {pdf} in {source} {edition}.")
    return Response(data, media_type="application/pdf", headers={"Cache-Control": DIAGRAM_CACHE})
