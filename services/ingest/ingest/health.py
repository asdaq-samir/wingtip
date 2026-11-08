"""ingest's health check (the image's HEALTHCHECK and compose's): healthy
while its last beat in the live store is newer than HEALTHY_WITHIN_S.
`python -m ingest.health` exits 0 when healthy, 1 with the reason when not.
A feed that cannot connect does not fail it: its state says so, and the
reading keeps trying; a stuck process or a store it cannot write does."""
import sys
import time

from wingtip.traffic import store

from .settings import get_settings


def problem(now: float | None = None) -> str | None:
    """What is wrong, or None."""
    last = store.beats().get("ingest")
    if last is None:
        return "no beat written yet"
    age = (now if now is not None else time.time()) - last["at"]
    within = get_settings().healthy_within_s
    return f"last beat {age:.0f} s ago (more than {within:.0f})" if age > within else None


if __name__ == "__main__":
    wrong = problem()
    if wrong:
        print(wrong, file=sys.stderr)
    sys.exit(1 if wrong else 0)
