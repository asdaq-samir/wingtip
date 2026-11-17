"""The readings in words' sources: the planner's figures -- a flight, its
NOTAMs and TFRs, its briefing, a Go / No-Go record, a flown flight's
debrief -- each put as a line a sentence can cite and a pilot can read
raw (app.routers.words answers with them; the ids they carry are listed
there)."""

import json
import time
from datetime import datetime, timezone


from . import exposure
from .figures.schemas import Debrief, DebriefTolerances
from .gonogo.words import WEATHER_SOURCE_LABEL, alt_ft, ceiling_and_visibility, gairmet_title, num, one, sigmet_hazard
from .schemas.common import Briefing, ForecastStation, GAirmet, Hazard, OnRoute
from .schemas.words import WordsSource as Source

#: Where the briefing reports what it could not check, by source name
#: (Briefing.weather_unavailable).
_UNCHECKED_ID = "unchecked"


def departure_s(depart: datetime | None) -> float:
    return time.time() if depart is None else (depart if depart.tzinfo else depart.replace(tzinfo=timezone.utc)).timestamp()


def flight_source(dep: str, dest: str, stops: list[str], start: float | None = None, ete_min: float | None = None) -> Source:
    """The flight itself, for a sentence about it to rest on."""
    way = " via " + ", ".join(stops) if stops else ""
    lines = [f"From {dep} to {dest}{way}."]
    if start is not None:
        lines.append(f"Leaving {exposure.iso(start)}.")
    if ete_min is not None:
        lines.append(f"{num(one(ete_min))} min planned in the air.")
    return Source(id="flight:route", label="The flight", text=" ".join(lines))


def meets(on: OnRoute | None) -> str:
    """Where and when the flight meets a hazard, from the briefing's own
    placing of it (app.exposure)."""
    if on is None:
        return ""
    text = f"The flight meets it from {num(on.from_nm)} to {num(on.to_nm)} nm along the route"
    if on.enter and on.leave:
        text += f", there {on.enter} to {on.leave}"
    if on.valid_from or on.valid_to:
        text += f"; it is valid {_span(on.valid_from, on.valid_to)}"
    when = {"during": "while it is in force", "before": "before it comes into force", "after": "after it has ended"}
    if on.when:
        text += f"; the airplane is there {when[on.when]}"
    return text + "."


def _span(starts: str | None, ends: str | None, capital: bool = False) -> str:
    """ "from 2026-10-01T12:00:00Z to 2026-10-02T12:00:00Z", or ", until
    further notice" where it has no end; "From" at the start of a line."""
    return f"{'From' if capital else 'from'} {starts or 'now'}" + (f" to {ends}" if ends else ", until further notice")


def _altitudes(low: float | None, high: float | None) -> str:
    if low is None and high is None:
        return ""
    return f"From {alt_ft(low) + ' ft' if low is not None else 'the surface'} to {alt_ft(high) + ' ft' if high is not None else 'above'}."


def notam_source(n: dict) -> Source:
    """A NOTAM as the FAA's feed gave it (wingtip.notams.at_fields), with its
    times in ISO beside the form a briefing reads."""
    when = _span(n.get("starts"), n.get("ends"), capital=True)
    if n.get("estimated"):
        when += " (estimated)"
    if n.get("schedule"):
        when += f"; schedule {n['schedule']}"
    return Source(id=f"notam:{n['id']}", label=f"NOTAM {n['id']}", text=f"{n.get('raw') or n.get('text') or ''}\n{when}.")


def tfr_source(t: dict) -> Source:
    """A TFR as wingtip.tfr reads its NOTAM and places it on the route."""
    lines = [f"TFR {t['notam_id']}: {t.get('title') or 'no title'}."]
    kind = ", ".join(x for x in (t.get("kind"), t.get("purpose")) if x)
    if kind:
        lines.append(kind + ".")
    if t.get("rule"):
        lines.append(f"Rule: {t['rule']}.")
    lines.append(_span(t.get("effective"), t.get("expires"), capital=True) + ".")
    if t.get("floor_ft") is not None or t.get("ceiling_ft") is not None:
        floor = f"{alt_ft(t['floor_ft'])} ft {t.get('floor_ref') or ''}".strip() if t.get("floor_ft") is not None else "the surface"
        top = f"{alt_ft(t['ceiling_ft'])} ft {t.get('ceiling_ref') or ''}".strip() if t.get("ceiling_ft") is not None else "above"
        lines.append(f"From {floor} to {top}.")
    if t.get("along_track_nm") is not None:
        through = "goes through it" if t.get("crosses") else "passes near it"
        lines.append(f"{num(t['along_track_nm'])} nm along the route; the route {through}.")
    if t.get("active_now"):
        lines.append("In force now.")
    on = t.get("on_route")
    if on:
        lines.append(meets(OnRoute.model_validate(on)))
    return Source(id=f"tfr:{t['notam_id']}", label=f"TFR {t['notam_id']}", text=" ".join(lines))


