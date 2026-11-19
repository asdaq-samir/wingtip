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
