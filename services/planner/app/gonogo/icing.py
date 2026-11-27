"""Under IFR, whether the flight is planned into icing
(apps/web/src/lib/icing.ts): a leg flown at or above the freezing level, where
the moisture icing needs is forecast -- cloud along the route, or an icing
AIRMET or SIGMET over it (the planner's `icing_possible`, wingtip.altitude) --
with the pilot reports of icing near the route (structural icing needs
visible moisture at or below 0 °C, the Aviation Weather Handbook,
FAA-H-8083-28B ch. 20, Icing). Under VFR the flight stays clear of cloud (14 CFR
91.155). Where the moisture is forecast but the freezing level is not known,
icing is said not checked rather than nothing (`icing_unchecked`). Freezing
rain and drizzle in a field's METAR or TAF ice an airplane clear of cloud
(AIM 7-1-20), so they are read on any flight, VFR or IFR
(`freezing_precip`). The rules are the engine's (brief's gonogo::icing,
the weather crate's freezing_precip), asked by name through
wingtip_native.call."""

from datetime import datetime

from wingtip import icing_forecast

from . import ask


def icing_at_altitude(selection: dict, flown_ft: list[float], pireps: list[dict]) -> dict | None:
    """The highest altitude flown at or above the freezing level, the
    level, whether the forecast is below freezing at its lowest altitude
    (`at_or_below`), and the pilot reports of icing near the route of any
    intensity but none; None where the flight is not planned into it."""
    found = ask(
        "gonogo_icing",
        selection={k: selection.get(k) for k in ("freezing_level_ft", "icing_possible", "freezing_level_at_or_below")},
        flown_ft=list(flown_ft),
        pireps=[{"icing": p.get("icing")} for p in pireps],
    )
    if found is not None:
        del found["line"]
    return found


def icing_line(icing: dict) -> str:
    """In a line, for the Go / No-Go."""
    return ask("gonogo_icing_line", icing=icing)


def icing_unchecked(selection: dict, flown_ft: list[float]) -> str | None:
    """Under IFR, "Icing not checked: freezing level not known" where icing
    is possible at the altitudes flown but the freezing level is not known
    (the engine's gonogo_icing_unchecked); None otherwise, and always None
    where icing_at_altitude found something."""
    return ask(
        "gonogo_icing_unchecked",
        selection={k: selection.get(k) for k in ("freezing_level_ft", "icing_possible", "freezing_level_at_or_below")},
        flown_ft=list(flown_ft),
    )


def forecast_icing(fixes: list[tuple[float, float]] | None, legs: list[dict], depart: datetime) -> tuple[str | None, bool]:
    """Under IFR, the forecast icing on each leg at the altitude it is
    flown, each leg read for the hour of its middle (wingtip.icing_forecast,
    the NWS's CIP and IFI; AIM 7-1-4), as the web's Brief asks
    /api/icing/route: its line (the engine's icing_forecast_route), and
    whether the forecast could not be had, which the Go / No-Go says
    unchecked (14 CFR 91.103) rather than nothing. Not asked, as the web
    does not ask it, until every leg is in with its time and its fixes."""
    if not legs or not fixes or len(fixes) != len(legs) + 1 or any(leg.get("ete_min") is None for leg in legs):
        return None, False
    try:
        found = icing_forecast.along(
            fixes,
            [leg["altitude_ft"] for leg in legs],
            [leg["ete_min"] for leg in legs],
            [leg.get("ground_min") or 0.0 for leg in legs],
            depart.timestamp(),
        )
    except icing_forecast.IcingForecastUnavailable:
        return None, True
    return found.get("line"), False


def freezing_precip(briefing: dict) -> str | None:
    """Freezing rain or drizzle (FZRA, FZDZ, any intensity) in the METAR of
    a field the route names or the TAF of a station along it, in a line
    (the engine's freezing_precip, AIM 7-1-20); None where none is."""
    fields: dict[str, dict] = {}
    for ident, metar in (briefing.get("metars") or {}).items():
        fields.setdefault(ident, {"ident": ident})["metar"] = (metar or {}).get("raw")
    for station in (briefing.get("forecast") or {}).get("stations") or []:
        fields.setdefault(station["icaoId"], {"ident": station["icaoId"]})["taf"] = station.get("raw")
    return ask("freezing_precip", fields=list(fields.values()))["line"]


def icing_words(*lines: str | None) -> str | None:
    """The Go / No-Go's one icing caution from its parts, in the order
    engine/README.md gives them -- icing under IFR, else that it was not
    checked, then freezing precipitation -- as sentences; None with none."""
    said = [line for line in lines if line]
    return ". ".join(said) or None