def hazard_source(h: Hazard, i: int, gone: bool = False) -> Source:
    kind = h.type or "SIGMET"
    what = sigmet_hazard(h.hazard, kind)
    text = " ".join(x for x in (h.raw or f"{kind}: {what}.", _altitudes(h.altitude_low_ft, h.altitude_high_ft), meets(h.on_route)) if x)
    return Source(id=f"hazard{'-gone' if gone else ''}:{i}", label=f"{'Gone: ' if gone else ''}{kind}, {what}", text=text)


def gairmet_source(g: GAirmet, i: int, gone: bool = False) -> Source:
    # gairmet_title reads the Go / No-Go's dict, so the model is dumped
    # for it (a live briefing's first reading raised on the model).
    title = gairmet_title(g.model_dump())
    lines = [f"G-AIRMET: {title}."]
    if g.due_to:
        lines.append(f"Due to {g.due_to}.")
    # As the web's gairmetAltitudes writes them: AWC gives an IFR G-AIRMET
    # a top of -1, which is no top, and such a one has no altitude line.
    top = f"{alt_ft(g.altitude_high_ft)} ft" if g.altitude_high_ft is not None and g.altitude_high_ft > 0 else None
    low = "the freezing level" if g.from_freezing_level else (f"{alt_ft(g.altitude_low_ft)} ft" if g.altitude_low_ft is not None else None)
    if top:
        lines.append(f"From {low or 'the surface'} to {top}.")
    elif g.from_freezing_level:
        lines.append("From the freezing level.")
    if g.valid_at:
        lines.append(f"Valid at {g.valid_at}.")
    if g.on_route:
        lines.append(meets(g.on_route))
    label = f"{'Gone: ' if gone else ''}G-AIRMET, {title}"
    return Source(id=f"gairmet{'-gone' if gone else ''}:{i}", label=label, text=" ".join(lines))


def _metar_source(ident: str, metar) -> Source:
    if metar is None or not metar.raw:
        return Source(id=f"metar:{ident}", label=f"{ident} METAR", text=f"No METAR reported for {ident}.")
    about = f"{metar.flight_category or 'no category'}: {ceiling_and_visibility(metar.ceiling_ft, metar.visibility_sm)}"
    return Source(id=f"metar:{ident}", label=f"{ident} METAR, {metar.flight_category or 'no category'}", text=f"{metar.raw}\n{about}.")


def _taf_source(s: ForecastStation) -> Source:
    lines = []
    if s.along_track_nm is not None:
        lines.append(f"{num(s.along_track_nm)} nm along the route" + (f", the flight there {s.eta}" if s.eta else "") + ".")
    if s.eta:
        lines.append(f"Forecast for then: {ceiling_and_visibility(s.eta_ceiling_ft, s.eta_visibility_sm)}.")
    lines.append(f"Worst over the flight: {ceiling_and_visibility(s.ceiling_ft, s.visibility_sm)}.")
    if s.raw:
        lines.append(s.raw)
    return Source(id=f"taf:{s.icaoId}", label=f"{s.icaoId} TAF", text="\n".join(lines))


def briefing_sources(b: Briefing) -> list[Source]:
    """Every figure of a briefing a sentence can rest on, in briefing
    order: what cannot be checked, the reasons not to go VFR, the fields
    below VFR, each field's METAR, each TAF station at the flight's time
    there, the hazards, the G-AIRMETs, the pilot reports and the TFRs."""
    out: list[Source] = []
    if b.weather_unavailable:
        names = ", ".join(WEATHER_SOURCE_LABEL.get(w, w) for w in b.weather_unavailable)
        out.append(Source(id=_UNCHECKED_ID, label="Not checked", text=f"Could not be checked, the source did not answer: {names}."))
    if b.vfr_not_recommended:
        out.append(
            Source(
                id="vfr-not-recommended",
                label="VFR flight not recommended",
                text="VFR flight not recommended (AIM 7-1-5): " + "; ".join(b.vfr_not_recommended) + ".",
            )
        )
    for f in b.fields_below_vfr:
        out.append(
            Source(
                id=f"below-vfr:{f.ident}",
                label=f"{f.ident} below VFR",
                text=f"{f.ident} is below VFR where the flight meets it, by its {f.source}"
                f"{' (' + f.flight_category + ')' if f.flight_category else ''}: "
                f"{ceiling_and_visibility(f.ceiling_ft, f.visibility_sm)}. {meets(f.on_route)}",
            )
        )
    out += [_metar_source(ident, m) for ident, m in b.metars.items()]
    out += [_taf_source(s) for s in b.forecast.stations]
    out += [hazard_source(h, i) for i, h in enumerate(b.hazards)]
    out += [gairmet_source(g, i) for i, g in enumerate(b.gairmets)]
    for i, p in enumerate(b.pireps):
        lines = [p.raw or "Pilot report."]
        if p.urgent:
            lines.append("Urgent.")
        if p.on_route:
            lines.append(meets(p.on_route))
        out.append(
            Source(
                id=f"pirep:{i}",
                label="Pilot report" + (f" at {alt_ft(p.altitude_ft)} ft" if p.altitude_ft is not None else ""),
                text=" ".join(lines),
            )
        )
    out += [tfr_source(t.model_dump()) for t in b.tfrs]
    return out


