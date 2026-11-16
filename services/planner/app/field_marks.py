"""What the map marks a field by, read for a whole list at once: who owns
it and the class of airspace at its surface -- the fields in view's, a
stop's and the nearest fields' (app.routers.airports)."""

from wingtip import airspace, airspace_at, altitude, faa_data


def owners_of(places: list[dict]) -> list[tuple]:
    """Each field's (military, private) from the FAA's airport file
    (wingtip.faa_data), by either ident (KDLH, C81, KC81). The file's sets are
    fetched once for all the fields, not once each: with the file missing
    each fetch retries the download, and a zoomed-out map has hundreds."""
    owned = faa_data.military_fields(altitude.DEFAULT_FAA_CACHE_DIR)
    closed = faa_data.private_fields(altitude.DEFAULT_FAA_CACHE_DIR)
    return [
        (
            owned.get(p["ident"].upper()) or owned.get(p.get("source_ident", "").upper()),
            p["ident"].upper() in closed or p.get("source_ident", "").upper() in closed,
        )
        for p in places
    ]


def surface_classes_of(places: list[dict]) -> list:
    """Each field's class of airspace at its surface, for its mark on the
    map (wingtip.airspace.surface_classes, all of them at once); None for each
    where the FAA's airspace cannot be had, the marks drawn without it."""
    try:
        shp_path = airspace.ensure_class_airspace_shapefile(altitude.DEFAULT_FAA_CACHE_DIR)
        return airspace.surface_classes([(p["lat"], p["lon"]) for p in places], shp_path)
    except (OSError, RuntimeError):
        return [None] * len(places)


def surface_airspace_of(place: dict) -> dict:
    """One field's class of airspace at its surface and, where it is
    part-time, its class at other times, for its card
    (wingtip.airspace_at.surface_airspace, the engine's rule), as
    {"airspace_class", "surface_airspace"}; None for each where the FAA's
    airspace cannot be had, the card's Airspace a dash."""
    try:
        shp_path = airspace.ensure_class_airspace_shapefile(altitude.DEFAULT_FAA_CACHE_DIR)
        return airspace_at.surface_airspace(place["lat"], place["lon"], place.get("elevation_ft"), shp_path)
    except (OSError, RuntimeError):
        return {"airspace_class": None, "surface_airspace": None}
