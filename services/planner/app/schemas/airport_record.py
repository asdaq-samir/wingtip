"""What NASR says of a field's own record, on its card (AirportPlace): who
may use it is AirportPin's `private` and `military`; this is how far its
figures are to be trusted and the identifiers the engine's rules read
(wingtip.field_use, from APT_BASE.csv)."""

from typing import Literal

from pydantic import BaseModel


class AirportRecord(BaseModel):
    #: "owner-reported" where NASR's INSPECT_METHOD_CODE is 1 or 2 (the
    #: 5010-1 and 5010-2 mailouts: the owner's figures, never inspected),
    #: "inspected" where it is F, S or C; None where NASR gives none. The
    #: engine's airport_data_words words it ("Owner-reported, last updated
    #: Aug 2023").
    data_source: Literal["inspected", "owner-reported"] | None = None
    #: NASR's LAST_INFO_RESPONSE, else LAST_INSPECTION, YYYY-MM-DD.
    info_date: str | None = None
    #: NASR's ICAO_ID, "" where it lists none: the engine's filed_zzzz
    #: files ZZZZ for such a field (AIM Appendix 4). None where the field
    #: is not in NASR's file.
    icao_id: str | None = None
    #: NASR's NOTAM_ID, "" where it lists none: the engine's
    #: airport_notams_none then says none are issued for a private field.
    notam_id: str | None = None