def record_lines(record: dict) -> str:
    """A client's free-form record as lines, a nested value as JSON."""
    return "\n".join(f"{k}: {v if isinstance(v, (str, int, float, bool)) or v is None else json.dumps(v)}" for k, v in record.items())


def _z(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%H%MZ")


def _off(ft: float | None, unit: str, up: str, down: str) -> str:
    if ft is None:
        return ""
    return f"{alt_ft(abs(ft)) if unit == 'ft' else num(one(abs(ft)))} {unit} {up if ft > 0 else down}"


def debrief_sources(d: Debrief, t: DebriefTolerances) -> list[Source]:
    """Each figure of the debrief as a line: the time in the air, each
    leg's altitude and course held, each checkpoint's time, each pattern
    entry, the notes, and the tolerances they are marked against."""
    planned = f" against {num(one(d.planned_min))} min planned" if d.planned_min is not None else ""
    out = [
        Source(
            id="time",
            label="Time in the air",
            text=f"Took off {_z(d.takeoff)}, landed {_z(d.landing)}: {num(one(d.flown_min))} min in the air{planned}.",
        )
    ]
    for i, leg in enumerate(d.legs):
        parts = [f"{leg.from_} to {leg.to}:"]
        if leg.planned_alt_ft is not None and leg.altitude_within is not None:
            worst = f", furthest off {_off(leg.worst_alt_ft, 'ft', 'high', 'low')}" if leg.worst_alt_ft is not None else ""
            parts.append(
                f"altitude within {num(t.altitude_ft)} ft of {alt_ft(leg.planned_alt_ft)} ft "
                f"for {round(leg.altitude_within * 100)}% of the cruise{worst};"
            )
        else:
            parts.append("altitude not graded;")
        if leg.course_deg is not None and leg.course_within is not None:
            off = f", furthest off the line {_off(leg.worst_off_nm, 'nm', 'right', 'left')}" if leg.worst_off_nm is not None else ""
            parts.append(
                f"course {num(leg.course_deg)}° held within {num(t.course_deg)}° for {round(leg.course_within * 100)}% of the way{off};"
            )
        else:
            parts.append("course not graded;")
        parts.append("within tolerance." if leg.ok else "outside tolerance.")
        out.append(Source(id=f"leg:{i}", label=f"Leg {leg.from_} to {leg.to}", text=" ".join(parts)))
    for i, p in enumerate(d.passes):
        parts = [f"{p.name} ({p.category}){', landed at' if p.landed else ''}:"]
        if p.due_min is not None:
            parts.append(f"due {num(one(p.due_min))} min after takeoff;")
        if p.passed_min is not None:
            parts.append(f"{'reached' if p.landed else 'passed'} at {num(one(p.passed_min))} min;")
        else:
            parts.append("never reached;")
        if p.late_min is not None:
            parts.append(f"{num(one(abs(p.late_min)))} min {'late' if p.late_min > 0 else 'early'};")
        if p.closest_nm is not None:
            parts.append(f"closest {num(one(p.closest_nm))} nm;")
        parts.append("within tolerance." if p.ok else "outside tolerance." if p.ok is False else "time not known.")
        out.append(Source(id=f"pass:{i}", label=f"Checkpoint {p.name}", text=" ".join(parts)))
    for p in d.patterns:
        out.append(
            Source(
                id=f"pattern:{p.ident}",
                label=f"Pattern at {p.ident}",
                text=f"{p.ident}: {alt_ft(p.alt_ft)} ft entering the pattern against {alt_ft(p.pattern_ft)} ft, "
                f"{_off(p.off_ft, 'ft', 'high', 'low')}; {'within' if p.ok else 'outside'} tolerance.",
            )
        )
    out += [Source(id=f"note:{i}", label="Note", text=n) for i, n in enumerate(d.notes)]
    out.append(
        Source(
            id="tolerances",
            label="Tolerances (ACS PA.VI.A and PA.III.B)",
            text=f"Altitude within {num(t.altitude_ft)} ft, course within {num(t.course_deg)}°, "
            f"off route by {num(t.off_route_nm)} nm at most, each checkpoint within {num(t.eta_min)} min of its "
            f"estimate, the pattern altitude within {num(t.pattern_ft)} ft at {num(t.pattern_nm)} nm from the field.",
        )
    )
    return out
