"""The documents library (wingtip.library): the shelf, a document's PDF
and a CFR part's text, each in the edition kept, the edition in the
address so a browser, the CDN and the app's own offline copy keep it for
good."""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from wingtip import library

from ..gateway import gateway
from ..router_basics import DIAGRAM_CACHE, SHARED_CACHE
from ..schemas.library import CfrText, Library

router = APIRouter()


@router.get("/api/library", response_model=Library, openapi_extra=gateway("public", cache=True))
def library_shelf() -> JSONResponse:
    """Every document on the shelf, in its order: the FAA's books, the AIM,
    the circulars and the CFR parts, each with the edition kept and its
    date, or none yet where it has never been had."""
    body = Library(documents=library.shelf())
    return JSONResponse(body.model_dump(), headers={"Cache-Control": SHARED_CACHE})


def _file(doc: str, edition: str, kind: str):
    path = library.file_of(doc, edition)
    if path is None or not path.name.endswith(kind):
        raise HTTPException(404, f"No {doc} in edition {edition!r}: ask the shelf for the edition kept.")
    return path


@router.get(
    "/api/library/{doc}/{edition}.pdf",
    response_class=FileResponse,
    responses={
        200: {"content": {"application/pdf": {}}},
        206: {"description": "The byte range asked for (Range: bytes=a-b)", "content": {"application/pdf": {}}},
        404: {"description": "Not on the shelf, or not the edition kept"},
    },
    # Read by the app's reader a range at a time (pdf.js), so a handbook's
    # first page shows before its last megabyte comes.
    openapi_extra=gateway("public", cache=True, range=True, headers=("Content-Length", "Content-Range", "Accept-Ranges", "ETag")),
)
def library_pdf(doc: str, edition: str) -> FileResponse:
    """A document's PDF in the edition kept."""
    return FileResponse(_file(doc, edition, ".pdf"), media_type="application/pdf", headers={"Cache-Control": DIAGRAM_CACHE})


@router.get(
    "/api/library/{doc}/{edition}/text",
    response_model=CfrText,
    responses={404: {"description": "Not a CFR part on the shelf, or not the edition kept"}},
    openapi_extra=gateway("public", cache=True),
)
def library_text(doc: str, edition: str) -> JSONResponse:
    """A CFR part's text in the edition kept (the eCFR's issue date): its
    subparts and sections, each section's paragraphs."""
    body = json.loads(_file(doc, edition, ".json").read_text())
    return JSONResponse(body, headers={"Cache-Control": DIAGRAM_CACHE})
