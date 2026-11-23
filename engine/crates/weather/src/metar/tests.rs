use super::*;

#[test]
fn a_ceiling_layer_with_no_height_is_a_ceiling_not_known() {
    // 10 SM under an overcast of no height: not VFR, not known (14 CFR 1.1).
    let m = parse("METAR KXYZ 021355Z AUTO 27005KT 10SM OVC/// 10/05 A2992 RMK AO2").unwrap();
    assert_eq!((m.ceiling_ft(), m.ceiling_unknown()), (None, true));
    assert_eq!(flight_category_of(m.ceiling_ft(), m.ceiling_unknown(), m.visibility_sm), None);
    for sky in ["BKN///", "VV///"] {
        let m = parse(&format!("METAR KXYZ 021355Z AUTO 27005KT 10SM {sky} 10/05 A2992")).unwrap();
        assert!(m.ceiling_unknown(), "{sky}");
    }
    // Under a mile it is LIFR whatever the ceiling.
    let m = parse("METAR KXYZ 021355Z AUTO 00000KT 1/4SM FG VV/// 10/10 A2992").unwrap();
    assert_eq!(flight_category_of(m.ceiling_ft(), m.ceiling_unknown(), m.visibility_sm), Some("LIFR"));
    // One with no height above a measured ceiling leaves it known.
    let m = parse("METAR KXYZ 021355Z AUTO 27005KT 10SM BKN008 OVC/// 10/05 A2992").unwrap();
    assert_eq!((m.ceiling_ft(), m.ceiling_unknown()), (Some(800.0), false));
    assert_eq!(flight_category_of(m.ceiling_ft(), m.ceiling_unknown(), m.visibility_sm), Some("IFR"));
    // A few or scattered of no height is no ceiling either way.
    let m = parse("METAR KXYZ 021355Z AUTO 27005KT 10SM FEW/// 10/05 A2992").unwrap();
    assert_eq!((m.ceiling_ft(), m.ceiling_unknown()), (None, false));
    assert_eq!(flight_category_of(m.ceiling_ft(), m.ceiling_unknown(), m.visibility_sm), Some("VFR"));
}

#[test]
fn with_no_visibility_only_a_ceiling_under_500_ft_settles_the_category() {
    // AIM 7-1-7: the worse of ceiling and visibility decides, so with
    // the visibility missing a 5,000 ft ceiling is no category at all.
    assert_eq!(flight_category_of(Some(5000.0), false, None), None);
    assert_eq!(flight_category_of(Some(2000.0), false, None), None);
    assert_eq!(flight_category_of(Some(499.0), false, None), Some("LIFR"));
    assert_eq!(flight_category_of(None, false, None), None);
    assert_eq!(flight_category_of(Some(5000.0), false, Some(10.0)), Some("VFR"));
}

#[test]
fn a_us_report() {
    let m = parse("METAR KDLH 021355Z 27015G25KT 1 1/2SM -RA BR BKN008 OVC015 M02/M04 A2992 RMK AO2 T10171039").unwrap();
    assert_eq!(m.wind, Some(Wind { dir_true_deg: Some(270.0), speed_kt: 15.0, gust_kt: Some(25.0) }));
    assert_eq!(m.visibility_sm, Some(1.5));
    assert_eq!(m.weather, ["-RA", "BR"]);
    assert_eq!(m.ceiling_ft(), Some(800.0));
    assert_eq!((m.temp_c, m.dewpoint_c), (Some(-1.7), Some(-3.9)));
    assert_eq!(m.altimeter_inhg, Some(29.92));
    assert_eq!(flight_category_of(m.ceiling_ft(), false, m.visibility_sm), Some("IFR"));
}

#[test]
fn a_report_from_outside_the_us() {
    let m = parse("METAR SBVT 021400Z 05009KT 5000 BR SCT004 OVC013 25/24 Q1016").unwrap();
    // 5,000 m is 3.107 sm: written 3, the whole mile at or below it.
    assert_eq!(m.visibility_sm, Some(3.0));
    assert!((m.altimeter_inhg.unwrap() - 30.00).abs() < 0.005);
    assert_eq!(m.ceiling_ft(), Some(1300.0));
}

#[test]
fn nothing_from_a_line_that_is_no_report() {
    for bad in ["", "METAR", "METAR KDLH", "METAR KDLH 0213Z", "hello world 021355Z"] {
        assert!(parse(bad).is_none(), "{bad}");
    }
}

#[test]
fn a_metric_visibility_is_the_step_below_never_above() {
    // 1,200 m is 0.7456 sm: 11/16, not rounded up to 3/4 or 1.
    assert_eq!(parse("METAR EGLL 021350Z 24005KT 1200 BR OVC002 08/08 Q1013").unwrap().visibility_sm, Some(11.0 / 16.0));
    // 800 m is 0.497 sm: 7/16, under the half mile.
    assert_eq!(metres_to_sm(800.0), 7.0 / 16.0);
    // A figure already on a step stays on it.
    assert_eq!(statute_miles_down(1.5), 1.5);
    assert_eq!(statute_miles_down(0.0625), 0.0625);
    assert_eq!(statute_miles_down(4.99), 4.0);
    assert_eq!(metres_to_sm(9999.0), 6.0);
}
