"""The retry loop around a whole fetch-and-read, where reading the answer
can fail as well as the request (a cut-off zip, a body that is not JSON):
aviationweather.gov, Overpass, the USGS elevation service, the FAA's
data downloads -- and the one way this package reads a service's own
reason out of an error response (upstream_detail). A plain request to
an outside source is retried by wingtip.outside's session instead."""

import requests
from tenacity import Retrying, retry_if_exception_type, stop_after_attempt, wait_exponential_jitter


def with_retries(
    action,
    *,
    describe: str,
    retries: int = 3,
    backoff_s: float = 2.0,
    transient: tuple = (requests.RequestException,),
    error: type = RuntimeError,
):
    """Runs `action()` up to `retries` times, sleeping `backoff_s`, then
    twice that, and so on (exponential, plus up to a second of jitter so
    callers that failed together do not retry together) between attempts,
    and raises `error` -- naming `describe` and the last failure -- once
    they are spent.

    A certificate problem is raised at once instead: it fails identically
    on every attempt (aviationweather.gov's own certificate expired on
    2026-09-19), so the back-off would only delay the same answer.
    """
    try:
        for attempt in Retrying(
            stop=stop_after_attempt(retries),
            wait=wait_exponential_jitter(initial=backoff_s, jitter=1.0),
            retry=retry_if_exception_type(transient) & ~retry_if_exception_type(requests.exceptions.SSLError),
            reraise=True,
        ):
            with attempt:
                return action()
    except requests.exceptions.SSLError as err:
        raise error(f"{describe} failed: {err}") from err
    except transient as err:
        raise error(f"{describe} failed after {retries} attempts: {err}") from err


def upstream_detail(response, service: str) -> str:
    """Why `service` answered with an error, in its own words: the
    `detail` of a JSON body (FastAPI's shape), else the body's text,
    else just which service answered with which status. The planner's
    dev-services proxy reports upstream failures through this."""
    try:
        detail = response.json().get("detail")
    except (ValueError, AttributeError):
        detail = None
    if detail:
        return str(detail)
    text = (getattr(response, "text", "") or "").strip()
    return text or f"{service} answered {response.status_code}"
