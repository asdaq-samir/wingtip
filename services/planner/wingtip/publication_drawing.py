"""The airport diagram drawn as a picture: the cycle's PDF rendered once and
kept on disk, the page's drawing for the card to show, and the same cropped
to the field's runways, found by the diagram's own graticule or its thick
strokes. The PDFs themselves are wingtip.publications'."""

from __future__ import annotations

import io
import logging
import re
import threading
from datetime import date
from pathlib import Path

import numpy as np
import pypdfium2
import requests
from PIL import Image
from scipy import ndimage

from . import diagram_crops, outside
from .atomic import atomic_path
from .config import FAA_HEADERS as HEADERS
from .single_flight import one_at_a_time
from . import publications
from wingtip.engine import ask as engine

log = logging.getLogger(__name__)


#: How much finer than the PDF's own points the diagram is drawn: 5 is
#: 360 dots an inch, a d-TPP page (5.4 by 8.25 in) 1937 by 2970, where
#: the taxiway letters and the hot spots stay sharp on a phone's three
#: pixels a point as a pinch brings them in to 1.6 times its width, and
#: readable past that. Measured on KMSN's: 351 KB and 0.9 s to draw, where
#: 3 was 191 KB, soft as soon as it was pinched, and 6 was 439 KB.
DIAGRAM_SCALE = 5


_PDFIUM = threading.Lock()


def _drawn(pdf: bytes, page: int = 0) -> bytes:
    """A page of the PDF (its first) as a greyscale PNG, DIAGRAM_SCALE
    times its points: the FAA's charts are black on white, and grey keeps
    one a third the size of colour with nothing lost."""
    # pdfium is not thread-safe, and draws of different PDFs run in the
    # server's thread pool at once: one at a time, or the process can crash.
    with _PDFIUM:
        document = pypdfium2.PdfDocument(pdf)
        try:
            if not 0 <= page < len(document):
                raise IndexError(f"no page {page + 1} of {len(document)}")
            image = document[page].render(scale=DIAGRAM_SCALE, grayscale=True).to_pil().convert("L")
        finally:
            document.close()
    out = io.BytesIO()
    image.save(out, "PNG", optimize=True)
    return out.getvalue()


def airport_diagram_png(ident: str, cycle: str, on: date | None = None) -> Path | None:
    """The airport diagram of this cycle as a picture on disk: drawn from
    the FAA's PDF the first time it is asked for, and kept for the cycle.
    None where the field has none, the cycle is not the one in force, or
    the FAA cannot be reached (nothing is kept then, so the next ask
    tries again)."""
    # The cycle in force, or the kept one the card shows while the FAA
    # cannot give it (publications.serves); its own diagram, not another's.
    url = publications.airport_diagram_url(ident, on) if publications.serves("dtpp", cycle, on) else None
    if not url or not url.startswith(f"{publications.DTPP_BASE}/{cycle}/"):
        return None
    # By the PDF's own name: KDLH's and DLH's are one picture.
    path = publications.CACHE_DIR / "diagrams" / cycle / f"{Path(url).stem}.png"
    if path.exists():
        return path
    with one_at_a_time(path):
        if path.exists():
            return path
        try:
            resp = outside.get(url, headers=HEADERS, timeout=60)
            resp.raise_for_status()
            png = _drawn(resp.content)
        except (requests.RequestException, pypdfium2.PdfiumError) as err:
            log.warning("No airport diagram for %s in %s: %s", ident, cycle, err)
            return None
        with atomic_path(path) as partial:
            partial.write_bytes(png)
    return path


#: A diagram's latitude and longitude labels: "43 09'N" (its degree sign
#: a glyph of its own, not in the text), "34°12.5'N", "118°22.0'W".
_DMS = re.compile(r"(\d{1,3})\s*°?\s*(\d{1,2}(?:\.\d+)?)\s*['’]\s*([NSEW])")


def _graticule(page) -> tuple | None:
    """Where latitude and longitude fall on a north-up diagram's page, from
    its own labels: (y = a * lat + b, x = c * lon + d) in the page's points
    from its top left. The labels are found and placed here, from the
    page's text; the fit and its checks are the engine's
    diagram_graticule. None where the diagram has too few, or is turned on
    its page (its scales then disagree, or north is not up): KCRQ's and
    KORD's have none."""
    textpage = page.get_textpage()
    text = textpage.get_text_bounded()
    height = page.get_height()
    labels = []
    for match in _DMS.finditer(text):
        boxes = [textpage.get_charbox(i) for i in range(match.start(), match.end())]
        x = (min(b[0] for b in boxes) + max(b[2] for b in boxes)) / 2
        y = height - (min(b[1] for b in boxes) + max(b[3] for b in boxes)) / 2
        labels.append({"text": match.group(0), "x": x, "y": y})
    grid = engine("diagram_graticule", labels=labels)
    # The crop places the runways on a north-up page only, latitude down
    # the page and longitude across it.
    if grid is None or grid["lat_on_x"] or grid["north_deg"] != 0:
        return None
    return grid["a"], grid["b"], grid["c"], grid["d"]


