"""A pilot's personal minimums -- the weather they have decided they will
not take off or land in, stricter than the rules -- and where the
briefing's weather is under them (apps/web/src/lib/minimums.ts). Each off
(None) until set. The rules are the engine's
(wingtip_engine::gonogo::minimums), asked by name through wingtip_native.call,
as the web app asks them."""

from . import ask

#: The minimums, each off until set: the lowest ceiling (feet above the
#: field, a METAR's or TAF's), the least visibility (statute miles), the
#: most crosswind on the best runway and the most surface wind, gusts
#: included (knots).
NO_MINIMUMS = {"ceiling_ft": None, "visibility_sm": None, "crosswind_kt": None, "wind_kt": None}


def under_minimums(m: dict, briefing: dict, landings: list[str], dest: str) -> list[str]:
    """Where the briefing's weather is under the minimums, each a
    sentence: every airport landed at's current report (ceiling,
    visibility, wind, the crosswind on its best runway), the
    destination's forecast, and the forecast along the route. Empty when
    it is not, or none is set."""
    airports = briefing.get("airports") or {}
    return ask(
        "gonogo_under_minimums",
        minimums=m,
        landings=landings,
        dest=dest,
        metars=briefing.get("metars") or {},
        airports={i: airports[i] for i in landings if i in airports},
        forecast=briefing.get("forecast"),
    )
