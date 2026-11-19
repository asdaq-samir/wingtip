"""What changed between two readings of a flight's briefing, each change
a source with both readings (app.routers.words' changes; the gateway's
ChangeLines asks for them for a pilot's flight watch)."""

from .gonogo import ask as engine
from .gonogo.words import ceiling_and_visibility
from .schemas.common import Briefing, GAirmet, Hazard
from .schemas.words import WordsSource as Source
from .words_sources import gairmet_source, hazard_source, meets, tfr_source


def _category(ceiling_ft: float | None, visibility_sm: float | None, ceiling_unknown: bool = False) -> str | None:
    """The flight category of a ceiling and visibility, as the engine sets
    it from the AWC's lines (wingtip_engine::metar::flight_category_of, the
    one copy the web and the phones share); None with neither, or with a
    ceiling forecast with no height ("OVC///") the visibility does not
    settle (14 CFR 1.1: not known, not none)."""
    return engine("flight_category", ceiling_ft=ceiling_ft, visibility_sm=visibility_sm, ceiling_unknown=ceiling_unknown)


def _hazard_key(h: Hazard) -> str:
    return h.raw or f"{h.type} {h.hazard} {h.altitude_low_ft} {h.altitude_high_ft}"


def _gairmet_key(g: GAirmet) -> str:
    return f"{g.hazard} {g.severity} {g.due_to} {g.altitude_low_ft} {g.altitude_high_ft} {g.from_freezing_level}"


def briefing_changes(then: Briefing, now: Briefing) -> list[Source]:
    """What changed between two readings of a route's briefing, each
    change a source with both readings: a field whose METAR's flight
    category changed; a SIGMET/AIRMET or G-AIRMET new or gone; a TFR new;
    a field newly below VFR; a TAF station whose forecast for the
    flight's time there moved across a flight-category line (the AWC's
    VFR/MVFR/IFR/LIFR, the engine's flight_category). Empty where nothing
    did."""
    out: list[Source] = []
    for ident in dict.fromkeys([*now.metars, *then.metars]):
        a, b = then.metars.get(ident), now.metars.get(ident)
        was, is_ = a.flight_category if a else None, b.flight_category if b else None
        if was != is_:
            out.append(
                Source(
                    id=f"metar:{ident}",
                    label=f"{ident} METAR, {was or 'none'} to {is_ or 'none'}",
                    text=f"Was: {a.raw if a and a.raw else 'no METAR'}\nNow: {b.raw if b and b.raw else 'no METAR'}",
                )
            )
    then_hazards, now_hazards = {_hazard_key(h) for h in then.hazards}, {_hazard_key(h) for h in now.hazards}
    out += [hazard_source(h, i) for i, h in enumerate(now.hazards) if _hazard_key(h) not in then_hazards]
    out += [hazard_source(h, i, gone=True) for i, h in enumerate(then.hazards) if _hazard_key(h) not in now_hazards]
    then_g, now_g = {_gairmet_key(g) for g in then.gairmets}, {_gairmet_key(g) for g in now.gairmets}
    out += [gairmet_source(g, i) for i, g in enumerate(now.gairmets) if _gairmet_key(g) not in then_g]
    out += [gairmet_source(g, i, gone=True) for i, g in enumerate(then.gairmets) if _gairmet_key(g) not in now_g]
    then_tfrs = {t.notam_id for t in then.tfrs}
    out += [tfr_source(t.model_dump()) for t in now.tfrs if t.notam_id not in then_tfrs]
    then_below = {(f.ident, f.source) for f in then.fields_below_vfr}
    for f in now.fields_below_vfr:
        if (f.ident, f.source) not in then_below:
            out.append(
                Source(
                    id=f"below-vfr:{f.ident}",
                    label=f"{f.ident} newly below VFR",
                    text=f"{f.ident} is now below VFR where the flight meets it, by its {f.source}: "
                    f"{ceiling_and_visibility(f.ceiling_ft, f.visibility_sm)}. {meets(f.on_route)}",
                )
            )
    then_stations = {s.icaoId: s for s in then.forecast.stations}
    for s in now.forecast.stations:
        before = then_stations.get(s.icaoId)
        if before is None:
            continue
        # The forecast for the flight's time there where both readings
        # placed the station; else the worst over the flight.
        at = lambda x: (x.eta_ceiling_ft, x.eta_visibility_sm) if x.eta and before.eta else (x.ceiling_ft, x.visibility_sm)  # noqa: E731
        unknown = lambda x: x.eta_ceiling_unknown if x.eta and before.eta else x.ceiling_unknown  # noqa: E731
        was, is_ = _category(*at(before), unknown(before)), _category(*at(s), unknown(s))
        if was != is_:
            out.append(
                Source(
                    id=f"taf:{s.icaoId}",
                    label=f"{s.icaoId} TAF, {was or 'none'} to {is_ or 'none'}",
                    text=f"Was: {ceiling_and_visibility(*at(before))}\n{before.raw or ''}\n"
                    f"Now: {ceiling_and_visibility(*at(s))}\n{s.raw or ''}",
                )
            )
    return out


# --- The endpoints ------------------------------------------------------
