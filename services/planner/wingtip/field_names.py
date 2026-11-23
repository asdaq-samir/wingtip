"""Whether idents name one field, for the gateway's lessons (a student's
flight that landed at the field of the approach they were set: "KBUR" in
the procedures, "BUR" in the flight). Each ident's names are the engine's
field_names, given NASR's own record of it (APT_BASE.csv's ARPT_ID and
ICAO_ID): two idents are one field when their names meet. NASR's ICAO_ID
is what names Alaska's, Hawaii's and the territories' fields in ICAO form
(FAA JO 7350.9GG 4-1: Anchorage is ANC and PANC), which no K rule finds."""

from __future__ import annotations

from . import nasr_fields
from .airport_tables import DEFAULT_CACHE_PATH
from .engine import ask as engine


def names_of(ident: str) -> set[str]:
    """Every name the field that goes by `ident` may be filed under: by its
    NASR record where NASR lists it (its FAA ident and ICAO_ID), else by the
    ident alone."""
    record = nasr_fields.of_ident(ident, DEFAULT_CACHE_PATH)
    if record is None:
        return set(engine("field_names", ident=ident))
    return set(engine("field_names", ident=record["faa_id"], icao_id=record["icao_id"]))


def same_field(field: str, idents: list[str]) -> list[bool]:
    """For each of `idents`, whether it names `field`, in the order given;
    a blank ident names none."""
    wanted = names_of(field) if field.strip() else set()
    return [bool(ident.strip()) and bool(wanted & names_of(ident)) for ident in idents]
