"""Where an airport diagram's crop to its runways is kept, and whether it is
already known not to be had: the airport card asks for the crop
(/api/airport-diagram/{cycle}/runways/{ident}.png) only where it can be,
as KDLH's card logged a 404 at every opening (the web audit's WEB-41).
The crop itself is drawn by wingtip.publications."""

from datetime import date
from pathlib import Path


def runways_path(cache_dir: Path, url: str, cycle: str, ends: bool) -> Path:
    """The crop's file for the cycle: placed by the runway ends where they
    are known, else by the sheet's strokes alone, never standing in for the
    other (a wider margin since 2026-11-13)."""
    kind = "runways-wide" if ends else "runways-wide-noends"
    return cache_dir / "diagrams" / cycle / f"{Path(url).stem}-{kind}.png"


def runways_missing(ident: str, ends: bool, on: date | None = None) -> bool:
    """Whether the crop is already known not to be found on the diagram
    this cycle (its kept miss, `.none`). False where it has not been tried
    yet: the first card asks, and the miss is kept from then on."""
    from . import publications

    url = publications.airport_diagram_url(ident, on)
    return bool(url) and runways_path(publications.CACHE_DIR, url, publications.dtpp_cycle(on), ends).with_suffix(".none").exists()
