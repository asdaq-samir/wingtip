"""wingtip.live_reports and its readers of SWIM: ITWS's alerts (wingtip.itws)
and SFDPS's special activity airspace (wingtip.saa), each read from
messages the owner's queues carried on 2026-11-09 (fixtures/swim), with
an alert switched on where the night had none."""
import pathlib

import pytest

from wingtip import itws, live_reports, saa

SWIM = pathlib.Path(__file__).parent / "fixtures" / "swim"
#: Just before the captured ITWS messages expire (05:07Z on 2026-11-09).
NOW = 1794200800.0


def fixture(name: str) -> str:
    return (SWIM / name).read_text()


@pytest.fixture(autouse=True)
def store(tmp_path, monkeypatch):
    monkeypatch.setattr(live_reports, "STORE", tmp_path / "reports.sqlite")
    live_reports.reset()
    yield
    live_reports.reset()


def test_a_report_is_the_latest_of_its_key_and_goes_at_its_end():
    live_reports.put("x", "ORD:1", {"n": 1}, place="KORD", ends=NOW + 60, now=NOW)
    live_reports.put("x", "ORD:1", {"n": 2}, place="KORD", ends=NOW + 60, now=NOW + 1)
    # KORD and ORD are one airport.
    assert [r["n"] for r in live_reports.at("x", ["ORD"], now=NOW + 2)] == [2]
    assert live_reports.at("x", ["KORD"], now=NOW + 61) == []
    live_reports.drop("x", "ORD:1")
    assert live_reports.every("x", now=NOW) == []


def test_no_store_yet_is_no_report(tmp_path, monkeypatch):
    monkeypatch.setattr(live_reports, "STORE", tmp_path / "none" / "reports.sqlite")
    live_reports.reset()
    assert live_reports.at("itws", ["KATL"]) == []
    assert not (tmp_path / "none").exists()


def test_a_quiet_itws_product_keeps_nothing_and_ends_what_its_airport_had():
    quiet = fixture("itws_configured_alerts.xml")
    assert itws.alerts(quiet)[:3] == ("9840", ["ATL"], 1794200862.0)
    # Atlanta's west flow, every region with no alert type: nothing alerts.
    assert itws.heard(quiet, now=NOW) == 0
    # The first region, 27L's arrivals, given a microburst alert.
    loud = quiet
    for was, now_is in (("<ca_ra_type></ca_ra_type>", "<ca_ra_type>MBA</ca_ra_type>"),
                        ('<ca_ra_value unit="knots">0<', '<ca_ra_value unit="knots">40<'),
                        ("<ca_ra_first_loc>RWY<", "<ca_ra_first_loc>3MF<")):
        assert was in loud
        loud = loud.replace(was, now_is, 1)
    assert loud.index("27LA") < loud.index("MBA") < loud.index("27LD")
    assert itws.heard(loud, now=NOW) == 1
    [product] = itws.at_airports(["KATL"], now=NOW)
    [alert] = product["alerts"]
    # AIM 4-3-7's own example is "Runway 17 arrival microburst alert, 40
    # knot loss 3 mile final"; the alert area runs 3 mile final to the runway.
    assert (alert["runway"], alert["direction"], alert["alert"], alert["value_kt"]) == ("27L", "arrival", "microburst", 40.0)
    assert alert["words"] == "Runway 27L arrival microburst alert 40 kt, 3 mile final to runway"
    # Its next message says nothing alerts: the alert is gone.
    itws.heard(quiet, now=NOW + 5)
    assert itws.at_airports(["KATL"], now=NOW + 5) == []


def test_an_itws_alert_lasts_until_its_product_expires():
    on = fixture("itws_microburst_atis.xml").replace("<pmsg_status>OFF", "<pmsg_status>ON")
    assert itws.heard(on, now=NOW) == 1
    assert itws.at_airports(["ATL"], now=NOW)[0]["alerts"][0]["words"] == "Microburst alert on the ATIS"
    assert itws.at_airports(["ATL"], now=1794200833.0) == []


def test_each_itws_product_says_its_alert_in_a_pilots_words():
    gust = fixture("itws_gust_front.xml").replace("<gf_eti_near>0", "<gf_eti_near>1").replace(
        '<gf_eti_minutes unit="minutes">-1', '<gf_eti_minutes unit="minutes">12')
    assert itws.alerts(gust)[3][0]["words"] == "Gust front expected in 12 min"
    tornado = fixture("itws_tornado_alert.xml").replace("<trnal_exists_flag>0", "<trnal_exists_flag>1")
    assert itws.alerts(tornado)[3][0]["words"] == "Tornado detected within 10 nm"
    cell = fixture("itws_hazard_text_5nm.xml").replace(
        "<ht_num_cells>0</ht_num_cells>",
        '<ht_num_cells>1</ht_num_cells><ht_cell count="1"><htc_latitude unit="degrees">36.1</htc_latitude>'
        '<htc_longitude unit="degrees">-86.7</htc_longitude><htc_msg_text>ECHOTOP: 170 </htc_msg_text></ht_cell>')
    assert itws.alerts(cell)[3][0]["words"] == "Storm within 5 nm: ECHOTOP: 170"
    # The quiet ones, as sent, alert nothing.
    for name in ("itws_gust_front.xml", "itws_tornado_alert.xml", "itws_hazard_text_5nm.xml", "itws_microburst_atis.xml"):
        assert itws.alerts(fixture(name))[3] == []


def test_a_runway_alert_reads_its_region_and_span():
    alert = itws.runway_alert("28 D", "WSA", 25.0, "RWY", "2MD")
    assert (alert["runway"], alert["direction"], alert["alert"]) == ("28", "departure", "wind shear")
    assert alert["words"] == "Runway 28 departure wind shear alert 25 kt, runway to 2 mile departure"
    # A code this does not know is given as the feed wrote it.
    assert itws.runway_alert("36RA ;", "XYZ", None, "RWY", "RWY")["words"] == "Runway 36R arrival XYZ alert, runway"


def test_sfdps_says_a_warning_area_is_active_and_the_chart_name_finds_it():
    status = fixture("sfdps_saa_status.xml")
    [area] = saa.areas(status)
    assert area["designator"] == "W136C" and area["activations"][0]["active"] is True
    assert saa.heard(status, now=NOW) == 1
    found = saa.status(["W-136C", "R-4401A"], now=NOW + 60)
    assert list(found) == ["W-136C"]
    assert (found["W-136C"]["active"], found["W-136C"]["until"], found["W-136C"]["heard"]) == (True, None, NOW)
    # With no end time, it is kept a day, not for ever.
    assert saa.status(["W136C"], now=NOW + saa.SNAPSHOT_HOLDS_S + 1) == {}


def test_an_area_released_cold_says_so_with_its_times():
    cold = fixture("sfdps_saa_status.xml").replace("<ns3:status>ACTIVE", "<ns3:status>INACTIVE").replace(
        '<ns3:AirspaceActivation ns1:id="SU_airspaceActivation">',
        '<ns3:AirspaceActivation ns1:id="SU_airspaceActivation"><ns1:validTime><ns1:TimePeriod>'
        '<ns1:beginPosition>2026-11-09T05:00:00Z</ns1:beginPosition>'
        '<ns1:endPosition>2026-11-09T07:00:00Z</ns1:endPosition></ns1:TimePeriod></ns1:validTime>')
    saa.heard(cold, now=NOW)
    found = saa.status(["W136C"], now=NOW)["W136C"]
    assert (found["active"], found["status"], found["until"]) == (False, "INACTIVE", 1794207600.0)
