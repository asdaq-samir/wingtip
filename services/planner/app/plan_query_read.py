"""The parts of a plan's query read one at a time (PlanQuery's): a
point and a figure, a point's visit, a list of figures by point and the
runways picked, each a 422 where it is not one."""

import re

from fastapi import HTTPException
from wingtip import fixes
from wingtip.engine import ask as engine


def point_figure(part: str) -> bool:
    """Whether `part` is a point of the route and a figure, "VPBNG:4500":
    an ident, or the pilot's own point off a fix, "VPBNG/090/30" or packed
    "DLH090030", by the engine's form of one (wingtip_engine::route::points,
    which the web app's lib/identSchema asks too, either case here) -- as the
    saved flight's SaveFlightRequest.POINT takes it, where an altitude set
    on such a point was a 422 for the whole log -- and up to five figures."""
    ident, _, figure = part.partition(":")
    return ident.isascii() and engine("point_kind", text=ident.upper()) is not None and re.fullmatch(r"\d{1,5}", figure) is not None


def visit_of(point: str) -> tuple[str, str | None]:
    """ "VPBNG@2" as ("VPBNG", "@2"); a bare ident's visit "" (every visit),
    None for one that is not a count from 1 (wingtip.own_altitude)."""
    ident, at, visit = point.partition("@")
    if not at:
        return ident, ""
    return ident, f"@{int(visit)}" if re.fullmatch(r"[1-9]\d{0,2}", visit) else None


def figures_by_ident(text: str, most: float, not_one: str) -> dict[str, float]:
    """A list of "IDENT:FIGURE" by the point's ident (point_key); a 422 for
    a part that is not one or is over `most`."""
    out = {}
    for part in filter(None, (p.strip() for p in text.split(","))):
        ident, _, figure = part.partition(":")
        if not point_figure(part) or not 0 <= float(figure) <= most:
            raise HTTPException(422, f"{part!r} {not_one}")
        out[point_key(ident)] = float(figure)
    return out


def point_key(ident: str) -> str:
    """A point's ident as the route has it (Route.idents): a point off a
    fix in its one written form (wingtip.fixes.frd_ident), packed or not."""
    parts = fixes.parse_frd(ident)
    return fixes.frd_ident(*parts) if parts else ident.upper()


def runway_picks(text: str, not_one: str) -> dict[str, str]:
    """The runways picked at fields, "KSTL:30R,KMSN:36", by the field's FAA
    ident (_bare_field), as the engine reads them
    (wingtip_engine::route::picks); a 422 for one that is not "IDENT:RUNWAY",
    `not_one` saying what it is not."""
    out = {}
    for read in engine("runways_read", text=text):
        if read["pick"] is None:
            raise HTTPException(422, f"{read['part']!r} {not_one}")
        out[read["pick"]["field"]] = read["pick"]["runway"]
    return out
