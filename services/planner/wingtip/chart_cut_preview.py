"""The picture a failed cut check points at: a sheet of the new cycle,
reduced, with each new or grown cut (and a moved face) filled and outlined
in red, so a person sees what the detection took out before the cycle is
served (wingtip.chart_cuts)."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from . import chart_sheets, config
from .chart_kinds import KINDS

REVIEW_DIR = "cut-review"


def preview(cycle: str, sheet: str, boxes: list, max_px: int = 1600) -> Path:
    """A PNG of the sheet, reduced to `max_px` on its long side, with each
    box (degrees) filled and outlined in red, beside the cycle's sheets
    under cut-review/. Returns its path."""
    import rasterio
    from PIL import Image
    from rasterio.warp import transform_bounds

    kind_key, name, stem = sheet.split("/")
    folder = chart_sheets.chart_dir(cycle, KINDS[kind_key], name)
    source = next(p for p in sorted(folder.glob("*.tif")) if p.stem == stem and not p.name.endswith(".mask.tif"))
    with rasterio.open(source) as src:
        scale = min(1.0, max_px / max(src.width, src.height))
        shape = (max(1, round(src.height * scale)), max(1, round(src.width * scale)))
        if src.count >= 3:
            rgb = np.moveaxis(src.read([1, 2, 3], out_shape=shape), 0, -1)
        else:
            lut = np.array([src.colormap(1).get(i, (128, 128, 128, 255))[:3] for i in range(256)], dtype=np.uint8)
            rgb = lut[src.read(1, out_shape=shape)]
        red = np.array([255, 0, 0], dtype=np.float32)
        for box in boxes:
            left, bottom, right, top = transform_bounds("EPSG:4326", src.crs, *box, densify_pts=21)
            (r0, c0), (r1, c1) = src.index(left, top), src.index(right, bottom)
            r0, r1 = sorted(int(np.clip(r * scale, 0, shape[0])) for r in (r0, r1))
            c0, c1 = sorted(int(np.clip(c * scale, 0, shape[1])) for c in (c0, c1))
            area = rgb[r0:r1, c0:c1].astype(np.float32)
            rgb[r0:r1, c0:c1] = (area * 0.6 + red * 0.4).astype(np.uint8)
            for rows, cols in (
                (slice(r0, min(r0 + 4, r1)), slice(c0, c1)),
                (slice(max(r1 - 4, r0), r1), slice(c0, c1)),
                (slice(r0, r1), slice(c0, min(c0 + 4, c1))),
                (slice(r0, r1), slice(max(c1 - 4, c0), c1)),
            ):
                rgb[rows, cols] = (255, 0, 0)
    out = (config.CHARTS_DIR / cycle / REVIEW_DIR) / f"{kind_key}-{name}-{stem}.png".replace(" ", "_").replace("/", "_")
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgb).save(out)
    return out
