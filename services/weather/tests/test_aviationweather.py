"""aviationweather.gov's cache files fetched, parsed and stored (app.aviationweather),
and read back as the planner reads them (wingtip.weather): the store is the
contract between the two, so the planner's readers are tested here over
what this service writes. Moved from the planner's tests of wingtip.weather
(#535); the network is stubbed with files in the real files' schema."""

import gzip
import time
from datetime import datetime, timezone
from unittest.mock import MagicMock, Mock, patch

import pytest
import requests
from wingtip import weather, weather_store
from wingtip.weather import ceiling_visibility_along_route, hazards_along_route, metar_for_idents

from app import aviationweather, fetch

C81, KDLH = (42.3172, -88.0905), (46.8421, -92.1936)
T0200Z = datetime(2026, 9, 20, 2, 0, tzinfo=timezone.utc).timestamp()


def _cache_file(body: str) -> Mock:
    """What requests.get returns for one of aviationweather.gov's gzipped
    XML cache files, in the schema the real files use."""
    xml = f'<?xml version="1.0" encoding="UTF-8"?><response version="2.0"><data>{body}</data></response>'
    resp = Mock(status_code=200, headers={})
    resp.raise_for_status = Mock()
    resp.content = gzip.compress(xml.encode())
    return resp


METARS = _cache_file(
    # KDLH twice: an older report and a newer SPECI, to prove the newest wins.
    '<METAR><raw_text>KDLH 200053Z 30012KT 10SM SCT018 BKN023 11/10 A3005</raw_text><station_id>KDLH</station_id>'
    '<observation_time>2026-09-20T00:53:00.000Z</observation_time><temp_c>11</temp_c><dewpoint_c>10</dewpoint_c>'
    '<wind_dir_degrees>300</wind_dir_degrees><wind_speed_kt>12</wind_speed_kt><visibility_statute_mi>10+</visibility_statute_mi>'
    '<sky_condition sky_cover="SCT" cloud_base_ft_agl="1800"/><sky_condition sky_cover="BKN" cloud_base_ft_agl="2300"/>'
    '<flight_category>MVFR</flight_category></METAR>'
    '<METAR><raw_text>SPECI KDLH 200153Z VRB03KT 10SM CLR 10/09 A3006</raw_text><station_id>KDLH</station_id>'
    '<observation_time>2026-09-20T01:53:00.000Z</observation_time><temp_c>10</temp_c><dewpoint_c>9</dewpoint_c>'
    '<wind_dir_degrees>VRB</wind_dir_degrees><wind_speed_kt>3</wind_speed_kt><visibility_statute_mi>10+</visibility_statute_mi>'
    '<flight_category>VFR</flight_category></METAR>'
    '<METAR><raw_text>KORD 200151Z 09008KT 2SM BR OVC006 14/13 A2998</raw_text><station_id>KORD</station_id>'
    '<observation_time>2026-09-20T01:51:00.000Z</observation_time><visibility_statute_mi>2</visibility_statute_mi>'
    '<sky_condition sky_cover="OVC" cloud_base_ft_agl="600"/><flight_category>IFR</flight_category></METAR>'
)

TAFS = _cache_file(
    # Periods listed newest-first, as the real file does.
    '<TAF><raw_text>TAF KDLH 200000Z 2000/2024 ...</raw_text><station_id>KDLH</station_id>'
    '<issue_time>2026-09-20T00:00:00.000Z</issue_time><latitude>46.8421</latitude><longitude>-92.1936</longitude>'
    '<elevation_m>434.0</elevation_m>'
    '<forecast><fcst_time_from>2026-09-20T06:00:00.000Z</fcst_time_from><fcst_time_to>2026-09-20T12:00:00.000Z</fcst_time_to>'
    '<change_indicator>FM</change_indicator><visibility_statute_mi>6+</visibility_statute_mi>'
    '<sky_condition sky_cover="BKN" cloud_base_ft_agl="4000"/></forecast>'
    '<forecast><fcst_time_from>2026-09-20T00:00:00.000Z</fcst_time_from><fcst_time_to>2026-09-20T06:00:00.000Z</fcst_time_to>'
    '<visibility_statute_mi>3</visibility_statute_mi><sky_condition sky_cover="OVC" cloud_base_ft_agl="1500"/></forecast></TAF>'
    # Far off the route: must be ignored however bad it is.
    '<TAF><station_id>KLAX</station_id><issue_time>2026-09-20T00:00:00.000Z</issue_time>'
    '<latitude>33.9425</latitude><longitude>-118.408</longitude>'
    '<forecast><fcst_time_from>2026-09-20T00:00:00.000Z</fcst_time_from><fcst_time_to>2026-09-20T12:00:00.000Z</fcst_time_to>'
    '<visibility_statute_mi>1</visibility_statute_mi><sky_condition sky_cover="OVC" cloud_base_ft_agl="200"/></forecast></TAF>'
)


