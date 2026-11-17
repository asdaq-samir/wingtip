"""The phones' packs: the planner's pack (wingtip.cycle_pack) cut into
regions, each its own file with what wingtip-engine's `phone` and `view`
modules read, and the index a phone asks for first. Built beside the
planner's (`ensure_phone`) in data/raw/packs/phone/<cycle>."""

from __future__ import annotations

import json
import logging
import struct
import time
from pathlib import Path

from . import cycle_pack
from .cycle_pack import Pack
from .pack_format import TABLES, VERSION, Writer, put_layer
from .phone_pack_shapes import (
    _FLOOR_REFS,
    PHONE_TOLERANCE_DEG,
    PHONE_WORST_NM,
    REGION_DEG,
    TERRAIN_POOL,
    _phone_shapes,
    _regions_of,
    _strings,
    _sua_alt,
    _terrain,
    region_bounds,
)

log = logging.getLogger(__name__)


def write_phone(pack: Pack, out_dir: Path, veil: list[dict]) -> dict:
    """The phones' packs of the planner's pack, one a region with
    anything in it, written whole into out_dir/<cycle>, with the index of
    them (what /api/cycle-packs gives); any other cycle's removed."""
    layers = _phone_shapes(pack)
    regions: dict[str, dict[str, list[int]]] = {}
    for name, shapes in layers.items():
        for i, (_, box, _) in enumerate(shapes):
            if box is not None:
                for region in _regions_of(box):
                    regions.setdefault(region, {}).setdefault(name, []).append(i)
    tables = {name: pack.table(name) for name in cycle_pack.COLUMNS if name in pack.sections}
    veil_spans, veil_names = _strings([a.get("name") or "" for a in veil])
    veil_pts = b"".join(struct.pack("<dd8sII", a["lat"], a["lon"], a["ident"].encode()[:8], *span) for a, span in zip(veil, veil_spans))
    folder = out_dir / pack.cycle
    part = out_dir / f"{pack.cycle}.part"
    if part.exists():
        for old in part.iterdir():
            old.unlink()
    part.mkdir(parents=True, exist_ok=True)
    index = {
        "cycle": pack.cycle,
        "built_at": time.time(),
        "tolerance_deg": PHONE_TOLERANCE_DEG,
        "worst_nm": PHONE_WORST_NM,
        "region_deg": REGION_DEG,
        "terrain_pool": TERRAIN_POOL,
        "tables": TABLES,
        # The ground grid the terrain was read from: a new one (its voids
        # read as no height, 2026-11-02) builds the phones' packs again.
        "ground_grid": ground_grid_version(),
        "sources": pack.meta.get("sources"),
        "regions": [],
    }
    for region in sorted(regions):
        west, south, east, north = region_bounds(region)
        held = regions[region]
        names = ["meta"]
        for layer in ("airspace", "sua", "urban"):
            if layer in held:
                names += [f"{layer}.box", f"{layer}.off", f"{layer}.wkb"]
        if "airspace" in held:
            names += ["airspace.vol", "airspace.names", "airspace.attr"]
        if "sua" in held:
            names += ["sua.rec", "sua.json", "sua.names", "sua.alt", "sua.times"]
        ground = _terrain(region)
        if ground is not None:
            names.append("terrain")
        names += ["veil.pts", "veil.names"] + list(tables)
        path = part / f"{region}.pack"
        with open(path, "w+b") as f:
            w = Writer(f, names)
            w.put(
                "meta",
                json.dumps(
                    {
                        "format": VERSION,
                        "cycle": pack.cycle,
                        "flavour": "phone",
                        "region": region,
                        "bounds": [west, south, east, north],
                        "tolerance_deg": PHONE_TOLERANCE_DEG,
                        "worst_nm": PHONE_WORST_NM,
                        "sources": pack.meta.get("sources"),
                    },
                    separators=(",", ":"),
                ).encode(),
            )
            for layer in ("airspace", "sua", "urban"):
                if layer in held:
                    picked = [layers[layer][i] for i in held[layer]]
                    put_layer(w, layer, [box for _, box, _ in picked], [wkb for wkb, _, _ in picked], None)
            if "airspace" in held:
                volumes = [layers["airspace"][i][2] for i in held["airspace"]]
                spans, run = _strings([v["name"] for v in volumes])
                w.put(
                    "airspace.vol",
                    b"".join(
                        struct.pack(
                            "<BB6xddII", ord((v["class"] or "E")[0]), _FLOOR_REFS[v["floor_ref"]], v["floor_ft"], v["ceiling_ft"], *span
                        )
                        for v, span in zip(volumes, spans)
                    ),
                )
                w.put("airspace.names", run)
                # What the phone's map says of a volume besides, one
                # object a volume, in the layer's order: the engine's `view`
                # reads it, and answers each field null from a pack without it.
                w.put(
                    "airspace.attr",
                    json.dumps(
                        [
                            {
                                "ident": v["ident"] or None,
                                "number": v["number"],
                                "ceiling_excluded": v["ceiling_excluded"],
                                "hours_code": v["hours_code"],
                                "hours_remark": v["hours_remark"],
                            }
                            for v in volumes
                        ],
                        separators=(",", ":"),
                    ).encode(),
                )
            if "sua" in held:
                areas = [layers["sua"][i][2] for i in held["sua"]]
                blobs = [json.dumps(a, separators=(",", ":")) for a in areas]
                blob_spans, blob_run = _strings(blobs)
                name_spans, name_run = _strings([a["name"] for a in areas])
                w.put(
                    "sua.rec",
                    b"".join(
                        struct.pack("<dIIII", float("nan") if a["floor_ft"] is None else a["floor_ft"], *b, *n)
                        for a, b, n in zip(areas, blob_spans, name_spans)
                    ),
                )
                w.put("sua.json", blob_run)
                w.put("sua.names", name_run)
                alt, times = _sua_alt(areas)
                w.put("sua.alt", alt)
                w.put("sua.times", times)
            if ground is not None:
                w.put("terrain", ground)
            w.put("veil.pts", veil_pts)
            w.put("veil.names", veil_names)
            for name, table in tables.items():
                columns = table["columns"]
                lat_at, lon_at = columns.index("LAT_DECIMAL"), columns.index("LONG_DECIMAL")

                def inside(row, lat_at=lat_at, lon_at=lon_at):
                    try:
                        lat, lon = float(row[lat_at]), float(row[lon_at])
                    except ValueError:
                        return False
                    return south <= lat < north and west <= lon < east

                w.put(
                    name, json.dumps({"columns": columns, "rows": [r for r in table["rows"] if inside(r)]}, separators=(",", ":")).encode()
                )
            w.finish(pack.cycle, time.time())
            f.seek(36)
            crc = struct.unpack("<I", f.read(4))[0]
        index["regions"].append(
            {"name": region, "west": west, "south": south, "east": east, "north": north, "bytes": path.stat().st_size, "crc32": crc}
        )
    (part / "index.json").write_text(json.dumps(index, separators=(",", ":")))
    if folder.exists():
        for old in folder.iterdir():
            old.unlink()
        folder.rmdir()
    part.replace(folder)
    for other in out_dir.iterdir():
        if other.is_dir() and other != folder:
            for old in other.iterdir():
                old.unlink()
            other.rmdir()
    return index


