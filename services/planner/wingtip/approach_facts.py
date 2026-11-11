"""What the FAA's CIFP says of an instrument approach besides its legs, for
the tags its fixes carry on the map with its plate (the engine's
`approach_fix_tags`, which works the figures out; this reads them in):

- its runway: the threshold's place and elevation and its threshold
  crossing height, from the CIFP's runway record (ARINC 424-18 4.1.10:
  the landing threshold elevation, 5.68, columns 67 to 71; the TCH, 5.67,
  columns 76 and 77), and its touchdown zone elevation from NASR
  (APT_RWY_END's TDZ_ELEV, wingtip.pattern), which the CIFP does not carry;
- the altitudes a final codes beside a fix's limits, its second altitude
  (columns 90 to 94) where its altitude description (5.29) says what it
  is: "G" or "H" the glide slope's at the final approach fix, "I" or "J"
  the glide slope's intercept at the final approach course fix, "V" the
  vertical path's at a step-down fix. KOSH's ILS RWY 36: POBER "H", at or
  above 2,700, the glide slope at 2,610 -- the plate's "GS 2,610'";
- the levels of service the approach authorises, from its final's
  continuation record of application "W" (ARINC 424-19 5.275 the name,
  5.276 "A" authorised): "LPV", "LNAV/VNAV", "LNAV" -- whether an RNAV
  approach has a glidepath at all.

The decision altitude and the MDA are not here: they are the plate's
minimums alone (the d-TPP), in no FAA data set this could read, and a
figure guessed from a plate's text would be worse than none.
"""

from __future__ import annotations

from datetime import date

from . import pattern, procedures

#: The altitude descriptions whose record carries a second altitude that
#: is the glide slope's or the vertical path's (ARINC 424-18 5.29).
CODED = "GHIJV"
#: The levels of service an RNAV (GPS) approach's final names (ARINC 424-19
#: 5.275): an RNP approach's continuation of the same application carries
#: its RNP values in the same columns instead, which are not levels.
LEVELS = ("LPV", "LP", "LNAV/VNAV", "LNAV")


def _levels(records: list, procedure: str) -> list:
    """The levels of service an approach's final authorises, in the
    CIFP's order: each a status ("A" authorised, "N" not) and a ten-letter
    name, after the record's application type "W" in column 40."""
    found: list = []
    for rec in records:
        col = lambda first, last: procedures._col(rec, first, last)  # noqa: E731
        if col(13, 13) != "F" or col(14, 19).strip() != procedure or col(39, 39) in "01" or col(40, 40) != "W":
            continue
        body = col(41, 123)
        for at in range(0, len(body) - 1, 11):
            status, name = body[at], body[at + 1 : at + 11].strip()
            if status == "A" and name in LEVELS and name not in found:
                found.append(name)
    return found


def _runway(records: list, ident: str, runway: str) -> dict | None:
    """The runway record's threshold, elevation and TCH, with NASR's
    touchdown zone elevation; None where the CIFP has no such runway."""
    for rec in records:
        if procedures._col(rec, 13, 13) != "G" or procedures._col(rec, 14, 18).strip() != runway:
            continue
        if not procedures._continuation(rec, 22):
            continue
        place = procedures._position(rec)
        elevation, tch = procedures._col(rec, 67, 71).strip(), procedures._col(rec, 76, 77).strip()
        if place is None or not elevation.lstrip("-").isdigit() or not tch.isdigit():
            return None
        return {
            "ident": runway,
            "lat": round(place[0], 6),
            "lon": round(place[1], 6),
            "threshold_ft": int(elevation),
            "tch_ft": int(tch),
            "tdze_ft": pattern.touchdown_zone_ft(ident, runway),
        }
    return None


def approach_facts(ident: str, procedure: str, on: date | None = None) -> dict | None:
    """{"runway", "coded", "levels"} for an approach at a field; None where
    the CIFP has no such approach."""
    path = procedures.cifp_path(on)
    airport = procedures._airport(ident, path)
    found = procedures._records(ident, path)
    procedure = procedure.strip().upper()
    legs = airport.legs.get(("F", procedure)) if airport else None
    if not legs or found is None:
        return None
    records = found[1]
    coded = [
        {"fix": leg.fix, "code": leg.altitude_code, "ft": leg.altitude2}
        for leg in sorted(legs, key=lambda leg: leg.seq)
        if not leg.transition and leg.altitude_code and leg.altitude_code in CODED and leg.altitude2 is not None and leg.fix
    ]
    runway = procedures._runway_of("approach", procedure)
    return {"runway": _runway(records, ident, f"RW{runway}") if runway else None, "coded": coded, "levels": _levels(records, procedure)}