def _thick_strokes(image) -> tuple | None:
    """The box round a diagram's runways where its labels cannot place
    them: its strokes as thick as a runway's, at the thickest that leaves
    a stroke as long as one (letters, the frame and the graticule are
    thinner, a building's block shorter), in the image's pixels."""
    dark = np.asarray(image) < 100
    for size in (11, 7, 5):
        labels, _ = ndimage.label(ndimage.binary_erosion(dark, structure=np.ones((size, size))))
        long = [s for s in ndimage.find_objects(labels) if max(s[0].stop - s[0].start, s[1].stop - s[1].start) >= 30 * DIAGRAM_SCALE]
        if long:
            return (
                min(s[1].start for s in long),
                min(s[0].start for s in long),
                max(s[1].stop for s in long),
                max(s[0].stop for s in long),
            )
    return None


def _runways_drawn(pdf: bytes, ends: list) -> bytes | None:
    """The airport diagram cropped to its runways, for the card's
    thumbnail, at the pilot's ask: where the runways' ends are (NASR's
    surveyed thresholds) placed on the diagram by its own latitude and
    longitude labels, else its runway-thick strokes; a margin round them,
    at most 700 pixels a side. None where neither finds them on a part of
    the sheet: the card draws its own sketch of the runways then."""
    with _PDFIUM:
        document = pypdfium2.PdfDocument(pdf)
        try:
            page = document[0]
            image = page.render(scale=DIAGRAM_SCALE, grayscale=True).to_pil().convert("L")
            grid = _graticule(page)
        finally:
            document.close()
    box = None
    if grid and ends:
        a, b, c, d = grid
        xs = [(c * lon + d) * DIAGRAM_SCALE for _, lon in ends]
        ys = [(a * lat + b) * DIAGRAM_SCALE for lat, _ in ends]
        box = (min(xs), min(ys), max(xs), max(ys))
        # Not on the sheet: the labels read wrong.
        if box[0] < 0 or box[1] < 0 or box[2] > image.width or box[3] > image.height:
            box = None
    strokes = _thick_strokes(image)
    if box and strokes:
        # The labels and the sheet's own runways must agree: a fit that is
        # on the page but wrong, or a crop that would cut a runway off,
        # is worse than the card's sketch, which draws them all.
        slack = 0.05 * max(strokes[2] - strokes[0], strokes[3] - strokes[1]) + 4 * DIAGRAM_SCALE
        if box[0] < strokes[0] - slack or box[1] < strokes[1] - slack or box[2] > strokes[2] + slack or box[3] > strokes[3] + slack:
            return None
        box = (min(box[0], strokes[0]), min(box[1], strokes[1]), max(box[2], strokes[2]), max(box[3], strokes[3]))
    box = box or strokes
    if not box:
        return None
    x0, y0, x1, y1 = box
    # Room for the taxiways and ramps too (the owner, 2026-11-13: "zoom out").
    pad = 0.15 * max(x1 - x0, y1 - y0) + 4 * DIAGRAM_SCALE
    crop = (int(max(0, x0 - pad)), int(max(0, y0 - pad)), int(min(image.width, x1 + pad)), int(min(image.height, y1 + pad)))
    # Most of the sheet is no crop -- the thick strokes found a legend's or
    # an inset's too (KLAX's): the card's own sketch serves better then.
    if (crop[2] - crop[0]) * (crop[3] - crop[1]) > 0.7 * image.width * image.height:
        return None
    image = image.crop(crop)
    image.thumbnail((700, 700), Image.LANCZOS)
    out = io.BytesIO()
    image.save(out, "PNG", optimize=True)
    return out.getvalue()


def airport_diagram_runways_png(ident: str, cycle: str, ends: list, on: date | None = None) -> Path | None:
    """The airport diagram of this cycle cropped to its runways (`ends`,
    each (lat, lon), where they are known) as a picture on disk, drawn the
    first time and kept for the cycle, as the whole diagram is
    (`airport_diagram_png`); None where it has none, or its runways cannot
    be found on it."""
    # The cycle in force, or the kept one the card shows while the FAA
    # cannot give it (publications.serves); its own diagram, not another's.
    url = publications.airport_diagram_url(ident, on) if publications.serves("dtpp", cycle, on) else None
    if not url or not url.startswith(f"{publications.DTPP_BASE}/{cycle}/"):
        return None
    path = diagram_crops.runways_path(publications.CACHE_DIR, url, cycle, bool(ends))
    none = path.with_suffix(".none")
    if path.exists():
        return path
    if none.exists():
        return None
    data = publications._pdf_of("dtpp", cycle, Path(url).name)
    if data is None:
        return None
    with one_at_a_time(path):
        if path.exists():
            return path
        if none.exists():
            return None
        try:
            png = _runways_drawn(data, ends)
        except pypdfium2.PdfiumError as err:
            log.warning("No runways' diagram for %s in %s: %s", ident, cycle, err)
            return None
        path.parent.mkdir(parents=True, exist_ok=True)
        if png is None:
            # Kept as a miss, so the sheet is not drawn and eroded again
            # at every card for the rest of the cycle.
            none.touch()
            return None
        with atomic_path(path) as partial:
            partial.write_bytes(png)
    return path