def _sigmet(name: str, valid_to: str, points: list) -> str:
    area = "".join(f"<point><longitude>{lon}</longitude><latitude>{lat}</latitude></point>" for lat, lon in points)
    return (
        f'<AIRSIGMET><raw_text>{name}</raw_text><valid_time_from>2026-09-20T00:55:00.000Z</valid_time_from>'
        f'<valid_time_to>{valid_to}</valid_time_to><altitude max_ft_msl="43000"/><hazard type="CONVECTIVE" severity="SEV"/>'
        f'<airsigmet_type>SIGMET</airsigmet_type><area num_points="{len(points)}">{area}</area></AIRSIGMET>'
    )


ON_ROUTE = [(43.0, -91.0), (43.0, -89.0), (46.0, -89.0), (46.0, -91.0), (43.0, -91.0)]
FLORIDA = [(29.3, -79.2), (24.4, -78.8), (24.6, -83.5), (29.3, -79.2)]
AIRSIGMETS = _cache_file(
    _sigmet("CONVECTIVE SIGMET 1C", "2026-09-20T02:55:00.000Z", ON_ROUTE)
    + _sigmet("CONVECTIVE SIGMET 1E", "2026-09-20T02:55:00.000Z", FLORIDA)
    + _sigmet("CONVECTIVE SIGMET 9C (expired)", "2026-09-20T01:00:00.000Z", ON_ROUTE)
)


@pytest.fixture
def clock_0200z(monkeypatch):
    """Now is 0200Z on the 20th, when the forecasts below are current."""
    monkeypatch.setattr(time, "time", lambda: T0200Z)


def _serve(name: str, answer: Mock, at: float = T0200Z) -> None:
    """`name` fetched from a stubbed aviationweather.gov at `at` and stored."""
    with patch("app.fetch.requests.get", return_value=answer), patch("app.aviationweather.time.time", return_value=at):
        aviationweather.fetch_source(name)


# --- fetched from the cache files, stored, read by the planner ---------------


def test_the_metars_are_the_newest_report_per_station_from_the_cache_file():
    with patch("app.fetch.requests.get", return_value=METARS) as mock_get:
        aviationweather.fetch_source("metars")
    assert mock_get.call_args.args[0] == "https://aviationweather.gov/data/cache/metars.cache.xml.gz"
    assert mock_get.call_args.kwargs["headers"]["User-Agent"].startswith("wingtip-maps/")  # wingtip.config.REQUEST_HEADERS, every ask
    result = metar_for_idents(["KDLH", "KORD", "C81"])
    assert result["KDLH"]["flight_category"] == "VFR"  # the 0153Z SPECI, not the 0053Z METAR
    assert result["KDLH"]["ceiling_ft"] is None  # CLR
    assert result["KDLH"]["wind_dir_true_deg"] is None  # VRB
    assert result["KDLH"]["wind_speed_kt"] == 3.0
    assert result["KORD"] == {
        "raw": "KORD 200151Z 09008KT 2SM BR OVC006 14/13 A2998",
        "observed_at": "2026-09-20T01:51:00.000Z",
        "flight_category": "IFR",
        "wx": "",
        "ceiling_ft": 600,
        "ceiling_unknown": False,
        "ceiling_cover": "OVC",  # the ceiling layer's own, for the station model's "OVC 006"
        "visibility_sm": 2.0,
        "wind_dir_true_deg": None,
        "wind_speed_kt": None,
        "wind_gust_kt": None,
        "altimeter_in_hg": None,
        "temp_c": None,
        "dewpoint_c": None,
        "lat": None,
        "lon": None,
    }
    assert result["C81"] is None


def test_metars_are_kept_however_long_an_outage_with_their_own_times():
    """Each METAR carries its own observation time, which the pilot sees,
    so the stored copy is served through an outage of any length
    (FAA-H-8083-28B 24.4.1; the owner's call of 2026-11-04). The products with a validity
    of their own run out: the TAF and SIGMET tests below."""
    _serve("metars", METARS)
    assert weather_store.read("metars").until is None
    with (
        patch("app.fetch.requests.get", side_effect=requests.ConnectionError("no route to host")),
        patch("tenacity.nap.time.sleep"),
        pytest.raises(fetch.FetchFailed),
    ):
        aviationweather.fetch_source("metars")
    with patch("wingtip.weather_store.time.time", return_value=T0200Z + 6 * 3600):
        report = metar_for_idents(["KORD"])["KORD"]
    assert report["observed_at"] == "2026-09-20T01:51:00.000Z"
    assert weather.dataset_status()["metars"] == T0200Z


