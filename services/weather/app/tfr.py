"""Temporary flight restrictions, the FAA's own, from tfr.faa.gov, fetched
and stored for the planner to read (wingtip.tfr). Moved from the planner's
wingtip.tfr (#535), which fetched them on the map's and a briefing's way.

The shapes are the site's GeoServer layer (TFR:V_TFR_LOC), one polygon
per area of each NOTAM, with its title and kind ("HAZARDS", "SECURITY",
"VIP", "SPACE OPERATIONS", "AIR SHOWS/SPORTS", "UAS PUBLIC GATHERING").
What a pilot needs besides -- when it is in force, how high it reaches,
why, under which rule -- is in each NOTAM's own XNOTAM file
(detail_6_6654.xml), read once per NOTAM and modification, eight at a
time, and read by the engine (wingtip_engine::tfr), the phones' same code.

A NOTAM's times in that file are UTC whatever time zone it names (the
zone is the one its text gives the times in). Its areas' floors and
ceilings are MSL ("ALT"), above the ground ("HEI") or a flight level
(feet "FL"); a NOTAM of several areas is given as the lowest floor and
the highest ceiling of them.

The list is stored with no limit of its own: a list kept through an
outage leaves out, as the planner reads it, any TFR whose NOTAM has
expired since (wingtip.tfr.all_tfrs).
"""

from __future__ import annotations

import json
import logging
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

import requests
import wingtip_native
from cachetools import LRUCache
from wingtip import weather_store

# The site turns away a bare python-requests User-Agent, as the FAA's
# others do (wingtip.faa_data).
from wingtip.config import FAA_HEADERS as HEADERS

log = logging.getLogger(__name__)

SHAPES_URL = (
    "https://tfr.faa.gov/geoserver/TFR/ows?service=WFS&version=1.1.0&request=GetFeature"
    "&typeName=TFR:V_TFR_LOC&outputFormat=application/json"
)
DETAIL_URL = "https://tfr.faa.gov/download/detail_{}.xml"

#: Each NOTAM's detail, by (id, modification): read once.
_DETAILS: LRUCache = LRUCache(maxsize=1024)


class TfrUnavailable(RuntimeError):
    """tfr.faa.gov did not answer."""


def parse_detail(xml_bytes: bytes) -> dict:
    """What a NOTAM's XNOTAM file says a pilot needs: {"effective",
    "expires" (ISO UTC; None until further notice), "rule", "purpose",
    "floor_ft", "floor_ref", "ceiling_ft", "ceiling_ref"} -- the lowest
    floor and the highest ceiling over its areas, a flight level in feet
    MSL. Read by the engine (wingtip_engine::tfr); a file that is not XML
    raises ElementTree's ParseError."""
    try:
        got = json.loads(wingtip_native.call("tfr_detail_read", json.dumps({"text": xml_bytes.decode("utf-8-sig")})))
    except (UnicodeDecodeError, ValueError) as e:
        raise ET.ParseError(str(e)) from e
    if got is None:
        return {}
    detail = got
    for key in ("floor_ft", "ceiling_ft"):
        if detail[key] is not None:
            detail[key] = float(detail[key])
    return detail


def _detail(notam_id: str, modified: str) -> dict:
    """A NOTAM's detail, read once per modification; nothing where its
    file cannot be had (the shape and title still stand), asked again at
    the next fetch."""
    key = (notam_id, modified)
    hit = _DETAILS.get(key)
    if hit is not None:
        return hit
    try:
        resp = requests.get(DETAIL_URL.format(notam_id.replace("/", "_")), headers=HEADERS, timeout=20)
        resp.raise_for_status()
        detail = parse_detail(resp.content)
    except (requests.RequestException, ET.ParseError):
        return {}
    _DETAILS[key] = detail
    return detail


def _shapes() -> list:
    """Every TFR area's GeoJSON feature; TfrUnavailable where the site does
    not answer."""
    try:
        resp = requests.get(SHAPES_URL, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        return resp.json().get("features", [])
    except (requests.RequestException, ValueError) as err:
        raise TfrUnavailable(f"tfr.faa.gov did not answer: {err}") from err


def tfrs(features: list) -> list:
    """Every TFR in force or to come, one per NOTAM: {"notam_id", "title",
    "kind", "state", "geometry" (GeoJSON, a MultiPolygon of its areas)}
    and its detail (parse_detail)."""
    by_notam: dict = {}
    for feature in features:
        props = feature.get("properties") or {}
        notam_id = (props.get("NOTAM_KEY") or "").split("-")[0]
        if not notam_id or not feature.get("geometry"):
            continue
        entry = by_notam.setdefault(
            notam_id,
            {
                "notam_id": notam_id,
                "title": props.get("TITLE"),
                "kind": (props.get("LEGAL") or "").title() or None,
                "state": props.get("STATE"),
                "modified": props.get("LAST_MODIFICATION_DATETIME") or "",
                "polygons": [],
            },
        )
        geometry = feature["geometry"]
        entry["polygons"].extend([geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"])
    entries = list(by_notam.values())
    with ThreadPoolExecutor(max_workers=8) as pool:
        details = list(pool.map(lambda e: _detail(e["notam_id"], e["modified"]), entries))
    return [
        {
            **{k: v for k, v in e.items() if k not in ("polygons", "modified")},
            "geometry": {"type": "MultiPolygon", "coordinates": e["polygons"]},
            **detail,
        }
        for e, detail in zip(entries, details)
    ]


def fetch() -> None:
    """The list fetched and stored ("tfrs"). Raises TfrUnavailable where
    tfr.faa.gov does not answer, the stored list left in place."""
    now = time.time()
    weather_store.write("tfrs", tfrs(_shapes()), fetched_at=now, until=None)
