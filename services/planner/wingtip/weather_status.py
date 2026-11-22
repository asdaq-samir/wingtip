"""Each weather product the planner reads, as held in the weather store,
for the Dev console, the map's layer ages and the pilot's Status page:
when its copy was fetched, to when it may be served, and whether the
service's last try for a newer one failed. wingtip.weather names these
too, so its callers ask it as before."""

from . import weather_store

# Each source as a pilot knows it, for the line said when it cannot be had.
_PRODUCT_WORDS = {
    "metars": "METARs",
    "tafs": "TAFs",
    "airsigmets": "SIGMETs",
    "airmets": "Alaska AIRMETs",
    "pireps": "PIREPs",
    "gairmets": "G-AIRMETs",
}

#: The reports and advisories, each a cache file of aviationweather.gov's.
_CACHE_SOURCES = ("metars", "tafs", "airsigmets", "airmets", "pireps", "gairmets")


def preload() -> None:
    """Every product read from the store now, so the first plan after a
    restart finds each decoded rather than decoding it (a stat after)."""
    for name in (*_CACHE_SOURCES, *(f"winds-{hr}" for hr in weather_store.WIND_PERIODS)):
        weather_store.read(name)


def dataset_status() -> dict[str, float | None]:
    """When each source's stored copy was last confirmed (fetched, or found
    unchanged since: weather_store.confirmed_at), None for one not held --
    what the Dev console (/api/status) and the map's layer ages
    (/api/map/ages) show as the weather's age. A copy served on through
    an outage keeps its own fetch time, so the age said grows with it. The
    winds aloft, the GFS's, are "winds-06", "winds-12" and "winds-24", by
    period."""
    out = {}
    for name in (*_CACHE_SOURCES, *(f"winds-{hr}" for hr in weather_store.WIND_PERIODS)):
        record = weather_store.read(name)
        out[name] = weather_store.confirmed_at(name, record)
    return out


def sources_status() -> list[dict]:
    """Each source as the pilot's Status page lists it: its name in a
    pilot's words, its weather store name (`key`, which the feed watch's
    lines go by), when the copy held was last confirmed, to when that copy may
    still be served (its product's own validity, the record's `until`;
    None for no limit, as the METARs, each carrying its own time), and
    whether the service's last ask for a newer one failed -- the copy
    held then served on (UNIX seconds; None where there is none). The
    winds aloft, the GFS's, each period held to the end of its own window."""
    named = [(name, _PRODUCT_WORDS.get(name, name)) for name in _CACHE_SOURCES]
    named += [(f"winds-{hr}", f"Winds aloft, modelled (GFS), {int(hr)}-hour") for hr in weather_store.WIND_PERIODS]
    out = []
    for key, words in named:
        record = weather_store.read(key)
        out.append(
            {
                "name": words,
                "key": key,
                "fetched_at": weather_store.confirmed_at(key, record),
                "kept_until": record.until if record else None,
                "failing": weather_store.failing(key, record),
            }
        )
    return out