def test_a_taf_set_is_served_to_the_end_of_its_latest_period_and_no_further():
    _serve("tafs", TAFS)
    ends = datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc).timestamp()  # the latest period above
    with patch("wingtip.weather_store.time.time", return_value=ends - 60):
        assert weather._dataset("tafs")[0]["icaoId"] == "KDLH"
    with (
        patch("wingtip.weather_store.time.time", return_value=ends + 120),
        pytest.raises(weather.WeatherServiceError, match="TAFs unavailable"),
    ):
        weather._dataset("tafs")


def test_sigmets_are_served_until_the_last_of_them_ends():
    _serve("airsigmets", AIRSIGMETS)
    ends = datetime(2026, 9, 20, 2, 55, tzinfo=timezone.utc).timestamp()  # the latest valid_to above
    with patch("wingtip.weather_store.time.time", return_value=ends - 60):
        assert len(weather._dataset("airsigmets")) == 3
    with patch("wingtip.weather_store.time.time", return_value=ends + 120), pytest.raises(weather.WeatherServiceError):
        weather._dataset("airsigmets")


def test_the_forecast_along_the_route_reads_each_nearby_stations_current_period():
    _serve("tafs", TAFS)
    with patch("wingtip.weather.time.time", return_value=T0200Z):
        forecast = ceiling_visibility_along_route(C81, KDLH)
    # Where each station is and how high its field: a ceiling is above
    # the field, and wingtip.altitude keeps a leg under the clouds in MSL.
    assert forecast["stations"] == [
        {
            "icaoId": "KDLH",
            "lat": 46.8421,
            "lon": -92.1936,
            "elevation_ft": 1424,
            "ceiling_ft": 1500,
            "ceiling_unknown": False,
            "visibility_sm": 3.0,
        }
    ]
    assert forecast["min_ceiling_ft"] == 1500 and forecast["min_visibility_sm"] == 3.0


def test_hazards_along_the_route_are_the_current_sigmets_the_line_crosses():
    _serve("airsigmets", AIRSIGMETS)
    with patch("wingtip.weather.time.time", return_value=T0200Z):
        hazards = hazards_along_route(C81, KDLH)
    assert [{k: h[k] for k in ("hazard", "type", "altitude_low_ft", "altitude_high_ft", "raw")} for h in hazards] == [
        {"hazard": "CONVECTIVE", "type": "SIGMET", "altitude_low_ft": None, "altitude_high_ft": 43000.0, "raw": "CONVECTIVE SIGMET 1C"}
    ]
    # With its valid times and its area, for the briefing to say where
    # and when the flight meets it; no WMO heading here, so no issue time.
    start = datetime(2026, 9, 20, 0, 55, tzinfo=timezone.utc).timestamp()
    assert (hazards[0]["valid_from"], hazards[0]["valid_to"]) == (start, start + 2 * 3600)
    assert hazards[0]["coords"] == [list(p) for p in ON_ROUTE] and hazards[0]["issued"] is None


def test_a_sigmets_issue_time_is_its_wmo_headings_day_hour_and_minute():
    """WSUS32 KKCI 261655: issued the 26th at 1655Z (WMO-No. 386's
    abbreviated heading), in the month of its valid time -- the month
    before for the 31st read on the 1st."""

    def issued(raw, valid):
        xml = (
            f"<response><data><AIRSIGMET><raw_text>{raw}</raw_text><valid_time_from>{valid}</valid_time_from></AIRSIGMET></data></response>"
        ).encode()
        return aviationweather.SOURCES["airsigmets"][1](xml)[0]["issued"]

    assert issued("WSUS32 KKCI 261655\nSIGC\nCONVECTIVE SIGMET 45C", "2026-10-26T16:55:00Z") == "2026-10-26T16:55:00Z"
    assert issued("WSUS31 KKCI 312355 SIGE", "2026-11-01T00:55:00Z") == "2026-10-31T23:55:00Z"
    assert issued("CONVECTIVE SIGMET 1C", "2026-10-26T16:55:00Z") is None


# --- failures --------------------------------------------------------------


