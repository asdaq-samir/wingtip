"""Publishing a complete cycle's archives to S3, where the planner and the
CDN read them: the archives uploaded, then serving.json pointed at the
cycle so every planner switches at once.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path


from .config import CHART_TILES_PREFIX
from . import chart_archives, chart_cycle, chart_render, chart_serving, config
from .chart_kinds import KINDS

log = logging.getLogger(__name__)

_PUBLISHED = "published.json"


def bucket_pointer(bucket: str, prefix: str = CHART_TILES_PREFIX, client=None) -> dict | None:
    """The bucket's serving.json, or None before the first publish. Any
    other failure raises: a refresh that cannot tell is better stopped (the
    next day's runs again) than spent drawing the country over again."""
    if client is None:
        import boto3

        client = boto3.client("s3")
    try:
        body = client.get_object(Bucket=bucket, Key=f"{prefix}/serving.json")["Body"].read()
    except client.exceptions.NoSuchKey:
        return None
    return json.loads(body)


def bucket_cycle(bucket: str, prefix: str = CHART_TILES_PREFIX, client=None) -> str | None:
    """The cycle the bucket's serving.json has the planners draw now (its
    staged `next` once that is in force), or None before the first publish."""
    served = chart_serving.served_of(bucket_pointer(bucket, prefix, client))
    return served["cycle"] if served else None


def bucket_next(bucket: str, prefix: str = CHART_TILES_PREFIX, client=None) -> str | None:
    """The cycle staged in the bucket's serving.json `next`, or None."""
    ahead = (bucket_pointer(bucket, prefix, client) or {}).get("next")
    return ahead.get("cycle") if isinstance(ahead, dict) else None


def _published_name(path: Path) -> str:
    """An archive's name in the bucket: its own (sec@2x) and a mark of
    its contents, so an archive packed again -- a sheet cleaned, a new
    renderer -- is a new object, and nothing a planner or the CDN keeps
    of the old one is read against the new one's directory."""
    import hashlib

    st = path.stat()
    mark = hashlib.sha256(f"{st.st_size}:{st.st_mtime_ns}".encode()).hexdigest()[:12]
    return f"{path.name.removesuffix('.pmtiles')}-{mark}.pmtiles"


def publish(cycle: str, bucket: str, prefix: str = CHART_TILES_PREFIX, client=None) -> int:
    """Upload a complete cycle's archives (wingtip.tile_archive) to
    s3://bucket/prefix/<cycle>/, then point prefix/serving.json at the
    cycle -- each kind's archive by density, the revision -- so every
    planner switches at once; a cycle not yet in force into the pointer's
    `next`, which every planner switches to at 0901Z on its date. The planner reads a tile from its archive
    by a range request; the archives were 1.4 million tile objects.
    Resumable: what was uploaded is remembered beside the archives, so a
    task killed half-way picks up where it stopped. Returns the archives
    uploaded."""
    if client is None:
        import boto3

        client = boto3.client("s3")
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
    entry = {
        "cycle": cycle,
        "kinds": {k: p["tiles"] for k, p in progress.items()},
        "scales": {k: p.get("scales", [1]) for k, p in progress.items()},
        "archives": archives,
        "revision": chart_serving.disk_revision(cycle),
        "published_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    # A cycle not yet in force is staged as `next` beside the one served,
    # which the planners go over to at 0901Z on its date by their own clock
    # (chart_serving.served_of): published as the pointer itself, it was
    # drawn the moment it landed, before its date or hours after it.
    if chart_cycle.in_force(cycle):
        pointer = entry
    else:
        served = chart_serving.served_of(bucket_pointer(bucket, prefix, client)) or {}
        pointer = {**served, "next": entry}
    client.put_object(
        Bucket=bucket,
        Key=f"{prefix}/serving.json",
        Body=json.dumps(pointer).encode(),
        ContentType="application/json",
        CacheControl="public, max-age=300",
    )
    staged = "" if pointer is entry else " as next"
    log.info("cycle %s published: %d archives uploaded, serving.json points at it%s", cycle, uploaded, staged)
    return uploaded
