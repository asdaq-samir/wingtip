"""What the Spring Boot gateway needs to know of a route a browser or a
phone may reach, said where the route is declared.

The gateway (services/gateway, its UpstreamRoutes) forwards
/api/planner/... to this service and to the assistant, and only the
operations whose OpenAPI entry carries ``x-gateway``: a route without it
is a 404 there, and this service is never asked. The gateway reads this
service's committed openapi.json, copied into its jar when it is built,
so a route added here with ``openapi_extra=PUBLIC`` (or another below) is
reachable once both are rebuilt, with no list of paths in Java to keep.

``access`` is who may call it: ``public`` (anyone, planning needs no
account), ``signed-in`` (a session, where the deployment offers one) or
``developer`` (the developer role: work on the model or the stack, not on
a flight). The rest are off unless set:

- ``cache``: the answer is the same for every pilot and carries no
  weather, so the gateway passes this service's Cache-Control on (and
  CloudFront keeps by it) instead of its own no-store.
- ``headers``: response headers passed on as they came, besides the
  content type (an encoding, a file's name, a range answered).
- ``range``: the request's Range header is passed on, for a reader that
  fetches a file in pieces.
- ``csrf: False``: a POST that changes nothing, asked by the native app,
  which holds no cookie to echo a CSRF token from.
- ``pilot``: the gateway sends the signed-in pilot's id as X-Pilot-Id,
  set from the session and never from the request.
- ``paid``: the subscription feature it is (the gateway's PaidFeature),
  checked against the pilot's subscription and its daily allowance first.
- ``body_limit``: the largest body forwarded, in bytes, where it is less
  than the gateway's 4 MB for any POST.

The assistant (services/assistant/app/gateway.py) has the same helper.
"""

from typing import Literal

Access = Literal["public", "signed-in", "developer"]
Paid = Literal["NARRATIVE", "CHECKPOINT_NOTES", "ORAL", "ASSISTANT", "WORDS"]


def gateway(
    access: Access,
    *,
    cache: bool = False,
    headers: tuple[str, ...] = (),
    range: bool = False,  # noqa: A002
    csrf: bool = True,
    pilot: bool = False,
    paid: Paid | None = None,
    body_limit: int | None = None,
) -> dict:
    """The ``openapi_extra`` of a route the gateway forwards."""
    spec: dict = {"access": access}
    if cache:
        spec["cache"] = True
    if headers:
        spec["headers"] = list(headers)
    if range:
        spec["range"] = True
    if not csrf:
        spec["csrf"] = False
    if pilot:
        spec["pilot"] = True
    if paid:
        spec["paid"] = paid
    if body_limit:
        spec["bodyLimit"] = body_limit
    return {"x-gateway": spec}


#: Anyone may ask: reading the planner needs no account.
PUBLIC = gateway("public")
#: Anyone may ask, and the answer is kept by the browser and the CDN for
#: as long as this service's Cache-Control says.
SHARED = gateway("public", cache=True)
#: A POST anyone may ask that changes nothing here (the pilot's own
#: figures ride in its body), with no CSRF token: the native app has none.
PUBLIC_READ_BY_POST = gateway("public", csrf=False)
#: The developer's: the model's training and the stack's own state.
DEVELOPER = gateway("developer")
#: Asked by the assistant service alone, on the stack's own network: no
#: ``x-gateway``, so the gateway never forwards it and no browser or
#: phone reaches it; ``x-internal`` says who does, for a reader of the
#: document.
INTERNAL_ASSISTANT = {"x-internal": "assistant"}
#: Asked by the gateway alone (its CrashDraftMail, the Studio's crash
#: drafts' mail), on the stack's own network, never forwarded.
INTERNAL_GATEWAY = {"x-internal": "gateway"}