def test_a_certificate_failure_is_not_retried():
    """An expired or untrusted certificate fails the same way every time;
    the back-off would only delay the same answer by six seconds."""
    with (
        patch("app.fetch.requests.get", side_effect=requests.exceptions.SSLError("certificate has expired")) as mock_get,
        patch("tenacity.nap.time.sleep") as mock_sleep,
    ):
        with pytest.raises(fetch.FetchFailed, match="certificate has expired"):
            aviationweather.fetch_source("metars")
    assert mock_get.call_count == 1
    mock_sleep.assert_not_called()
    # Nothing stored: the planner says the METARs cannot be had.
    with pytest.raises(weather.WeatherServiceError, match="METARs unavailable"):
        metar_for_idents(["C81"])


def test_a_request_refused_as_asked_is_not_retried_and_one_too_many_is():
    """The windtemp API's 400 since its tables were discontinued (NWS SCN
    26-47) is the same answer on every try: three tries and their back-off
    put 6.5 s on a plan. A 429 asks to be tried later, and is."""
    refused = Mock(status_code=400, text='{"status":"error","error":"Wind/temp tables have been discontinued"}')
    with patch("app.fetch.requests.get", return_value=refused) as mock_get, patch("tenacity.nap.time.sleep") as mock_sleep:
        with pytest.raises(fetch.FetchFailed, match="refused: 400"):
            fetch.get("https://aviationweather.gov/api/data/windtemp", {"fcst": "06"})
    assert mock_get.call_count == 1
    mock_sleep.assert_not_called()

    busy = Mock(status_code=429, text="slow down")
    busy.raise_for_status.side_effect = requests.HTTPError("429 Client Error")
    with patch("app.fetch.requests.get", return_value=busy) as mock_get, patch("tenacity.nap.time.sleep"):
        with pytest.raises(fetch.FetchFailed, match="after 3 attempts"):
            fetch.get("https://aviationweather.gov/api/data/windtemp", {"fcst": "06"})
    assert mock_get.call_count == 3


def test_an_unchanged_product_is_not_downloaded_or_parsed_again(monkeypatch):
    """The stored copy's ETag asks whether it has changed: a 304 keeps it,
    stored again as fetched now."""
    first = MagicMock(
        status_code=200, content=gzip.compress(b"<response/>"), headers={"ETag": '"abc"', "Last-Modified": "Wed, 07 Oct 2026 16:11:35 GMT"}
    )
    unchanged = MagicMock(status_code=304, content=b"", headers={"ETag": '"abc"'})
    asked = []

    def get(url, params=None, headers=None, timeout=None):
        asked.append(headers)
        return first if len(asked) == 1 else unchanged

    parsed = []

    def parse(body):
        parsed.append(1)
        return ["held"]

    monkeypatch.setattr(fetch.requests, "get", get)
    monkeypatch.setitem(aviationweather.SOURCES, "airsigmets", ("https://example/airsigmets", parse, lambda data, at: at + 3 * 3600))
    aviationweather.fetch_source("airsigmets")
    aviationweather.fetch_source("airsigmets")
    assert weather._dataset("airsigmets") == ["held"]
    assert parsed == [1]
    assert asked[1]["If-None-Match"] == '"abc"' and asked[1]["If-Modified-Since"] == "Wed, 07 Oct 2026 16:11:35 GMT"


# --- reading a TAF over the flight's own hours ------------------------------


def _taf(periods: str) -> Mock:
    return _cache_file(
        '<TAF><raw_text>TAF KDLH ...</raw_text><station_id>KDLH</station_id>'
        '<issue_time>2026-09-20T00:00:00.000Z</issue_time><latitude>46.8421</latitude><longitude>-92.1936</longitude>'
        f'{periods}</TAF>'
    )


def _fcst(start: str, end: str, change: str = "", vis: str = "6+", sky: str = "", vv: str = "") -> str:
    return (
        f'<forecast><fcst_time_from>2026-09-20T{start}:00:00.000Z</fcst_time_from>'
        f'<fcst_time_to>2026-09-20T{end}:00:00.000Z</fcst_time_to>'
        + (f"<change_indicator>{change}</change_indicator>" if change else "")
        + f"<visibility_statute_mi>{vis}</visibility_statute_mi>{sky}"
        + (f"<vert_vis_ft>{vv}</vert_vis_ft>" if vv else "")
        + "</forecast>"
    )


def _at(hour: int) -> float:
    return datetime(2026, 9, 20, hour, tzinfo=timezone.utc).timestamp()


