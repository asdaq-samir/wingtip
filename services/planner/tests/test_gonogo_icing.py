"""app.gonogo.icing, with apps/web/src/lib/icing.test.ts's cases, and the
engine's gonogo_icing_unchecked and freezing_precip as the planner asks them."""

from app.gonogo.icing import freezing_precip, icing_at_altitude, icing_line, icing_unchecked, icing_words


def selection(**over) -> dict:
    return {"freezing_level_ft": 5000, "freezing_level_at_or_below": False, "icing_possible": True, **over}


def pirep(icing):
    return {"icing": icing, "along_track_nm": 10}


def test_a_leg_at_or_above_the_freezing_level_in_cloud_with_the_reports_of_icing_near_the_route():
    found = icing_at_altitude(selection(), [4000, 6000], [pirep("MOD"), pirep("NEG"), pirep("NEGclr"), pirep(None), pirep("LGT-MOD")])
    assert found == {"altitude_ft": 6000, "freezing_level_ft": 5000, "at_or_below": False, "reports": 2}
    assert icing_line(found) == (
        "Icing possible at 6,000 ft: the freezing level at 5,000 ft, in cloud; 2 pilot reports of icing near the route"
    )
    assert icing_at_altitude(selection(), [5000], []) is not None


def test_nothing_below_the_freezing_level_without_the_moisture_or_where_the_level_is_not_known():
    assert icing_at_altitude(selection(), [4000, 4999], []) is None
    assert icing_at_altitude(selection(icing_possible=False), [8000], []) is None
    assert icing_at_altitude(selection(icing_possible=None), [8000], []) is None
    assert icing_at_altitude(selection(freezing_level_ft=None), [8000], []) is None


def test_a_freezing_level_at_or_below_the_lowest_forecast_altitude_is_every_altitude():
    found = icing_at_altitude(selection(freezing_level_ft=3000, freezing_level_at_or_below=True), [2000], [])
    assert icing_line(found) == "Icing possible at 2,000 ft: the freezing level at or below 3,000 ft, in cloud"


def test_icing_possible_with_no_freezing_level_is_said_not_checked():
    # FAA-H-8083-28B ch. 20: icing needs visible moisture at or below 0 °C;
    # with no level known no altitude can be held to it.
    unknown = selection(freezing_level_ft=None)
    assert icing_unchecked(unknown, [8000]) == "Icing not checked: freezing level not known"
    assert icing_unchecked(selection(), [8000]) is None
    assert icing_unchecked(selection(freezing_level_ft=None, icing_possible=False), [8000]) is None
    assert icing_unchecked(unknown, []) is None


TAF_KMDW = "TAF KMDW 131720Z 1318/1424 03010KT 3SM -RA BR OVC010 TEMPO 1320/1324 1SM FZDZ OVC005"


def test_freezing_rain_and_drizzle_in_a_metar_or_a_taf_on_the_route():
    # AIM 7-1-20: it falls "through or outside of visible cloud". The
    # remark FZRAB25 is not read; freezing fog is not precipitation.
    briefing = {
        "metars": {
            "KORD": {"raw": "KORD 131751Z 03012KT 2SM -FZRA BR OVC008 M01/M02 A2992 RMK AO2 FZRAB25"},
            "KGYY": {"raw": "KGYY 131753Z 00000KT 1/4SM FZFG VV002 M03/M03 A3010"},
            "KDLH": None,
        },
        "forecast": {"stations": [{"icaoId": "KMDW", "raw": TAF_KMDW}]},
    }
    assert freezing_precip(briefing) == (
        "Freezing rain reported at KORD (METAR -FZRA), freezing drizzle forecast at KMDW (TAF FZDZ); it ices an airplane out of cloud"
    )
    assert freezing_precip({"metars": {"KGYY": briefing["metars"]["KGYY"]}, "forecast": {"stations": []}}) is None


def test_the_icing_caution_says_its_parts_in_order():
    assert icing_words(None, None) is None
    assert icing_words("Icing not checked: freezing level not known", None) == "Icing not checked: freezing level not known"
    assert icing_words("Icing possible at 6,000 ft", "Freezing rain reported at KORD (METAR -FZRA)") == (
        "Icing possible at 6,000 ft. Freezing rain reported at KORD (METAR -FZRA)"
    )
