//! The weather readers and rules no test had asked by name (the coverage
//! audit of 2026-11-21), each asked as the hosts ask it, JSON in and out:
//! the Aviation Weather Center's PIREP and G-AIRMET cache files
//! (aviationweather.gov/data/cache, the AircraftReport and GAIRMET
//! schema), a TFR's XNOTAM detail (tfr.faa.gov), the G-AIRMET hazards a
//! VFR flight is told of (FAA-H-8083-28B 26.3.1.1), the PIREPs still told
//! in a box (90 minutes, at or under 18,000 ft MSL: 14 CFR 71.33's Class A
//! floor), the worst TAF along a route (TEMPO groups counted), AWC's
//! icing and turbulence words (its GFA help) and freezing precipitation
//! in a METAR or TAF (AIM 7-1-20). The inputs are small hand-made files in
//! each product's own shape; each boundary is asked from both sides.

mod common;

use common::assert_same;
use serde_json::{json, Value};
use wingtip_engine::call::call;

fn ask(name: &str, input: &Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name} answered {text}: {e}"))
}

/// 2026-10-04T15:00:00Z and 2026-11-21T12:00:00Z, Unix seconds.
const OCT_4_1500Z: f64 = 1_791_126_000.0;
const NOW: f64 = 1_795_262_400.0;

