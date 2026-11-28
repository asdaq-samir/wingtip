"""The SIGMETs fetched from aviationweather.gov's combined file
(sigmets.cache.xml.gz: the US convective and non-convective SIGMETs and
the international ones, the data API's v4.34 of 2026-10-08, which
deprecated the airsigmets file) and stored as the planner reads them.
The records are the file's own of 2026-11-21, cut to two; the engine's
test reads the five of samples/sigmets.cache.xml
(engine/crates/weather/src/forecast/awc/tests.rs)."""

import gzip
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from wingtip import weather

from app import aviationweather

CONVECTIVE = (
    '<SIGMET><raw_text><![CDATA[WSUS32 KKCI 212355\n'
    'MKCC WST 212355\n'
    'CONVECTIVE SIGMET 24C\n'
    'VALID UNTIL 0155Z\n'
    'TX OK\n'
    'FROM 10NNW ADM-30N ACT-70ESE ABI-20N SPS-10NNW ADM\n'
    'AREA EMBD TS MOV FROM 22035KT. TOPS TO FL360.'
    ']]></raw_text>'
    '<fir>KMKC</fir><fir_name>US CENTRAL</fir_name>'
    '<series_id>24C</series_id>'
    '<valid_time_from>2026-11-21T23:55:00.000Z</valid_time_from><valid_time_to>2026-11-22T01:55:00.000Z</valid_time_to>'
    '<altitude top_ft_msl="36000"/><movement_dir>40</movement_dir><movement_spd_kt>35</movement_spd_kt>'
    '<hazard type="CONV" qualifier="EMBD"/>'
    '<area num_points="5">'
    '<point><longitude>-97.249</longitude><latitude>34.363</latitude></point>'
    '<point><longitude>-97.27</longitude><latitude>32.159</latitude></point>'
    '<point><longitude>-98.596</longitude><latitude>32.019</latitude></point>'
    '<point><longitude>-98.59</longitude><latitude>34.323</latitude></point>'
    '<point><longitude>-97.249</longitude><latitude>34.363</latitude></point></area></SIGMET>'
)
# An oceanic SIGMET for thunderstorms, in the New York FIR's ocean.
OCEANIC = (
    '<SIGMET><raw_text><![CDATA[WSNT06 KKCI 212205\n'
    'KZWY SIGMET FOXTROT 4 VALID 212205/220205 KKCI-\n'
    'NEW YORK OCEANIC FIR FRQ TS OBS AT 2205Z WI N3219 W06736 - N3126\n'
    'W06356 - N2835 W06243 - N2701 W06527 - N3023 W06859 - N3219\n'
    'W06736. TOP FL460. MOV NNE 10KT. NC.'
    ']]></raw_text>'
    '<fir>KZWY</fir><fir_name>NEW YORK OCEANIC</fir_name>'
    '<series_id>FOXTROT 4</series_id>'
    '<valid_time_from>2026-11-21T22:05:00.000Z</valid_time_from><valid_time_to>2026-11-22T02:05:00.000Z</valid_time_to>'
    '<altitude top_ft_msl="46000"/><movement_dir>NNE</movement_dir><movement_spd_kt>10</movement_spd_kt><change>NC</change>'
    '<hazard type="TS" qualifier="FRQ"/>'
    '<area num_points="6">'
    '<point><longitude>-67.6</longitude><latitude>32.317</latitude></point>'
    '<point><longitude>-63.933</longitude><latitude>31.433</latitude></point>'
    '<point><longitude>-62.717</longitude><latitude>28.583</latitude></point>'
    '<point><longitude>-65.45</longitude><latitude>27.017</latitude></point>'
    '<point><longitude>-68.983</longitude><latitude>30.383</latitude></point>'
    '<point><longitude>-67.6</longitude><latitude>32.317</latitude></point></area></SIGMET>'
)
NOW = datetime(2026, 11, 22, 0, 30, tzinfo=timezone.utc).timestamp()


def test_the_sigmets_come_from_the_combined_file_in_the_stores_shape():
    xml = f'<?xml version="1.0" encoding="UTF-8"?><response version="1.1"><data num_results="2">{CONVECTIVE}{OCEANIC}</data></response>'
    resp = Mock(status_code=200, headers={}, content=gzip.compress(xml.encode()))
    with patch("app.fetch.outside.get", return_value=resp) as get, patch("app.aviationweather.time.time", return_value=NOW):
        aviationweather.fetch_source("airsigmets")
    assert get.call_args.args[0] == "https://aviationweather.gov/data/cache/sigmets.cache.xml.gz"
    with patch("wingtip.weather_store.time.time", return_value=NOW):
        held = weather._dataset("airsigmets")
    # A convective SIGMET's "CONV" is the CONVECTIVE every reader looks
    # for; an oceanic one's thunderstorms stay "TS". Both are SIGMETs.
    assert [(a["hazard"], a["type"], a["altitude_high_ft"], len(a["coords"])) for a in held] == [
        ("CONVECTIVE", "SIGMET", 36000.0, 5),
        ("TS", "SIGMET", 46000.0, 6),
    ]
    assert held[0]["issued"] == "2026-11-21T23:55:00Z"
