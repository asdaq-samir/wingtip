"""An airplane's photo from Planespotters.net (wingtip.aircraft_photo), its
API stubbed with an answer in its documented shape
(planespotters.net/photo/api): the URLs passed on unchanged with the
photographer and the link, asked only with a contact set, kept a day."""

import pytest
import requests
from cachetools import TTLCache

from wingtip import aircraft_photo
from wingtip.config import get_settings

ANSWER = {
    "photos": [
        {
            "id": "000001",
            "thumbnail": {
                "src": "https://cdn.planespotters.net/33130/n654fl_PlanespottersNet_000001_t.jpg",
                "size": {"width": 200, "height": 133},
            },
            "thumbnail_large": {
                "src": "https://cdn.planespotters.net/33130/n654fl_PlanespottersNet_000001_280.jpg",
                "size": {"width": 420, "height": 280},
            },
            "link": "https://www.planespotters.net/photo/000001/n654fl-private-piper-pa-28-140",
            "photographer": "A Spotter",
        }
    ]
}


class Resp:
    def __init__(self, body, status=200):
        self.body, self.status_code = body, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))

    def json(self):
        return self.body


@pytest.fixture
def asked(monkeypatch):
    monkeypatch.setenv("PLANESPOTTERS_CONTACT", "https://example.org/contact")
    get_settings.cache_clear()
    monkeypatch.setattr(aircraft_photo, "_KEPT", TTLCache(maxsize=16, ttl=60))
    calls = []

    def get(url, headers, timeout):
        calls.append((url, headers["User-Agent"]))
        return Resp(ANSWER if url.endswith("/reg/N654FL") else {"photos": []})

    monkeypatch.setattr(aircraft_photo.outside, "get", get)
    yield calls
    get_settings.cache_clear()


def test_the_photo_with_its_photographer_and_link_its_urls_unchanged(asked):
    found = aircraft_photo.photo("a89c1e", "N654FL")
    assert found["thumbnail_large"] == ANSWER["photos"][0]["thumbnail_large"]["src"]
    assert (found["photographer"], found["link"], found["width"]) == ("A Spotter", ANSWER["photos"][0]["link"], 420)
    # By its address first, then its registration, naming us with a contact.
    assert [u.rsplit("/", 2)[-2] for u, _ in asked] == ["hex", "reg"]
    assert asked[0][1] == "WingtipMaps/1.0 (+https://example.org/contact)"
    # Kept: asked once a day.
    aircraft_photo.photo("a89c1e", "N654FL")
    assert len(asked) == 2


def test_none_without_a_contact_or_a_photo(asked, monkeypatch):
    assert aircraft_photo.photo(None, "N1FL") is None
    monkeypatch.delenv("PLANESPOTTERS_CONTACT")
    get_settings.cache_clear()
    assert aircraft_photo.photo("abcdef", "N2FL") is None
    assert [u for u, _ in asked] == ["https://api.planespotters.net/pub/photos/reg/N1FL"]


def test_a_failed_ask_is_not_kept(asked, monkeypatch):
    monkeypatch.setattr(aircraft_photo.outside, "get", lambda url, headers, timeout: Resp({}, 503))
    assert aircraft_photo.photo("a89c1e", "N654FL") is None
    assert len(aircraft_photo._KEPT) == 0