FOG_IN_A_TEMPO = _taf(
    _fcst("00", "12", sky='<sky_condition sky_cover="SCT" cloud_base_ft_agl="5000"/>')
    + _fcst("04", "06", change="TEMPO", vis="0.5", sky='<sky_condition sky_cover="OVX"/>', vv="200")
)


@pytest.mark.usefixtures("clock_0200z")
def test_a_tempo_group_counts_toward_the_worst_the_forecast_allows():
    """TEMPO 1/2SM FG VV002 inside an otherwise VFR period: a go/no-go read
    is the worst the forecast allows, and vertical visibility is a ceiling."""
    _serve("tafs", FOG_IN_A_TEMPO)
    during = ceiling_visibility_along_route(C81, KDLH, window=(_at(3), _at(5)))
    assert during["min_ceiling_ft"] == 200 and during["min_visibility_sm"] == 0.5

    before = ceiling_visibility_along_route(C81, KDLH, window=(_at(1), _at(2)))
    assert before["min_ceiling_ft"] is None and before["min_visibility_sm"] == 6.0


@pytest.mark.usefixtures("clock_0200z")
def test_a_forecast_that_does_not_cover_the_flight_says_nothing_about_it():
    """It used to fall back to the TAF's first period -- an expired
    forecast read as current."""
    _serve("tafs", _taf(_fcst("00", "06", vis="3")))
    later = ceiling_visibility_along_route(C81, KDLH, window=(_at(8), _at(10)))
    assert later == {"min_ceiling_ft": None, "min_visibility_sm": None, "ceiling_unknown_at": [], "stations": []}


@pytest.mark.usefixtures("clock_0200z")
def test_a_becmg_change_lasts_past_its_own_window():
    """BECMG 0203 ... 2SM BKN008 still holds at 0600: the feed carries no
    base period after it, so taking only what overlaps 0600 read VFR."""
    _serve(
        "tafs",
        _taf(
            _fcst("00", "12", vis="6+")
            + _fcst("02", "03", change="BECMG", vis="2", sky='<sky_condition sky_cover="BKN" cloud_base_ft_agl="800"/>')
        ),
    )
    later = ceiling_visibility_along_route(C81, KDLH, window=(_at(6), _at(7)))
    assert later["min_ceiling_ft"] == 800 and later["min_visibility_sm"] == 2.0


@pytest.mark.usefixtures("clock_0200z")
def test_a_station_is_read_for_when_the_flight_is_there():
    """The fog in the TEMPO at 04-06Z is what a pilot arriving at 05Z is
    told, and not one arriving at 01Z: each place over its own hour."""
    _serve("tafs", FOG_IN_A_TEMPO)
    assert weather.tafs_over({"KDLH": (_at(4), _at(6))}) == {
        "KDLH": {"ceiling_ft": 200, "ceiling_unknown": False, "visibility_sm": 0.5, "covers": True, "raw": "TAF KDLH ..."}
    }
    assert weather.tafs_over({"KDLH": (_at(0), _at(2))})["KDLH"]["visibility_sm"] == 6.0
    # One with no TAF held is left out; asked for none, nothing is read.
    assert weather.tafs_over({"KXXX": (_at(0), _at(2))}) == {}
    assert weather.tafs_over({}) == {}


# A layer a station could not measure ("OVC///", "VV///") comes in the
# AWC's data API with no base: its sky_condition has no cloud_base_ft_agl.
UNMEASURED = _cache_file(
    # OVC/// with ten miles: the AWC's own category says VFR.
    '<METAR><raw_text>KAAA 200153Z AUTO 00000KT 10SM OVC/// 10/09 A3006</raw_text><station_id>KAAA</station_id>'
    '<observation_time>2026-09-20T01:53:00.000Z</observation_time><visibility_statute_mi>10+</visibility_statute_mi>'
    '<sky_condition sky_cover="OVC"/><flight_category>VFR</flight_category></METAR>'
    # BKN/// above a measured broken layer: the lower one is the ceiling.
    '<METAR><raw_text>KBBB 200153Z AUTO 00000KT 10SM BKN012 OVC/// 10/09 A3006</raw_text><station_id>KBBB</station_id>'
    '<observation_time>2026-09-20T01:53:00.000Z</observation_time><visibility_statute_mi>10+</visibility_statute_mi>'
    '<sky_condition sky_cover="BKN" cloud_base_ft_agl="1200"/><sky_condition sky_cover="OVC"/>'
    '<flight_category>MVFR</flight_category></METAR>'
    # BKN/// under a measured overcast: the ceiling is not known.
    '<METAR><raw_text>KCCC 200153Z AUTO 00000KT 10SM FEW008 BKN/// OVC025 10/09 A3006</raw_text><station_id>KCCC</station_id>'
    '<observation_time>2026-09-20T01:53:00.000Z</observation_time><visibility_statute_mi>10+</visibility_statute_mi>'
    '<sky_condition sky_cover="FEW" cloud_base_ft_agl="800"/><sky_condition sky_cover="BKN"/>'
    '<sky_condition sky_cover="OVC" cloud_base_ft_agl="2500"/><flight_category>MVFR</flight_category></METAR>'
    # VV/// in fog: the visibility settles LIFR whatever the ceiling.
    '<METAR><raw_text>KDDD 200153Z AUTO 00000KT 1/4SM FG VV/// 10/10 A3006</raw_text><station_id>KDDD</station_id>'
    '<observation_time>2026-09-20T01:53:00.000Z</observation_time><visibility_statute_mi>0.25</visibility_statute_mi>'
    '<sky_condition sky_cover="OVX"/><flight_category>LIFR</flight_category></METAR>'
)


