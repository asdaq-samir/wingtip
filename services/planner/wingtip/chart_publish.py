"""Publishing a complete cycle's archives to S3, where the planner and the
CDN read them: the archives uploaded, then serving.json pointed at the
cycle so every planner switches at once.

The next cycle is published ahead of its date (the refresh task's
`stage_to_bucket`, charts.next_cycle) under next.json instead: every
planner takes it from 0901Z on its date (chart_serving's pointer), and
the first refresh after that moves serving.json on to it (`promote`).
Until then serving.json keeps the cycle in force, so the map never draws
an edition before its date nor an expired one past it.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path


from .config import CHART_TILES_PREFIX
from . import chart_archives, chart_render, chart_serving, config
from .chart_kinds import KINDS

log = logging.getLogger(__name__)

_PUBLISHED = "published.json"
#: The bucket's pointers: the cycle in force, and one staged ahead of its date.
SERVING_POINTER = "serving.json"
NEXT_POINTER = "next.json"
#: The pointer serving.json last replaced, kept so a bad cycle is undone by
#: copying it back (docs/RUNBOOKS.md, "A bad or late FAA cycle").
PREVIOUS_POINTER = "serving-previous.json"


def _client(client):
    if client is None:
        import boto3

        client = boto3.client("s3")
    return client


def bucket_pointer(bucket: str, prefix: str = CHART_TILES_PREFIX, client=None, pointer: str = SERVING_POINTER) -> dict | None:
    """One of the bucket's pointers, or None before it is first written.
    Any other failure raises: a refresh that cannot tell is better
    stopped (the next day's runs again) than spent drawing the country
    over again."""
    client = _client(client)
    try:
        body = client.get_object(Bucket=bucket, Key=f"{prefix}/{pointer}")["Body"].read()
    except client.exceptions.NoSuchKey:
        return None
    return json.loads(body)


def bucket_cycle(bucket: str, prefix: str = CHART_TILES_PREFIX, client=None, pointer: str = SERVING_POINTER) -> str | None:
    """The cycle the bucket's serving.json (or `pointer`) names, or None
    before the first publish."""
    held = bucket_pointer(bucket, prefix, client, pointer)
    return held.get("cycle") if held else None


def _put_pointer(client, bucket: str, prefix: str, pointer: str, body: dict) -> None:
    client.put_object(
        Bucket=bucket,
        Key=f"{prefix}/{pointer}",
        Body=json.dumps(body).encode(),
        ContentType="application/json",
        CacheControl="public, max-age=300",
    )


def _point_serving(client, bucket: str, prefix: str, body: dict) -> None:
    """serving.json written, the one it replaces kept as
    serving-previous.json where it named another cycle."""
    held = bucket_pointer(bucket, prefix, client)
    if held and held.get("cycle") != body.get("cycle"):
        _put_pointer(client, bucket, prefix, PREVIOUS_POINTER, held)
    _put_pointer(client, bucket, prefix, SERVING_POINTER, body)


def promote(bucket: str, prefix: str = CHART_TILES_PREFIX, client=None) -> str | None:
    """serving.json moved on to the cycle next.json names, once that cycle
    is in force: what the planners already draw since 0901Z, written down
    as the cycle in force, with nothing uploaded again. The cycle, or None
    where nothing was staged."""
    client = _client(client)
    ahead = bucket_pointer(bucket, prefix, client, NEXT_POINTER)
    if not ahead:
        return None
    _point_serving(client, bucket, prefix, {**ahead, "promoted_at": datetime.now(tz=timezone.utc).isoformat()})
    log.info("cycle %s, staged ahead, is now serving.json's", ahead["cycle"])
    return ahead["cycle"]


def _published_name(path: Path) -> str:
    """An archive's name in the bucket: its own (sec@2x) and a mark of
    its contents, so an archive packed again -- a sheet cleaned, a new
    renderer -- is a new object, and nothing a planner or the CDN keeps
    of the old one is read against the new one's directory."""
    import hashlib

    st = path.stat()
    mark = hashlib.sha256(f"{st.st_size}:{st.st_mtime_ns}".encode()).hexdigest()[:12]
    return f"{path.name.removesuffix('.pmtiles')}-{mark}.pmtiles"


def publish(cycle: str, bucket: str, prefix: str = CHART_TILES_PREFIX, client=None, ahead: bool = False) -> int:
    """Upload a complete cycle's archives (wingtip.tile_archive) to
    s3://bucket/prefix/<cycle>/, then point prefix/serving.json at the
    cycle -- each kind's archive by density, the revision -- so every
    planner switches at once; `ahead`, prefix/next.json instead, for a
    cycle not yet in force. The planner reads a tile from its archive
    by a range request; the archives were 1.4 million tile objects.
    Resumable: what was uploaded is remembered beside the archives, so a
    task killed half-way picks up where it stopped. Returns the archives
    uploaded."""
    client = _client(client)
    chart_archives.pack_complete(cycle)
    root = config.CHART_TILE_CACHE_DIR / cycle
    ledger = root / _PUBLISHED
    try:
        done = set(json.loads(ledger.read_text()))
    except (OSError, ValueError):
        done = set()
    archives: dict = {}
    uploaded = 0
    for path in sorted(root.glob("*.pmtiles")):
        stem = path.name.removesuffix(".pmtiles")
        kind_key, _, density = stem.partition("@")
        if kind_key not in KINDS:
            continue
        name = _published_name(path)
        if name not in done:
            # upload_file: in parts, a sectional's @2x archive being GBs.
            client.upload_file(
                str(path),
                bucket,
                f"{prefix}/{cycle}/{name}",
                ExtraArgs={"ContentType": "application/vnd.pmtiles", "CacheControl": "public, max-age=2419200, immutable"},
            )
            done.add(name)
            uploaded += 1
            chart_render.write_atomically(ledger, json.dumps(sorted(done)).encode())
            log.info("  %s uploaded as %s", path.name, name)
        archives.setdefault(kind_key, {})[density.removesuffix("x") or "1"] = name

    progress = chart_serving.pyramid_status(cycle)
    pointer = {
        "cycle": cycle,
        "kinds": {k: p["tiles"] for k, p in progress.items()},
        "scales": {k: p.get("scales", [1]) for k, p in progress.items()},
        "archives": archives,
        "revision": chart_serving.disk_revision(cycle),
        "published_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    if ahead:
        _put_pointer(client, bucket, prefix, NEXT_POINTER, pointer)
    else:
        _point_serving(client, bucket, prefix, pointer)
    log.info("cycle %s published: %d archives uploaded, %s points at it", cycle, uploaded, NEXT_POINTER if ahead else SERVING_POINTER)
    return uploaded
