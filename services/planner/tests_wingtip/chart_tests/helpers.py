"""Sheets and rasters the chart tests draw."""

import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import transform_bounds
from wingtip import charts

C81 = (42.3225, -88.0742)  # Campbell, Grayslake IL


PALETTE = {
    0: (255, 255, 255, 255),  # paper
    1: (255, 0, 0, 255),
    2: (0, 0, 255, 255),
    7: (0, 0, 0, 255),  # ink
    8: (216, 232, 206, 255),  # the sectional's land tint
    3: (184, 168, 168, 255),  # a Class B ring's magenta over the tint ...
    4: (213, 183, 200, 255),  # ... and over paper
    9: (184, 216, 184, 255),  # the darker column of a scan's edge ramp
    5: (200, 224, 196, 255),  # a lighter shade of the tint: a letter's halo, a line's anti-aliasing
}


def _palette_raster(path, box_deg, data):
    """A palette GeoTIFF in web mercator covering `box_deg`."""
    height, width = data.shape
    transform = from_bounds(*transform_bounds("EPSG:4326", "EPSG:3857", *box_deg), width, height)
    with rasterio.open(
        path, "w", driver="GTiff", width=width, height=height, count=1, dtype="uint8", crs="EPSG:3857", transform=transform
    ) as ds:
        ds.write(data, 1)
        ds.write_colormap(1, PALETTE)


def _rgb_raster(path, box_deg, rgb):
    """A three-band GeoTIFF in web mercator, the way the IFR charts come."""
    height, width = rgb.shape[:2]
    transform = from_bounds(*transform_bounds("EPSG:4326", "EPSG:3857", *box_deg), width, height)
    with rasterio.open(
        path, "w", driver="GTiff", width=width, height=height, count=3, dtype="uint8", crs="EPSG:3857", transform=transform
    ) as ds:
        ds.write(np.moveaxis(rgb, -1, 0))


def _sheet(tmp_path, name: str, box: tuple, value: int):
    path = tmp_path / f"{name.lower()}.tif"
    _palette_raster(path, box, np.full((512, 512), value, np.uint8))
    return charts.Chart(charts.SECTIONAL, name, "10-29-2026", (charts.Raster(path, face=box, envelope=box),), "now")


LEFT, RIGHT = (-90.0, 41.0, -88.0, 43.0), (-88.0, 41.0, -86.0, 43.0)


def _backdate(root, seconds=3600):
    """Every file under `root` made an hour old: a pass from earlier,
    not one the file clock cannot tell from the next."""
    import os

    for path in root.rglob("*"):
        if path.is_file():
            stamp = path.stat().st_mtime - seconds
            os.utime(path, (stamp, stamp))


def _tile_at(lat: float, lon: float, zoom: int) -> tuple:
    n = 2**zoom
    return int((lon + 180) / 360 * n), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


class _Bucket:
    """S3 as publish uses it: put_object for the pointer, upload_file for
    an archive."""

    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, ContentType, CacheControl):
        self.objects[(Bucket, Key)] = (Body, ContentType, CacheControl)

    def upload_file(self, Filename, Bucket, Key, ExtraArgs):
        self.objects[(Bucket, Key)] = (Path(Filename).read_bytes(), ExtraArgs["ContentType"], ExtraArgs["CacheControl"])
