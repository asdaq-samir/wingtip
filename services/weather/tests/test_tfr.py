"""Temporary flight restrictions fetched from tfr.faa.gov and stored
(app.tfr), without the network: the shapes and the NOTAMs' details stubbed
with the site's own shapes. Moved from the planner's tests (#535)."""
from unittest.mock import Mock

import pytest
import requests
from wingtip import tfr as planner_tfr
from wingtip import weather_store

from app import tfr

# A trimmed copy of the site's detail_6_6654.xml: a fire-fighting TFR,
# its times in UTC, one area from the surface to 10,000 ft MSL.
DETAIL = b"""<XNOTAM-Update><Group><Add><Not>
  <dateEffective>2026-10-01T16:00:00</dateEffective><dateExpire>2026-10-15T02:00:00</dateExpire>
  <codeTimeZone>UTC</codeTimeZone>
  <txtDescrPurpose>TO PROVIDE A SAFE ENVIRONMENT FOR FIRE FIGHTING ACFT OPS</txtDescrPurpose>
  <TfrNot><codeType>91.137(a)(2)</codeType><TFRAreaGroup><aseTFRArea>
    <codeDistVerUpper>ALT</codeDistVerUpper><valDistVerUpper>10000</valDistVerUpper><uomDistVerUpper>FT</uomDistVerUpper>
    <codeDistVerLower>ALT</codeDistVerLower><valDistVerLower>0</valDistVerLower><uomDistVerLower>FT</uomDistVerLower>
  </aseTFRArea></TFRAreaGroup></TfrNot>
</Not></Add></Group></XNOTAM-Update>"""


def test_a_notams_detail_is_its_times_rule_purpose_and_altitudes():
    assert tfr.parse_detail(DETAIL) == {
        "effective": "2026-10-01T16:00:00Z", "expires": "2026-10-15T02:00:00Z",
        "rule": "relief aircraft operations (91.137(a)(2))",
        "purpose": "To provide a safe environment for fire fighting acft ops",
        "floor_ft": 0.0, "floor_ref": "MSL", "ceiling_ft": 10000.0, "ceiling_ref": "MSL",
    }


def test_a_height_above_the_ground_or_a_flight_level_is_said_so():
    agl = DETAIL.replace(b"<codeDistVerUpper>ALT", b"<codeDistVerUpper>HEI").replace(b">10000<", b">400<")
    assert tfr.parse_detail(agl)["ceiling_ref"] == "AGL"
    fl = DETAIL.replace(b">10000<", b">910<").replace(b"<uomDistVerUpper>FT", b"<uomDistVerUpper>FL")
    assert tfr.parse_detail(fl)["ceiling_ft"] == 91000.0


def _square(lat, lon, half=0.05):
    corners = [(lon - half, lat - half), (lon + half, lat - half), (lon + half, lat + half), (lon - half, lat + half)]
    return [[list(c) for c in corners + corners[:1]]]


def test_the_list_is_one_tfr_per_notam_with_its_detail_and_stored(monkeypatch):
    features = [
        {"properties": {"NOTAM_KEY": "6/1-1-FDC-F", "TITLE": "ON IT", "LEGAL": "SECURITY", "LAST_MODIFICATION_DATETIME": "1"},
         "geometry": {"type": "Polygon", "coordinates": _square(42.5, -88.0)}},
        # A second area of the same NOTAM joins the first.
        {"properties": {"NOTAM_KEY": "6/1-2-FDC-F", "TITLE": "ON IT", "LEGAL": "SECURITY", "LAST_MODIFICATION_DATETIME": "1"},
         "geometry": {"type": "Polygon", "coordinates": _square(42.6, -88.0)}},
    ]
    asked = []

    def get(url, headers=None, timeout=None):
        asked.append((url, headers))
        if "detail_" in url:
            return Mock(content=DETAIL, raise_for_status=lambda: None)
        return Mock(json=lambda: {"features": features}, raise_for_status=lambda: None)

    monkeypatch.setattr(tfr, "_DETAILS", tfr.LRUCache(maxsize=8))
    monkeypatch.setattr(tfr.requests, "get", get)
    tfr.fetch()
    stored = weather_store.read("tfrs").data
    assert [(t["notam_id"], t["kind"], len(t["geometry"]["coordinates"])) for t in stored] == [("6/1", "Security", 2)]
    assert stored[0]["expires"] == "2026-10-15T02:00:00Z"
    assert [u for u, _ in asked if "detail_" in u] == ["https://tfr.faa.gov/download/detail_6_1.xml"]
    # The FAA's sites turn away a bare python-requests User-Agent.
    assert all("Mozilla" in h["User-Agent"] for _, h in asked)
    # Read once per NOTAM and modification.
    tfr.fetch()
    assert len([u for u, _ in asked if "detail_" in u]) == 1
    assert planner_tfr.fetched_at() is not None


def test_a_failed_fetch_leaves_the_list_stored_before(monkeypatch):
    weather_store.write("tfrs", [{"notam_id": "6/1"}], fetched_at=100.0, until=None)

    def down(*a, **kw):
        raise requests.ConnectionError("no route to host")

    monkeypatch.setattr(tfr.requests, "get", down)
    with pytest.raises(tfr.TfrUnavailable):
        tfr.fetch()
    assert weather_store.read("tfrs").data == [{"notam_id": "6/1"}]
