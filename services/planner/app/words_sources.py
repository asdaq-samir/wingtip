"""The readings in words' sources: the flight, its TFRs, hazards and
G-AIRMETs, each put as a line a sentence can cite and a pilot can read
raw, for what changed in a briefing (app.words_changes; the ids they
carry are listed in app.routers.words)."""

from .gonogo.words import alt_ft, gairmet_title, num, sigmet_hazard
from .schemas.common import GAirmet, Hazard, OnRoute
from .schemas.words import WordsSource as Source


def flight_source(dep: str, dest: str, stops: list[str]) -> Source:
    """The flight itself, for a sentence about it to rest on."""
    way = " via " + ", ".join(stops) if stops else ""
    return Source(id="flight:route", label="The flight", text=f"From {dep} to {dest}{way}.")


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
