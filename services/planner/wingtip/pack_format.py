"""The cycle pack's file format and the helpers that write it: the header
constants, the section writer and the readers of the sources a pack is made
from. wingtip.cycle_pack reads and builds the planner's pack with them and
wingtip.phone_pack the phones'. The format is set out in
engine/crates/airspace/src/pack.rs."""

from __future__ import annotations

import csv
import json
import mmap
import struct
import zlib
from pathlib import Path

import numpy as np

MAGIC = b"WTPK"
VERSION = 1
#: What the tables hold, apart from the binary format (VERSION, which an
#: older engine refuses): 2 since 2026-11-14, the airports' HARD_FT. A pack
#: or a phone's pack index of another is built again, and the phones,
#: seeing each region's new crc32, fetch it again.
TABLES = 2
HEADER = 64
ENTRY = 32


class Writer:
    """Sections streamed into the file after a header and a table written
    last, the CRC over all of it but the header."""

    def __init__(self, f, names: list[str]):
        self.f, self.names, self.entries = f, names, {}
        f.write(b"\0" * (HEADER + ENTRY * len(names)))

    def _align(self) -> None:
        pad = -self.f.tell() % 8
        if pad:
            self.f.write(b"\0" * pad)

    def begin(self, name: str) -> int:
        self._align()
        start = self.f.tell()
        self.entries[name] = (start, 0)
        return start

    def end(self, name: str) -> None:
        start = self.entries[name][0]
        self.entries[name] = (start, self.f.tell() - start)

    def put(self, name: str, data: bytes) -> None:
        self.begin(name)
        self.f.write(data)
        self.end(name)

    def finish(self, cycle: str, built_at: float) -> None:
        table = b"".join(struct.pack("<16sQQ", n.encode(), *self.entries[n]) for n in self.names)
        self.f.seek(HEADER)
        self.f.write(table)
        self.f.flush()
        self.f.seek(HEADER)
        crc = 0
        while chunk := self.f.read(1 << 22):
            crc = zlib.crc32(chunk, crc)
        header = MAGIC + struct.pack("<I16sdII", VERSION, cycle.encode(), built_at, len(self.names), crc)
        self.f.seek(0)
        self.f.write(header.ljust(HEADER, b"\0"))


def put_layer(w: Writer, name: str, boxes, wkbs, attrs: list | None) -> None:
    w.put(f"{name}.box", np.ascontiguousarray(np.asarray(boxes, dtype="<f8").reshape(-1, 4)).tobytes())
    sizes = [len(b) for b in wkbs]
    w.put(f"{name}.off", np.concatenate([[0], np.cumsum(sizes, dtype=np.int64)]).astype("<u8").tobytes())
    w.begin(f"{name}.wkb")
    for b in wkbs:
        w.f.write(b)
    w.end(f"{name}.wkb")
    if attrs is not None:
        w.put(f"{name}.attr", json.dumps(attrs, default=str, separators=(",", ":")).encode())


def airspace_records(shp_path: Path):
    """(boxes, WKB, fields) of every Class B to E record, in the file's
    order: the records wingtip.airspace_at holds, each box the record's own."""
    import shapefile
    import wingtip_native

    shx = np.frombuffer(shp_path.with_suffix(".shx").read_bytes(), dtype=">i4", offset=100).reshape(-1, 2)
    starts, lengths = shx[:, 0].astype(np.int64) * 2 + 8, shx[:, 1].astype(np.int64) * 2
    with open(shp_path, "rb") as f, mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as shp:
        reader = shapefile.Reader(str(shp_path))
        boxes, wkbs, fields = [], [], []
        try:
            for i, record in enumerate(reader.iterRecords()):
                values = record.as_dict()
                if (values.get("CLASS") or "").strip() not in ("B", "C", "D", "E"):
                    continue
                content = shp[int(starts[i]) : int(starts[i] + lengths[i])]
                boxes.append(struct.unpack_from("<4d", content, 4))
                wkbs.append(wingtip_native.shape_to_wkb(content))
                fields.append(values)
        finally:
            reader.close()
    return boxes, wkbs, fields


def table(path: Path, columns: tuple, extra: dict[str, dict[str, str]] | None = None) -> bytes:
    """The NASR file's rows under `columns`, as JSON; with `extra`, a
    column after them for each of its names, its value by the field's ICAO
    or FAA ident, "" for none (wingtip.pack_airports: SIZE, HARD_FT)."""
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        rows = [[row.get(c) or "" for c in columns] for row in csv.DictReader(f)]
    names = list(columns)
    for name, by_ident in (extra or {}).items():
        icao, faa = columns.index("ICAO_ID"), columns.index("ARPT_ID")
        for r in rows:
            r.append(by_ident.get(r[icao].strip().upper()) or by_ident.get(r[faa].strip().upper()) or "")
        names.append(name)
    return json.dumps({"columns": names, "rows": rows}, separators=(",", ":")).encode()
