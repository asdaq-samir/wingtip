"""What wingtip.weather asks the engine of no product in the store: the
winds and temperatures aloft a plan flies in, which winds period a
departure takes, and the basic VFR minimums (wingtip.weather names each
of these too, so its callers ask it as before). The winds are the map's
grid (AWC's winds, the GFS's in their place) at a plan's time where its
timeline holds it, the GFS's FB stations by period past it --
wingtip.winds_aloft, by the key winds_aloft.winds_key_for gives (None,
now). The engine interpolates (winds.rs, aloft_grid.rs)."""

from .engine import ask as _ask


def temperatures_aloft(lat: float, lon: float, fcst_hr: str | None = None) -> list:
    """The forecast temperatures over a place, [(altitude_ft, temp_c)] from
    the lowest level up; empty where none is known."""
    from . import winds_aloft

    return winds_aloft.temperatures_aloft(lat, lon, fcst_hr)


def temperature_at(profile: list, altitude_ft: float) -> float | None:
    """The temperature at `altitude_ft` from a temperatures_aloft profile:
    the engine's (winds.rs temperature_at) -- interpolated between the
    levels either side, past the ends the nearest one's difference from a
    standard day kept. None for an empty profile."""
    return _ask("temperature_at", profile=[list(p) for p in profile], altitude_ft=altitude_ft)


def temperature_at_altitude(lat: float, lon: float, altitude_ft: float, fcst_hr: str | None = None) -> float | None:
    """The forecast temperature at `altitude_ft` over (lat, lon); None where
    there is none: a standard day then, assumed rather than known."""
    from . import winds_aloft

    return winds_aloft.temperature_at_altitude(lat, lon, altitude_ft, fcst_hr)


def winds_period(fcst_hr: str | None = None) -> dict | None:
    """Whose winds a plan flies and for when (winds_aloft.winds_period),
    for the screens to say: None where they cannot be had."""
    from . import winds_aloft

    return winds_aloft.winds_period(fcst_hr)


def wind_at_altitude(lat: float, lon: float, altitude_ft: float, fcst_hr: str | None = None) -> dict | None:
    """Wind (true direction/speed) at altitude_ft over (lat, lon),
    interpolated between the forecast's levels and hours; None where none
    is known -- callers treat that as "no wind data available," not
    "calm"."""
    from . import winds_aloft

    return winds_aloft.wind_at_altitude(lat, lon, altitude_ft, fcst_hr)


def forecast_hour(hours_ahead: float | None) -> str:
    """Which winds period ("06", "12", "24") fits a departure `hours_ahead`
    hours from now, where no period's window can be read to say: the
    engine's (winds.rs forecast_hour). None (no departure time) is now."""
    return _ask("forecast_hour", hours_ahead=hours_ahead)


# --- Go/no-go: the basic VFR weather minimums ---


def below_vfr_minimums(ceiling_ft: float | None, visibility_sm: float | None) -> bool:
    """Whether either figure is under 14 CFR 91.155(c), (d)'s basic VFR
    minimums, 1,000 ft and 3 sm in a surface area of controlled airspace:
    the engine's `below_vfr_minimums` (rules.rs's figures). A missing figure
    is not below anything: unknown is reported as unknown by the caller,
    not decided here. wingtip.altitude's go/no-go flag and the briefing's
    fields below VFR ask it."""
    return _ask("below_vfr_minimums", ceiling_ft=ceiling_ft, visibility_sm=visibility_sm)


def vfr_not_recommended_reasons(idents: list, metars: dict, forecast: dict) -> list[str]:
    """ "VFR flight not recommended" (AIM 7-1-5) as its reasons, in
    briefing order: the engine's (vfr_not_recommended_reasons) -- either
    end reporting IFR, LIFR or a ceiling of unknown height, then the
    forecast along the route under 14 CFR 91.155's basic minimums or of
    unknown height. `metars` is metar_for_idents()'s answer, `forecast`
    ceiling_visibility_along_route()'s. Empty when nothing warrants it."""
    return _ask("vfr_not_recommended_reasons", idents=list(idents), metars=metars, forecast=forecast)
