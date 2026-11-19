"""The Brief's Go / No-Go: every tab's own finding about the flight in one
list, each a row that opens where it was found -- the weather, the
airspace on the route, the altitude, the fuel, the runways, the loading
and the risk -- and one line over them saying what they come to. What the
pilot reads first on opening the Brief, as a flight service briefer opens
with adverse conditions and whether VFR is recommended (AIM 7-1-5(b)(1),
(b)(2)). The findings are the planner's; the decision is the pilot in
command's (14 CFR 91.3), and the line says so.

The rules are the engine's, and so is putting them together: one ask of
gonogo_brief (wingtip_engine::gonogo::brief) gives the seven findings,
the oxygen's after the altitude's (14 CFR 91.211(a)), the IFR
alternate's in the weather's (91.169), the fields row for a closed,
private or military-only field (decision 0043, 91.103), the airplane's
findings left out where none is picked, and the line over what is left:
the one copy the planner, the web app and the phones share.

A finding (lib/findings) is "ok", "caution", "stop", "unknown" or
"pending"; the input is the web's VerdictInput in snake case."""

from wingtip import faa_data, field_use
from wingtip.terrain import DEFAULT_FAA_CACHE_DIR

from . import ask


def brief(verdict: dict, alternate: dict | None, idents, airplane: bool) -> dict:
    """The Go / No-Go put together, {"items", "line"} (the engine's
    gonogo_brief): `verdict` the findings' input (the web's VerdictInput
    in snake case, with the risk); `alternate` /api/alternate's answer
    under IFR, else None; `idents` the route's fields; `airplane` whether
    one is picked."""
    return ask("gonogo_brief", verdict=verdict, alternate=alternate, fields=fields_of(idents), airplane=airplane)


def fields_of(idents: tuple[str, ...] | list[str]) -> list[dict]:
    """The departure, the stops and the destination as NASR has them, for
    the engine's fields row: whether each is open (APT_BASE's
    ARPT_STATUS), private or military, and APT_CON's phone to call."""
    roles = ["departure", *["stop"] * (len(idents) - 2), "destination"] if len(idents) > 1 else ["destination"]
    return [
        {
            "ident": ident,
            "role": role,
            **field_use.use_of(ident),
            "phone": faa_data.airport_contact(ident, DEFAULT_FAA_CACHE_DIR)["phone"],
            "status": (field_use.record_of(ident) or {}).get("status"),
        }
        for ident, role in zip(idents, roles)
    ]