def test_a_ceiling_reported_with_no_height_is_not_known():
    """14 CFR 1.1: the ceiling is the lowest broken, overcast or obscured
    layer, so one reported with no height leaves it not known -- not
    none, and so not VFR."""
    _serve("metars", UNMEASURED)
    found = metar_for_idents(["KAAA", "KBBB", "KCCC", "KDDD"])
    sky = {i: (m["ceiling_ft"], m["ceiling_unknown"], m["flight_category"]) for i, m in found.items()}
    assert sky == {"KAAA": (None, True, None), "KBBB": (1200, False, "MVFR"), "KCCC": (None, True, None), "KDDD": (None, True, "LIFR")}


def test_vfr_not_recommended_says_a_ceiling_of_unknown_height():
    _serve("metars", UNMEASURED)
    metars = metar_for_idents(["KAAA", "KBBB"])
    forecast = {"min_ceiling_ft": None, "min_visibility_sm": 6.0, "ceiling_unknown_at": ["KDLH"], "stations": []}
    assert weather.vfr_not_recommended_reasons(["KAAA", "KBBB"], metars, forecast) == [
        "KAAA currently reporting a ceiling of unknown height",
        "forecast ceiling of unknown height at KDLH",
    ]


@pytest.mark.usefixtures("clock_0200z")
def test_a_forecast_ceiling_with_no_height_is_not_known():
    """TEMPO OVC/// under a BKN040 forecast: the worst ceiling the forecast
    allows is not known, so 4,000 ft is not the whole of it."""
    _serve(
        "tafs",
        _taf(
            _fcst("00", "12", vis="6+", sky='<sky_condition sky_cover="BKN" cloud_base_ft_agl="4000"/>')
            + _fcst("04", "06", change="TEMPO", vis="6+", sky='<sky_condition sky_cover="OVC"/>')
        ),
    )
    during = ceiling_visibility_along_route(C81, KDLH, window=(_at(3), _at(5)))
    assert (during["min_ceiling_ft"], during["ceiling_unknown_at"]) == (4000, ["KDLH"])
    assert during["stations"][0]["ceiling_unknown"] is True
    before = ceiling_visibility_along_route(C81, KDLH, window=(_at(1), _at(2)))
    assert (before["min_ceiling_ft"], before["ceiling_unknown_at"]) == (4000, [])
    assert weather.tafs_over({"KDLH": (_at(4), _at(5))})["KDLH"]["ceiling_unknown"] is True


# --- the wind forecast at a field for a time ---