#[test]
fn the_pilot_reports_are_read_and_the_airliners_position_reports_left_out() {
    // A routine PIREP with its turbulence and icing, an urgent one (UUA), an
    // AIREP (an airliner's position report, not a PIREP) and a PIREP with
    // no position, in the AWC cache file's AircraftReport shape.
    let text = r#"<response><data>
<AircraftReport><observation_time>2026-10-04T15:00:00.000Z</observation_time><aircraft_ref>C172</aircraft_ref><latitude>42.5</latitude><longitude>-88.1</longitude><altitude_ft_msl>5500</altitude_ft_msl><turbulence_condition turbulence_intensity="" /><turbulence_condition turbulence_intensity="MOD" /><icing_condition icing_intensity="NEG" /><report_type>PIREP</report_type><raw_text>UA /OV ... /TB MOD</raw_text></AircraftReport>
<AircraftReport><observation_time>2026-10-04T15:00:00.000Z</observation_time><latitude>54.0</latitude><longitude>-50.0</longitude><altitude_ft_msl>37000</altitude_ft_msl><report_type>AIREP</report_type><raw_text>ARP</raw_text></AircraftReport>
<AircraftReport><observation_time>2026-10-04T15:00:00.000Z</observation_time><latitude>42.5</latitude><longitude>-80.0</longitude><altitude_ft_msl>4000</altitude_ft_msl><report_type>Urgent PIREP</report_type><raw_text>UUA far east</raw_text></AircraftReport>
<AircraftReport><observation_time>2026-10-04T15:00:00.000Z</observation_time><report_type>PIREP</report_type><raw_text>UA nowhere</raw_text></AircraftReport>
</data></response>"#;
    let want = json!([
        {"observed_at": "2026-10-04T15:00:00.000Z", "observed": OCT_4_1500Z, "lat": 42.5, "lon": -88.1, "altitude_ft": 5500,
         "aircraft": "C172", "urgent": false, "turbulence": "MOD", "icing": "NEG", "raw": "UA /OV ... /TB MOD"},
        {"observed_at": "2026-10-04T15:00:00.000Z", "observed": OCT_4_1500Z, "lat": 42.5, "lon": -80.0, "altitude_ft": 4000,
         "aircraft": null, "urgent": true, "turbulence": null, "icing": null, "raw": "UUA far east"}
    ]);
    assert_same(&ask("awc_pireps_read", &json!({ "text": text })), &want, "awc_pireps_read");
    assert!(call("awc_pireps_read", r#"{"text":"no XML here"}"#).is_err());
}

#[test]
fn the_g_airmet_areas_a_vfr_flight_is_told_of() {
    // Zulu's icing from the freezing level to 16,000 ft, Sierra's IFR from
    // the surface, and Tango's high-level turbulence, which is above a
    // light airplane (FL180 and up) and left out.
    let area = r#"<area><point><longitude>-89</longitude><latitude>42</latitude></point><point><longitude>-87</longitude><latitude>42</latitude></point><point><longitude>-87</longitude><latitude>43</latitude></point></area>"#;
    let text = format!(
        r#"<response><data>
<GAIRMET><issue_time>2026-10-04T14:45:00.000Z</issue_time><valid_time>2026-10-04T15:00:00.000Z</valid_time><hazard type="ICE" severity="MOD" /><geometry_type>AREA</geometry_type><due_to>ICE</due_to><altitude min_ft_msl="FZL" max_ft_msl="16000" />{area}</GAIRMET>
<GAIRMET><valid_time>2026-10-04T15:00:00.000Z</valid_time><hazard type="IFR" severity="" /><geometry_type>AREA</geometry_type><due_to>CIG BLW 010/VIS BLW 3SM BR</due_to><altitude min_ft_msl="SFC" max_ft_msl="" />{area}</GAIRMET>
<GAIRMET><valid_time>2026-10-04T15:00:00.000Z</valid_time><hazard type="TURB-HI" severity="MOD" /><geometry_type>AREA</geometry_type>{area}</GAIRMET>
</data></response>"#
    );
    let coords = json!([[42, -89], [42, -87], [43, -87]]);
    let want = json!([
        {"hazard": "Icing", "severity": "MOD", "due_to": "ICE", "valid_at": "2026-10-04T15:00:00.000Z", "valid": OCT_4_1500Z,
         "issued": "2026-10-04T14:45:00.000Z", "altitude_low_ft": null, "from_freezing_level": true, "altitude_high_ft": 16000,
         "coords": coords},
        {"hazard": "IFR conditions", "severity": null, "due_to": "CIG BLW 010/VIS BLW 3SM BR", "valid_at": "2026-10-04T15:00:00.000Z",
         "valid": OCT_4_1500Z, "issued": null, "altitude_low_ft": null, "from_freezing_level": false, "altitude_high_ft": null,
         "coords": coords}
    ]);
    assert_same(&ask("awc_gairmets_read", &json!({ "text": text })), &want, "awc_gairmets_read");
}

#[test]
fn the_g_airmet_hazards_and_snapshots_are_the_handbooks() {
    // FAA-H-8083-28B 26.3.1.1: Sierra (IFR, mountain obscuration), Tango
    // (turbulence, strong surface winds, low-level wind shear) and Zulu
    // (icing); snapshots three hours apart, one told within half the gap.
    let want = json!({
        "hazards": {"IFR": "IFR conditions", "MT_OBSC": "Mountains obscured", "TURB-LO": "Turbulence", "ICE": "Icing",
                    "LLWS": "Low-level wind shear", "SFC_WND": "Strong surface winds"},
        "labels": {"IFR conditions": "IFR", "Mountains obscured": "Mtn Obsc", "Turbulence": "Turb", "Icing": "Ice",
                   "Low-level wind shear": "LLWS", "Strong surface winds": "SfcWind"},
        "snapshot_s": 5400
    });
    assert_same(&ask("gairmet_hazards", &json!({})), &want, "gairmet_hazards");
}

#[test]
fn a_tfrs_detail_from_its_xnotam_file() {
    // Two areas: the surface (0 ft AGL) to FL179, and 3,000 to 8,000 ft MSL.
    // The lowest floor is the first, AGL; the highest ceiling FL179, 17,900
    // ft MSL. 91.141 is a VIP movement TFR.
    let text = r#"<XNOTAM-Update><Group><Add><Not><dateEffective>2026-11-02T14:00:00</dateEffective><dateExpire>2026-11-02T20:00:00</dateExpire><txtDescrPurpose>VIP MOVEMENT</txtDescrPurpose><txtDescrTraditional>!FDC 6/1234 ZAU IL..AIRSPACE CHICAGO, IL..TEMPORARY FLIGHT RESTRICTIONS.</txtDescrTraditional><TfrNot><codeType>91.141</codeType><TFRAreaGroup><aseTFRArea><codeDistVerUpper>ALT</codeDistVerUpper><valDistVerUpper>179</valDistVerUpper><uomDistVerUpper>FL</uomDistVerUpper><codeDistVerLower>HEI</codeDistVerLower><valDistVerLower>0</valDistVerLower><uomDistVerLower>FT</uomDistVerLower></aseTFRArea><aseTFRArea><codeDistVerUpper>ALT</codeDistVerUpper><valDistVerUpper>8000</valDistVerUpper><uomDistVerUpper>FT</uomDistVerUpper><codeDistVerLower>ALT</codeDistVerLower><valDistVerLower>3000</valDistVerLower><uomDistVerLower>FT</uomDistVerLower></aseTFRArea></TFRAreaGroup></TfrNot><txtInstr> NO PILOTS MAY OPERATE AN AIRCRAFT IN THE AREAS COVERED BY THIS NOTAM. </txtInstr></Not></Add></Group></XNOTAM-Update>"#;
    let want = json!({
        "effective": "2026-11-02T14:00:00Z", "expires": "2026-11-02T20:00:00Z", "rule": "VIP movement (91.141)",
        "purpose": "VIP movement", "floor_ft": 0, "floor_ref": "AGL", "ceiling_ft": 17900, "ceiling_ref": "MSL",
        "instructions": ["NO PILOTS MAY OPERATE AN AIRCRAFT IN THE AREAS COVERED BY THIS NOTAM."],
        "text": "!FDC 6/1234 ZAU IL..AIRSPACE CHICAGO, IL..TEMPORARY FLIGHT RESTRICTIONS.",
        "facility": null, "contact": null
    });
    assert_same(&ask("tfr_detail_read", &json!({ "text": text })), &want, "tfr_detail_read");
    // XML holding no NOTAM is none; text that is not XML is refused.
    assert_eq!(ask("tfr_detail_read", &json!({ "text": "<XNOTAM-Update></XNOTAM-Update>" })), Value::Null);
    assert!(call("tfr_detail_read", r#"{"text":"no XML here"}"#).is_err());
}

#[test]
fn the_pireps_in_a_box_are_the_last_90_minutes_at_or_under_18000_ft_the_urgent_last() {
    let r = |id: &str, age_s: f64, alt: Value, lat: f64, lon: f64, urgent: bool| json!({"observed": NOW - age_s, "lat": lat, "lon": lon, "altitude_ft": alt, "urgent": urgent, "raw": id});
    let reports = json!([
        r("urgent on the north edge", 600.0, json!(4000), 43.0, -88.0, true),
        r("90 minutes old", 5400.0, json!(5500), 42.5, -88.0, false),
        r("90 minutes and a second", 5401.0, json!(5500), 42.5, -88.0, false),
        r("18,000 ft", 60.0, json!(18000), 42.5, -88.0, false),
        r("18,001 ft", 60.0, json!(18001), 42.5, -88.0, false),
        r("no altitude", 60.0, Value::Null, 42.5, -88.0, false),
        r("east of the box", 60.0, json!(4000), 42.5, -86.9, false),
    ]);
    let got = ask("pireps_in_box", &json!({"reports": reports, "box": [42.0, -89.0, 43.0, -87.0], "now": NOW}));
    let raws: Vec<&str> = got.as_array().unwrap().iter().map(|p| p["raw"].as_str().unwrap()).collect();
    assert_eq!(raws, ["90 minutes old", "18,000 ft", "no altitude", "urgent on the north edge"]);
    // Each as kept, its Unix "observed" left out.
    assert!(got.as_array().unwrap().iter().all(|p| p.get("observed").is_none() && p.get("lat").is_some()));
}

#[test]
fn the_worst_taf_along_a_route_counts_its_tempo_groups() {
    // A route north from 42N 88W to 43N 88W, the default 10 nm box round
    // it; the window an hour from half past the TAF's first hour.
    let t0 = NOW;
    let (start, end) = (t0 + 1800.0, t0 + 5400.0);
    let tafs = json!([
        {"icaoId": "KAAA", "lat": 42.5, "lon": -88.1, "elevation_ft": 700, "fcsts": [
            {"timeFrom": t0, "timeTo": t0 + 21600.0, "ceiling_ft": 3000, "visibility_sm": 6},
            {"timeFrom": t0 + 3600.0, "timeTo": t0 + 10800.0, "change": "TEMPO", "ceiling_ft": 800, "visibility_sm": 2}]},
        {"icaoId": "KBBB", "lat": 42.8, "lon": -87.9, "fcsts": [
            {"timeFrom": t0, "timeTo": t0 + 21600.0, "ceiling_unknown": true, "visibility_sm": 5}]},
        {"icaoId": "KCCC", "lat": 42.6, "lon": -88.0, "fcsts": [
            {"timeFrom": t0 - 21600.0, "timeTo": t0, "ceiling_ft": 200, "visibility_sm": 0.5}]},
        {"icaoId": "KFAR", "lat": 45.0, "lon": -80.0, "fcsts": [
            {"timeFrom": t0, "timeTo": t0 + 21600.0, "ceiling_ft": 100, "visibility_sm": 0.25}]}
    ]);
    let route = json!({"tafs": tafs, "from": [42.0, -88.0], "to": [43.0, -88.0], "start": start, "end": end});
    let got = ask("tafs_along_route", &route);
    let want = json!({
        "min_ceiling_ft": 800, "min_visibility_sm": 2, "ceiling_unknown_at": ["KBBB"],
        "stations": [
            {"icaoId": "KAAA", "lat": 42.5, "lon": -88.1, "elevation_ft": 700,
             "ceiling_ft": 800, "ceiling_unknown": false, "visibility_sm": 2, "issued": null},
            {"icaoId": "KBBB", "lat": 42.8, "lon": -87.9, "elevation_ft": null,
             "ceiling_ft": null, "ceiling_unknown": true, "visibility_sm": 5, "issued": null}
        ]
    });
    // KCCC's TAF ends as the window's hour begins, saying nothing of it;
    // KFAR is far off the route.
    assert_same(&got, &want, "tafs_along_route");
}

#[test]
fn the_icing_and_turbulence_words_are_awcs() {
    // aviationweather.gov GFA help (read 2026-11-12): icing 0 none to 4
    // heavy; turbulence by EDR from each word's threshold, by weight class.
    let words = |from: [f64; 4]| {
        json!([{"word": "Light", "from": from[0]}, {"word": "Moderate", "from": from[1]},
               {"word": "Severe", "from": from[2]}, {"word": "Extreme", "from": from[3]}])
    };
    let want = json!({
        "icing": [{"word": "None", "from": 0}, {"word": "Trace", "from": 1}, {"word": "Light", "from": 2},
                  {"word": "Moderate", "from": 3}, {"word": "Heavy", "from": 4}],
        "turbulence": {"light": words([0.13, 0.16, 0.36, 0.64]), "medium": words([0.15, 0.20, 0.44, 0.79]),
                       "heavy": words([0.17, 0.24, 0.54, 0.96])}
    });
    assert_same(&ask("aviation_grid_bands", &json!({})), &want, "aviation_grid_bands");
}

#[test]
fn freezing_rain_and_drizzle_in_a_metar_or_taf_but_not_its_remarks() {
    // AIM 7-1-20: freezing precipitation falls "through or outside of
    // visible cloud". The METAR's -FZRA is read and its remarks' FZRAB15
    // (when it began) not; the TAF's TEMPO FZDZ is read; freezing fog is
    // no precipitation.
    let fields = json!([
        {"ident": "KDLH", "metar": "KDLH 211253Z 05012KT 3SM -FZRA BR OVC008 M02/M03 A2990 RMK FZRAB15",
         "taf": "KDLH 211120Z 2112/2212 04010KT 5SM -SN OVC015 TEMPO 2114/2118 1SM FZDZ"},
        {"ident": "KMSP", "metar": "KMSP 211253Z 36008KT 1/2SM FZFG OVC003 M05/M06 A3010", "taf": null}
    ]);
    let want = json!({
        "found": [{"ident": "KDLH", "source": "METAR", "group": "-FZRA"}, {"ident": "KDLH", "source": "TAF", "group": "FZDZ"}],
        "line": concat!(
            "Freezing rain reported at KDLH (METAR -FZRA), freezing drizzle forecast at KDLH (TAF FZDZ); ",
            "it ices an airplane out of cloud"
        )
    });
    assert_same(&ask("freezing_precip", &json!({ "fields": fields })), &want, "freezing_precip");
    let none = ask("freezing_precip", &json!({"fields": [{"ident": "KMSP", "metar": "KMSP 211253Z 36008KT 10SM OVC030 M05/M10 A3010"}]}));
    assert_eq!(none, json!({"found": [], "line": null}));
}
