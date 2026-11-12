"""What the map's relief and 3D view are drawn from (the web's
lib/map/gl/terrain): the terrain tiles the planner reads its floors from
(wingtip.elevation), for the map's raster-dem source, and the FAA's
Digital Obstacle File in the view, for the obstacles stood up over that
ground. app.routers.terrain serves them."""

import hashlib
import inspect
from functools import cache
from pathlib import Path

from . import elevation, faa_data, terrain, terrain_fine
from .atomic import atomic_path

#: The finest terrain tile served: one finer than the planner's own
#: (TERRAIN_TILE_ZOOM, about 38 m a pixel), the zoom-13 tiles built ahead
#: round the airports and over steep ground (wingtip.terrain_fine), some
#: 15 m a pixel at 40 N -- USGS 3DEP's 1/3 arc-second, about 10 m, is what
#: they are drawn from. The map draws closer in from them.
MAX_ZOOM = terrain_fine.FINE_ZOOM

#: The obstacles' least height by default: 14 CFR 77.9(a)'s 200 ft above
#: the ground, past which construction is noticed to the FAA, and
#: faa_data.load_obstacles' own threshold for an obstacle that counts.
OBSTACLE_MIN_AGL_FT = 200
#: The widest box asked at once, in degrees each way: a tilted map's view
#: close in (the map asks only from zoom 9 in), not the country.
MAX_BOX_DEG = 2.0
#: The most obstacles a map is given at once: the tallest of them.
MAX_OBSTACLES = 2000


class NoSuchTile(ValueError):
    """A tile past MAX_ZOOM or off its zoom's grid."""


class BoxTooWide(ValueError):
    """A box that is no box, or wider than MAX_BOX_DEG either way."""


def tile_png(z: int, x: int, y: int) -> bytes:
    """One {z}/{x}/{y} terrain tile as a terrarium PNG, cleaned
    (elevation.terrain_tile_png); at zoom 13 the one built ahead, else its
    parent's drawn larger, never fetched (terrain_fine.fine_tile_png).
    Raises NoSuchTile off the grid, and requests.RequestException where
    it cannot be fetched."""
    if not (0 <= z <= MAX_ZOOM) or not (0 <= x < 2**z) or not (0 <= y < 2**z):
        raise NoSuchTile(f"terrain tiles exist for zoom 0-{MAX_ZOOM}")
    if z == terrain_fine.FINE_ZOOM:
        return terrain_fine.fine_tile_png(x, y)
    folder = _cleaned_dir()
    path = folder / str(z) / str(x) / f"{y}.png" if folder else None
    if path is not None and path.exists():
        return path.read_bytes()
    png = elevation.terrain_tile_png(z, x, y)
    if path is not None:
        # A cache, drawn again where a power cut loses it: no flush.
        with atomic_path(path, durable=False) as part:
            part.write_bytes(png)
    return png


@cache
def _cleaned_dir() -> Path | None:
    """Where the cleaned tiles are kept, written once each rather than
    decoded, cleaned and encoded again at every ask: a folder named by
    wingtip.elevation's own source, so a change to how a tile is cleaned
    (terrarium_m, _filled, terrarium_rgb) is a new folder and never a tile
    cleaned the old way. None where the source cannot be read: no copies
    kept then."""
    try:
        source = inspect.getsource(elevation)
    except (OSError, TypeError):
        return None
    return elevation.TERRAIN_TILE_DIR.parent / "terrain-tiles-cleaned" / hashlib.sha256(source.encode()).hexdigest()[:12]


def obstacles_in_box(
    south: float, west: float, north: float, east: float, min_agl_ft: float = OBSTACLE_MIN_AGL_FT, faa_cache_dir=None
) -> tuple[list[dict], bool]:
    """The DOF's obstacles in the box at least `min_agl_ft` tall, tallest
    first, at most MAX_OBSTACLES of them: each {lat, lon, agl_ft, amsl_ft,
    type, lit}, and whether some were left out. Raises BoxTooWide, and
    OSError or requests.RequestException where the file cannot be read."""
    if north <= south or east <= west or north - south > MAX_BOX_DEG or east - west > MAX_BOX_DEG:
        raise BoxTooWide(f"Ask for a box of at most {MAX_BOX_DEG:g} degrees each way, south to north and west to east.")
    dof = faa_data.ensure_nasr_file("DOF.DAT", faa_cache_dir or terrain.DEFAULT_FAA_CACHE_DIR)
    found = faa_data.load_obstacles(dof, (south, west, north, east), min_agl_ft=min_agl_ft)
    tallest = found.sort_values("agl_ft", ascending=False).head(MAX_OBSTACLES)
    return (
        [
            {
                "lat": float(r.lat),
                "lon": float(r.lon),
                "agl_ft": round(r.agl_ft),
                "amsl_ft": round(r.amsl_ft),
                "type": str(r.type or ""),
                "lit": bool(r.lit),
            }
            for r in tallest.itertuples(index=False)
        ],
        len(found) > len(tallest),
    )