WINDY_TAFS = _cache_file(
    '<TAF><raw_text>TAF KDLH ...</raw_text><station_id>KDLH</station_id><issue_time>2026-09-20T00:00:00.000Z</issue_time>'
    '<latitude>46.8421</latitude><longitude>-92.1936</longitude><elevation_m>434.0</elevation_m>'
    '<forecast><fcst_time_from>2026-09-20T00:00:00.000Z</fcst_time_from><fcst_time_to>2026-09-20T06:00:00.000Z</fcst_time_to>'
    '<wind_dir_degrees>270</wind_dir_degrees><wind_speed_kt>10</wind_speed_kt></forecast>'
    '<forecast><fcst_time_from>2026-09-20T02:00:00.000Z</fcst_time_from><fcst_time_to>2026-09-20T04:00:00.000Z</fcst_time_to>'
    '<change_indicator>TEMPO</change_indicator><wind_dir_degrees>360</wind_dir_degrees><wind_speed_kt>25</wind_speed_kt></forecast>'
    '<forecast><fcst_time_from>2026-09-20T06:00:00.000Z</fcst_time_from><fcst_time_to>2026-09-20T12:00:00.000Z</fcst_time_to>'
    '<change_indicator>FM</change_indicator><wind_dir_degrees>090</wind_dir_degrees><wind_speed_kt>8</wind_speed_kt>'
    '<wind_gust_kt>18</wind_gust_kt></forecast>'
    '<forecast><fcst_time_from>2026-09-20T09:00:00.000Z</fcst_time_from><fcst_time_to>2026-09-20T10:00:00.000Z</fcst_time_to>'
    '<change_indicator>BECMG</change_indicator><wind_dir_degrees>VRB</wind_dir_degrees><wind_speed_kt>4</wind_speed_kt></forecast></TAF>'
)


def test_the_wind_forecast_at_a_field_is_the_prevailing_one_then_never_a_tempo():
    """For the runway a flight will find in use when it gets there (the
    owner's pick, 2026-10-20), the TAF's prevailing wind at that time."""
    _serve("tafs", WINDY_TAFS)
    at = lambda h: datetime(2026, 9, 20, h, 0, tzinfo=timezone.utc).timestamp()  # noqa: E731
    with patch("wingtip.weather.time.time", return_value=T0200Z):
        # Mid TEMPO: the base period's 270 at 10, not the TEMPO's 25 kt.
        three = weather.forecast_wind(*KDLH, at(3), "KDLH")
        assert (three["ident"], three["distance_nm"], three["dir_true_deg"], three["speed_kt"]) == ("KDLH", 0.0, 270.0, 10.0)
        seven = weather.forecast_wind(*KDLH, at(7), "KDLH")
        assert (seven["dir_true_deg"], seven["speed_kt"], seven["gust_kt"]) == (90.0, 8.0, 18.0)
        # A BECMG lasts past its own hour, to the end of the forecast: variable.
        eleven = weather.forecast_wind(*KDLH, at(11), "KDLH")
        assert (eleven["dir_true_deg"], eleven["speed_kt"]) == (None, 4.0)
        # Past the TAF's end, none.
        assert weather.forecast_wind(*KDLH, at(13), "KDLH") is None


def test_a_field_without_a_taf_has_the_nearest_ones_within_thirty_miles():
    _serve("tafs", WINDY_TAFS)
    at = datetime(2026, 9, 20, 7, 0, tzinfo=timezone.utc).timestamp()
    with patch("wingtip.weather.time.time", return_value=T0200Z):
        near = weather.forecast_wind(46.70, -92.20, at, "KSUW")
        assert near["ident"] == "KDLH" and 8 < near["distance_nm"] < 9
        assert weather.forecast_wind(*C81, at, "C81") is None


# --- PIREPs and G-AIRMETs, parsed ---

PIREP_XML = b"""<response><data>
<AircraftReport><observation_time>{now}</observation_time><aircraft_ref>C172</aircraft_ref><latitude>42.5</latitude>
  <longitude>-88.1</longitude><altitude_ft_msl>5500</altitude_ft_msl><turbulence_condition turbulence_intensity="MOD" />
  <icing_condition icing_intensity="NEG" /><report_type>PIREP</report_type><raw_text>UA /OV ... /TB MOD</raw_text></AircraftReport>
<AircraftReport><observation_time>{now}</observation_time><aircraft_ref>B738</aircraft_ref><latitude>42.6</latitude>
  <longitude>-88.0</longitude><altitude_ft_msl>36000</altitude_ft_msl><report_type>PIREP</report_type>
  <raw_text>UA FL360</raw_text></AircraftReport>
<AircraftReport><observation_time>{now}</observation_time><latitude>54.0</latitude><longitude>-50.0</longitude>
  <altitude_ft_msl>37000</altitude_ft_msl><report_type>AIREP</report_type><raw_text>ARP</raw_text></AircraftReport>
<AircraftReport><observation_time>{now}</observation_time><latitude>42.5</latitude><longitude>-80.0</longitude>
  <altitude_ft_msl>4000</altitude_ft_msl><report_type>Urgent PIREP</report_type><raw_text>UUA far east</raw_text></AircraftReport>
</data></response>"""


