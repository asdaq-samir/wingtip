"""The Brief's Go / No-Go: every tab's own finding about the flight in one
list, each a row that opens where it was found -- the weather, the
airspace on the route, the altitude, the fuel, the runways, the loading
and the risk -- and one line over them saying what they come to. What the
pilot reads first on opening the Brief, as a flight service briefer opens
with adverse conditions and whether VFR is recommended (AIM 7-1-5(b)(1),
(b)(2)). The findings are the planner's; the decision is the pilot in
command's (14 CFR 91.3), and the line says so.

The rules are the engine's (wingtip_engine::gonogo::verdict), asked by
name through wingtip_native.call, the one copy the planner, the web app
(apps/web/src/lib/verdict.ts) and the phones share.

A finding (lib/findings) is "ok", "caution", "stop", "unknown" or
"pending"; the input is the web's VerdictInput in snake case."""

from wingtip import faa_data, field_use
from wingtip.terrain import DEFAULT_FAA_CACHE_DIR

from . import ask

RISK_FINDING = {"low": "ok", "caution": "caution", "high": "stop"}


def verdict_items(v: dict) -> list[dict]:
    """Each tab's finding, in the order a pilot goes through them, each
    with where it is shown in full: a tab of the planning panel and a
    section of it by its title."""
    return ask("gonogo_verdict_items", **v)


def verdict_line(items: list[dict]) -> dict:
    """What the findings come to, in a line over them."""
    return ask("gonogo_verdict_line", items=items)


def alternate_finding(data: dict | None) -> dict | None:
    """What the IFR alternate comes to for the Go / No-Go
    (features/plan/hooks/useAlternate alternateFinding): a stop where the
    one filed will not do, a caution where one is needed (14 CFR
    91.169(a)(2), (b)) and none is filed or the one filed is the pilot's
    to check; nothing where none is needed."""
    return ask("gonogo_alternate_finding", data=data)


def with_alternate(items: list[dict], found: dict | None) -> list[dict]:
    """The alternate is the weather's to say, where the weather says
    nothing worse: a caution or a stop of its own, opening its section
    (FlightBriefingView)."""
    return ask("gonogo_with_alternate", items=items, found=found)


def field_permission(idents: tuple[str, ...] | list[str]) -> dict | None:
    """The row for a private or military-only departure, destination or
    stop (the engine's gonogo_field_permission: the owner's permission or
    the service's PPR, with NASR APT_CON's phone, 14 CFR 91.103), to add
    after the seven before the line; None where every field is public use."""
    roles = ["departure", *["stop"] * (len(idents) - 2), "destination"] if len(idents) > 1 else ["destination"]
    fields = [
        {"ident": ident, "role": role, **field_use.use_of(ident), "phone": faa_data.airport_contact(ident, DEFAULT_FAA_CACHE_DIR)["phone"]}
        for ident, role in zip(idents, roles)
    ]
    return ask("gonogo_field_permission", fields=fields)
