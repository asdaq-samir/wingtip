use super::*;

#[test]
fn a_metar_with_no_height_for_its_overcast_is_not_vfr() {
    let xml = r#"<response><data>
      <METAR><raw_text>KXYZ 021353Z AUTO 27010KT 10SM OVC/// 10/05 A3001</raw_text><station_id>KXYZ</station_id>
        <observation_time>2026-11-02T13:53:00Z</observation_time><latitude>45.0</latitude><longitude>-93.0</longitude>
        <wind_dir_degrees>270</wind_dir_degrees><wind_speed_kt>10</wind_speed_kt><visibility_statute_mi>10+</visibility_statute_mi>
        <sky_condition sky_cover="OVC"/><flight_category>VFR</flight_category></METAR>
      <METAR><station_id>KABC</station_id><observation_time>2026-11-02T13:53:00Z</observation_time>
        <wind_dir_degrees>VRB</wind_dir_degrees><visibility_statute_mi>2</visibility_statute_mi>
        <sky_condition sky_cover="BKN" cloud_base_ft_agl="800"/><flight_category>IFR</flight_category></METAR>
    </data></response>"#;
    let v = json::parse(&metars(xml).unwrap()).unwrap();
    let x = v.get("KXYZ").unwrap();
    assert_eq!(x.get("ceiling_unknown"), Some(&Value::Bool(true)));
    assert_eq!(x.get("flight_category"), Some(&Value::Null));
    assert_eq!(x.get("visibility_sm").and_then(Value::as_f64), Some(10.0));
    assert_eq!(x.get("visibility_plus"), Some(&Value::Bool(true)));
    let a = v.get("KABC").unwrap();
    assert_eq!(a.get("ceiling_ft").and_then(Value::as_f64), Some(800.0));
    assert_eq!(a.get("visibility_plus"), Some(&Value::Bool(false)));
    assert_eq!(a.get("wind_dir_true_deg"), Some(&Value::Null));
}

#[test]
fn a_taf_in_the_engines_shape() {
    let xml = r#"<response><data><TAF><raw_text>TAF KDLH ...</raw_text><station_id>KDLH</station_id>
      <issue_time>2026-11-02T11:20:00Z</issue_time><latitude>46.8</latitude><longitude>-92.2</longitude><elevation_m>435</elevation_m>
      <forecast><fcst_time_from>2026-11-02T18:00:00Z</fcst_time_from><fcst_time_to>2026-11-03T12:00:00Z</fcst_time_to>
        <change_indicator>FM</change_indicator><visibility_statute_mi>6+</visibility_statute_mi><sky_condition sky_cover="OVC" cloud_base_ft_agl="2500"/></forecast>
      <forecast><fcst_time_from>2026-11-02T12:00:00Z</fcst_time_from><fcst_time_to>2026-11-02T18:00:00Z</fcst_time_to>
        <visibility_statute_mi>6+</visibility_statute_mi><sky_condition sky_cover="BKN" cloud_base_ft_agl="4000"/></forecast>
    </TAF></data></response>"#;
    let v = json::parse(&tafs(xml).unwrap()).unwrap();
    let s = &v.as_array().unwrap()[0];
    assert_eq!(s.get("elevation_ft").and_then(Value::as_f64), Some(1427.0));
    let f = s.get("fcsts").and_then(Value::as_array).unwrap();
    assert_eq!(f[0].get("ceiling_ft").and_then(Value::as_f64), Some(4000.0));
    assert_eq!(f[1].get("change").and_then(Value::as_str), Some("FM"));
    let until = held_until("tafs", &v, 0).unwrap().unwrap();
    assert_eq!(Some(until), time::parse_iso("2026-11-03T12:00:00Z"));
}

#[test]
fn a_bulletins_heading_dates_it() {
    let near = time::parse_iso("2026-11-01T02:00:00Z");
    assert_eq!(wmo_issued("WSUS32 KKCI 311655 SIGC", near), time::parse_iso("2026-10-31T16:55:00Z"));
    assert_eq!(wmo_issued("no heading", near), None);
}

/// The combined SIGMET file as aviationweather.gov served it on
/// 2026-11-21 (sigmets.cache.xml, schema sigmet1_1.xsd), cut to five: a
/// convective SIGMET, a domestic one for turbulence (from the data API,
/// 2026-11-20, none being in force on the 21st), an oceanic one for
/// thunderstorms, one of two areas and one for volcanic ash.
const SIGMETS: &str = include_str!("samples/sigmets.cache.xml");

#[test]
fn the_combined_sigmet_file_in_the_stores_shape() {
    let v = json::parse(&airsigmets(SIGMETS).unwrap()).unwrap();
    let all = v.as_array().unwrap();
    let pick = |k: usize, key: &str| all[k].get(key).cloned().unwrap_or(Value::Null);
    let hazards: Vec<_> = all.iter().map(|a| a.get("hazard").and_then(Value::as_str).unwrap_or("")).collect();
    // The multi-area SIGMET is one advisory an area: six from five.
    assert_eq!(hazards, ["CONVECTIVE", "TURB", "TS", "ICE", "ICE", "VA"]);
    assert!(all.iter().all(|a| a.get("type").and_then(Value::as_str) == Some("SIGMET")));
    // WSUS32 KKCI 212355, CONVECTIVE SIGMET 24C, TOPS TO FL360.
    assert_eq!(pick(0, "altitude_low_ft"), Value::Null);
    assert_eq!(pick(0, "altitude_high_ft").as_f64(), Some(36000.0));
    assert_eq!(pick(0, "valid_from").as_f64(), time::parse_iso("2026-11-21T23:55:00Z").map(|t| t as f64));
    assert_eq!(pick(0, "valid_to").as_f64(), time::parse_iso("2026-11-22T01:55:00Z").map(|t| t as f64));
    assert_eq!(pick(0, "issued").as_str(), Some("2026-11-21T23:55:00Z"));
    let ring = |k: usize| pick(k, "coords").as_array().map_or(0, |a| a.len());
    assert_eq!((ring(0), ring(1), ring(2), ring(3), ring(4), ring(5)), (5, 6, 6, 20, 4, 5));
    // SIGMET WHISKEY 1, OCNL SEV TURB BLW 160.
    assert_eq!(pick(1, "altitude_high_ft").as_f64(), Some(16000.0));
    // SBAO SIGMET 17, FL140/240; the ash from the surface to FL220.
    assert_eq!((pick(3, "altitude_low_ft").as_f64(), pick(3, "altitude_high_ft").as_f64()), (Some(14000.0), Some(24000.0)));
    assert_eq!((pick(5, "altitude_low_ft").as_f64(), pick(5, "altitude_high_ft").as_f64()), (Some(0.0), Some(22000.0)));
    // The first point is the file's, latitude then longitude.
    let first = pick(0, "coords").as_array().unwrap()[0].clone();
    assert_eq!(first.as_array().unwrap()[0].as_f64(), Some(34.363));
    assert_eq!(first.as_array().unwrap()[1].as_f64(), Some(-97.249));
    // Held to the last of them to end (FAA-H-8083-28B 26.2.4).
    let until = held_until("airsigmets", &v, 0).unwrap().unwrap();
    assert_eq!(Some(until), time::parse_iso("2026-11-22T03:30:00Z"));
}