def test_the_pilot_reports_are_the_pireps_not_the_airliners_position_reports():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z").encode()
    _serve(
        "pireps",
        Mock(status_code=200, headers={}, content=gzip.compress(PIREP_XML.replace(b"{now}", now)), raise_for_status=Mock()),
        at=time.time(),
    )
    reports = weather._dataset("pireps")
    assert [r["aircraft"] for r in reports] == ["C172", "B738", None]  # the AIREP left out
    assert reports[2]["urgent"] is True
    near = weather.pireps_along_route([(42.0, -88.0), (43.0, -88.0)])
    assert [(r["aircraft"], r["turbulence"], r["icing"]) for r in near] == [("C172", "MOD", "NEG")]


GAIRMET_XML = b"""<response><data>
<GAIRMET><valid_time>2026-10-04T15:00:00.000Z</valid_time><hazard type="ICE" severity="MOD" /><geometry_type>AREA</geometry_type>
  <due_to>ICE</due_to><altitude min_ft_msl="FZL" max_ft_msl="16000" />
  <area><point><longitude>-89</longitude><latitude>42</latitude></point><point><longitude>-87</longitude><latitude>42</latitude></point>
  <point><longitude>-87</longitude><latitude>43</latitude></point><point><longitude>-89</longitude><latitude>43</latitude></point></area></GAIRMET>
<GAIRMET><valid_time>2026-10-04T18:00:00.000Z</valid_time><hazard type="ICE" severity="MOD" /><geometry_type>AREA</geometry_type>
  <due_to>ICE</due_to><altitude min_ft_msl="FZL" max_ft_msl="18000" />
  <area><point><longitude>-89</longitude><latitude>42</latitude></point><point><longitude>-87</longitude><latitude>42</latitude></point>
  <point><longitude>-87</longitude><latitude>43</latitude></point><point><longitude>-89</longitude><latitude>43</latitude></point></area></GAIRMET>
<GAIRMET><valid_time>2026-10-04T15:00:00.000Z</valid_time><hazard type="TURB-HI" severity="MOD" /><geometry_type>AREA</geometry_type>
  <area><point><longitude>-89</longitude><latitude>42</latitude></point><point><longitude>-87</longitude><latitude>42</latitude></point>
  <point><longitude>-87</longitude><latitude>43</latitude></point></area></GAIRMET>
</data></response>"""


def test_the_g_airmets_are_the_area_hazards_a_vfr_flight_is_told_of():
    advisories = aviationweather.SOURCES["gairmets"][1](GAIRMET_XML)
    assert len(advisories) == 2  # high-level turbulence left out
    assert {k: v for k, v in advisories[0].items() if k not in ("valid", "coords")} == {
        "hazard": "Icing",
        "severity": "MOD",
        "due_to": "ICE",
        "valid_at": "2026-10-04T15:00:00.000Z",
        "issued": None,
        "altitude_low_ft": None,
        "from_freezing_level": True,
        "altitude_high_ft": 16000.0,
    }
    # Stored until its last snapshot is past GAIRMET_SNAPSHOT_S.
    last = datetime(2026, 10, 4, 18, tzinfo=timezone.utc).timestamp()
    assert aviationweather.SOURCES["gairmets"][2](advisories, 0.0) == last + weather.GAIRMET_SNAPSHOT_S


# --- each station's last wind, for the calm-wind runway ---


def test_each_stations_last_windy_report_is_kept_three_hours():
    """The METAR file holds a station's latest report only: the last one
    with a direction and some speed is kept as they come, for the runway it
    favoured once the wind has gone calm (wingtip.weather.recent_wind)."""
    windy = {"KDLH": {"wind_dir_true_deg": 270.0, "wind_speed_kt": 8.0, "observed_at": "2026-09-20T01:00:00Z"}}
    calm = {
        "KDLH": {"wind_dir_true_deg": 0.0, "wind_speed_kt": 0.0, "observed_at": "2026-09-20T02:00:00Z"},
        "KORD": {"wind_dir_true_deg": None, "wind_speed_kt": 3.0, "observed_at": "2026-09-20T02:00:00Z"},
    }
    aviationweather.keep_recent_winds(windy, T0200Z - 3600)
    aviationweather.keep_recent_winds(calm, T0200Z)
    with patch("wingtip.weather.time.time", return_value=T0200Z):
        assert weather.recent_wind("KDLH") == {"wind_dir_true_deg": 270.0, "wind_speed_kt": 8.0}
        assert weather.recent_wind("KORD") is None  # variable: no direction
    aviationweather.keep_recent_winds({}, T0200Z + 3 * 3600)
    assert weather_store.read("recent-winds").data == {}  # older than three hours: dropped
