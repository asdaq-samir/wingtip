"""The shapes app.routers.devservices sends and takes, as Pydantic models."""

from pydantic import BaseModel


class DevService(BaseModel):
    """One service the developer console links to, and whether it is up.

    `state` is Docker's own word for it -- running, exited, created --
    or "absent" where compose has never created the container at all,
    which needs `docker compose up -d <service>` once rather than a
    start.
    """

    name: str
    label: str
    state: str


class DevServices(BaseModel):
    """`available` is false where there is no Docker socket, which is
    every deployment that is not the local development stack. The
    console stops offering to start anything rather than offering a
    button that cannot work."""

    available: bool
    services: list[DevService]


class DevServiceStarted(BaseModel):
    """`started` is false when there was nothing to do, which is the
    common case: the console asks on every click so the link always
    works."""

    service: str
    state: str
    started: bool
