"""The dev-services sidecar (infra/dev-services), asked to start a
development service or a job and for their containers' state: for the
console's links (app.routers.devservices), the training run
(app.routers.system) and the charts jobs (app.chart_refresh,
app.chart_cycle).

This service never touches Docker itself. It asks the sidecar, the one
process holding the socket for this, which answers two requests -- which
of its services are up, and start one -- and refuses everything else,
including any name not on its own list. STARTABLE below only names them
for the console; the sidecar is what enforces the list. It sits on a
network only this service shares, so nothing else in the stack can ask
it anything.
"""
import logging

import requests

from wingtip import retry

from .settings import get_settings

log = logging.getLogger(__name__)

#: The services the console links to, and what it calls them. db and
#: the gateway are absent on purpose: nothing in the console links to a
#: database port, and the gateway starting itself is a contradiction.
STARTABLE = {
    "ml": "Jupyter (the notebooks)",
}

#: The training run's container (docker-compose.yml's `retrain`): started
#: by /api/retrain rather than linked to, so not among STARTABLE.
RETRAIN_SERVICE = "retrain"

#: Unset in every deployment that is not the compose stack, which is
#: how the console knows not to offer a start button at all.
SIDECAR_URL = get_settings().dev_services_url


def ask(method: str, path: str) -> requests.Response | None:
    """One request to the sidecar; None where there is none, or it did not
    answer."""
    if SIDECAR_URL is None:
        return None
    try:
        return requests.request(method, f"{SIDECAR_URL}{path}", timeout=20)
    except requests.RequestException as err:
        log.info("dev-services sidecar unreachable, so services cannot be started from here: %s", err)
        return None


def start(name: str) -> bool | None:
    """Start one of the sidecar's job containers (the charts job's, for
    app.chart_refresh): whether it was started -- False when it was
    running already, or has no container yet -- or None where there is
    no sidecar to ask."""
    response = ask("POST", f"/services/{name}/start")
    if response is None:
        return None
    if response.status_code != 200:
        log.warning("%s not started: %s", name, retry.upstream_detail(response, "the dev-services sidecar"))
        return False
    return bool(response.json().get("started"))


def service_state(name: str) -> str | None:
    """The state of one of the sidecar's services ("running", "exited",
    "absent" when it has no container yet), or None where there is no
    sidecar to ask."""
    response = ask("GET", "/services")
    if response is None or response.status_code != 200:
        return None
    return {s["name"]: s["state"] for s in response.json()}.get(name, "absent")