def phone_index(pack_dir=None) -> dict | None:
    """The phones' packs of the newest cycle on disk, as written; None
    where there are none."""
    folder = Path(pack_dir or cycle_pack.PACK_DIR) / "phone"
    found = sorted(p for p in folder.glob("*/index.json") if not p.parent.name.endswith(".part"))
    if not found:
        return None
    try:
        return json.loads(found[-1].read_text())
    except (OSError, ValueError):
        return None


def phone_pack_path(cycle: str, region: str, pack_dir=None) -> Path | None:
    """A phone pack on disk by its cycle and region; None where there is
    none (or the names are not a cycle's and a region's)."""
    import re

    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", cycle) or not re.fullmatch(r"[ns]\d{2}[ew]\d{3}", region):
        return None
    path = Path(pack_dir or cycle_pack.PACK_DIR) / "phone" / cycle / f"{region}.pack"
    return path if path.is_file() else None


def ground_grid_version() -> str | None:
    """The ground grid the phones' terrain is read from, by its version;
    None where it is not built."""
    from . import ground_grid

    return ground_grid.VERSION if ground_grid._grids() is not None else None


def ensure_phone(pack_dir=None) -> dict | None:
    """The phones' packs built anew where not of the planner's pack's cycle
    and sources (sua.FIELDS too); None where they are, or there is no pack."""
    from . import airspace_at

    pack = cycle_pack.current(pack_dir)
    if pack is None:
        return None
    index = phone_index(pack_dir) or {}
    wanted = {"cycle": pack.cycle, "tolerance_deg": PHONE_TOLERANCE_DEG, "terrain_pool": TERRAIN_POOL, "tables": TABLES}
    wanted["ground_grid"] = ground_grid_version()
    if index and all(index.get(k) == v for k, v in {**wanted, "sources": pack.meta.get("sources")}.items()):
        return None
    started = time.monotonic()
    index = write_phone(pack, Path(pack_dir or cycle_pack.PACK_DIR) / "phone", list(airspace_at.mode_c_airports()))
    log.info(
        "Phone packs for %s built in %.1f s: %d regions, %.1f MB",
        pack.cycle,
        time.monotonic() - started,
        len(index["regions"]),
        sum(r["bytes"] for r in index["regions"]) / 1e6,
    )
    return index
