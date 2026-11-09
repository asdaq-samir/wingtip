"""What the Spring Boot gateway needs to know of a route a browser or a
phone may reach, said where the route is declared: the same ``x-gateway``
extension as the planner's (services/planner/app/gateway.py, which says
what each key means). The gateway reads this service's committed
openapi.json, copied into its jar when it is built, and forwards
/api/planner/... here for each operation that carries it; one without it
is a 404 there.

Every route here is a billed Claude call, so each says which paid
feature it is (the gateway's PaidFeature): the gateway checks the
pilot's subscription and the day's allowance before it asks.
"""
from typing import Literal

Access = Literal["public", "signed-in", "developer"]
Paid = Literal["NARRATIVE", "CHECKPOINT_NOTES", "ORAL", "ASSISTANT", "WORDS"]


def gateway(access: Access, *, paid: Paid | None = None, body_limit: int | None = None, pilot: bool = False) -> dict:
    """The ``openapi_extra`` of a route the gateway forwards."""
    spec: dict = {"access": access}
    if pilot:
        spec["pilot"] = True
    if paid:
        spec["paid"] = paid
    if body_limit:
        spec["bodyLimit"] = body_limit
    return {"x-gateway": spec}
