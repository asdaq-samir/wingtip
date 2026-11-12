"""ingest's own knobs from the environment, typed, each with its default,
as wingtip.config's Settings holds the planner's: the FAA SWIM
subscription and how often ingest says it is alive. What wingtip itself
reads (the stores' paths, ADSBFI_OPEN_DATA) stays in wingtip.config, which
ingest reads through wingtip as the planner does."""

import functools

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Unset SWIM_* are None, which turns that feed off."""

    model_config = SettingsConfigDict(case_sensitive=False, extra="ignore")

    #: The FAA SWIM subscription (ingest.swim): the broker, the account, and
    #: the CA store the broker's certificate is checked against (the image's own).
    #: A feed is read only where all of host, username, password and its own VPN and queue are set.
    swim_host: str | None = None
    swim_username: str | None = None
    swim_password: str | None = None
    swim_trust_store: str = "/etc/ssl/certs"
    #: Each feed's own broker (where it is not SWIM_HOST), VPN and queue.
    swim_host_stdds: str | None = None
    swim_vpn_stdds: str | None = None
    swim_queue_stdds: str | None = None
    swim_host_fns: str | None = None
    swim_vpn_fns: str | None = None
    swim_queue_fns: str | None = None
    swim_host_tfms: str | None = None
    swim_vpn_tfms: str | None = None
    swim_queue_tfms: str | None = None
    # ITWS's alerts and SFDPS's airspace, on the shared broker (SWIM_HOST).
    swim_host_itws: str | None = None
    swim_vpn_itws: str | None = None
    swim_queue_itws: str | None = None
    swim_host_sfdps: str | None = None
    swim_vpn_sfdps: str | None = None
    swim_queue_sfdps: str | None = None
    #: Whether the history thread runs (ingest.history): the day's NOTAM and
    #: TFR archive and the NTSB's database (HISTORY=0 on a test stack).
    history: bool = True
    #: How often ingest writes its beat and each feed's state to the store, s.
    beat_every_s: float = 10.0
    #: How old ingest's last beat may be and the health check still pass, s.
    healthy_within_s: float = 60.0
    log_level: str = "INFO"


@functools.cache
def get_settings() -> Settings:
    """The environment, read once. Tests that change it clear the cache."""
    return Settings()
