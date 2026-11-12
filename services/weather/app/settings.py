"""Every environment variable the weather service reads, by its own name
(WEATHER_ and the field, case aside), with its default. Where the store is
(WEATHER_STORE) is wingtip's (wingtip.config), since the planner reads it
too.

Each product is fetched every `<product>_every_s` while a pilot is
planning -- the planner has read the store in the last `in_use_s` -- and
every `<product>_idle_every_s` otherwise, so the store never runs far out
of date with nobody planning and costs little: the planner's own refresh,
before the split, fetched only while in use (about 300 MB a day saved).
The pace while planning keeps each product inside the time its source
updates it in: aviationweather.gov's cache files every minute (TAFs every
ten), the GFS's runs every six hours with an hourly forecast step, GLMP's
issues hourly at half past, tfr.faa.gov's shapes every few minutes, the
radar mosaic and the GOES pictures every five minutes.
"""

import functools

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="WEATHER_", case_sensitive=False, extra="ignore")

    #: The health check's port.
    port: int = 8000
    #: How often the schedule looks at what is due.
    tick_s: float = 15.0
    #: How long after the planner's last read a pilot counts as planning.
    in_use_s: float = 900.0
    #: How many fetches run at once.
    workers: int = 3
    #: METARs, TAFs, SIGMETs and AIRMETs, PIREPs, G-AIRMETs (aviationweather.gov).
    reports_every_s: float = 240.0
    reports_idle_every_s: float = 1800.0
    #: The winds aloft (the GFS from NOMADS), each period.
    winds_every_s: float = 2700.0
    winds_idle_every_s: float = 7200.0
    #: Gridded LAMP (NOMADS): asked for a new issue this often.
    glmp_every_s: float = 600.0
    glmp_idle_every_s: float = 3600.0
    #: The SPC's Day 1 convective outlook (issued five times a day).
    outlook_every_s: float = 1800.0
    outlook_idle_every_s: float = 3600.0
    #: TFRs (tfr.faa.gov).
    tfrs_every_s: float = 600.0
    tfrs_idle_every_s: float = 1800.0
    #: When the radar mosaic was made (IEM).
    radar_every_s: float = 120.0
    radar_idle_every_s: float = 900.0
    #: When each GOES picture was taken (nowCOAST's capabilities).
    satellite_every_s: float = 300.0
    satellite_idle_every_s: float = 1800.0
    #: The map's flow layer (app.flow): the HRRR runs hourly, so looked for
    #: four times an hour while planning; a frame already held is not
    #: downloaded again. Every three hours otherwise.
    flow_every_s: float = 900.0
    flow_idle_every_s: float = 10800.0
    #: How far ahead the flow layer's frames take the HRRR, hours: 0 is
    #: the last hour and now (two HRRR files, about 21 MB an hour); 12
    #: the whole timeline (eight, about 84 MB an hour). The GFS beyond.
    flow_hrrr_ahead_h: int = 0


class SettingsError(ValueError):
    """A malformed environment variable, named as compose writes it."""


@functools.cache
def get_settings() -> Settings:
    """The environment, read and checked once; a malformed value raises
    SettingsError naming the variable."""
    try:
        return Settings()
    except ValidationError as err:
        bad = "; ".join(f"WEATHER_{'_'.join(str(p) for p in e['loc']).upper()}={e.get('input')!r}: {e['msg']}" for e in err.errors())
        raise SettingsError(f"The environment has a malformed setting: {bad}") from None
