"""What is wrong with an airplane a pilot saves, for the gateway: its
AircraftRequest's fields checked by the engine's aircraft_problems
(engine/crates/pilot/src/aircraft/form.rs), the one statement of the
limits that the web, the iPhone and Android check the "Your Airplane"
form with too. The gateway holds no limit of its own (CLAUDE.md: Spring
Boot holds no aviation logic) and refuses a save this answers anything
for. Internal: only the gateway asks it (x-internal), never forwarded."""

from typing import Any

from fastapi import APIRouter, Body

from ..gateway import INTERNAL_GATEWAY
from ..gonogo import ask as engine

router = APIRouter()


@router.post("/api/aircraft/problems", openapi_extra=INTERNAL_GATEWAY)
def check_airplane(form: dict[str, Any] = Body(default_factory=dict)) -> dict[str, str]:
    """`{field: words}` for each field of the request that may not be
    saved, in the words the apps show under it; `{}` where it may be. The
    figures come as the gateway's JSON numbers and are read as the form's
    typed text, as the engine takes them; a field left out or null is
    blank."""
    typed = {key: _typed(value) for key, value in form.items() if value is not None and not isinstance(value, (dict, list))}
    return engine("aircraft_problems", **typed)


def _typed(value: Any) -> str:
    """A field as typed: text as it is, a number as Python writes it."""
    return value if isinstance(value, str) else str(value)
