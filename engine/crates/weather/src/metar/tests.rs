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
fn a_metric_visibility_is_the_reportable_value_it_stands_for() {
    // FMH-1 Table 6-1: the metric step for each US value reads as it.
    assert_eq!(parse("METAR EGLL 021350Z 24005KT 1200 BR OVC002 08/08 Q1013").unwrap().visibility_sm, Some(0.75));
    for (metres, sm) in [
        (100.0, 0.0625),
        (200.0, 0.125),
        (400.0, 0.25),
        (800.0, 0.5),
        (1600.0, 1.0),
        (2400.0, 1.5),
        (3200.0, 2.0),
        (4800.0, 3.0),
        (8000.0, 5.0),
    ] {
        assert_eq!(metres_to_sm(metres), sm, "{metres} m");
    }
    // Between two values, the lower (FMH-1 6.5.2): 1,500 m is 0.93 sm, 7/8.
    assert_eq!(metres_to_sm(1500.0), 0.875);
    // 5,000 m is 3.1 sm: 3, the whole mile below.
    assert_eq!(metres_to_sm(5000.0), 3.0);
    // A figure standing for no US value is floored, never lifted a step:
    // 4,000 m is 2.485 sm, 2 1/4 (not 2 1/2); 4,400 m is 2.734, 2 1/2.
    assert_eq!(metres_to_sm(4000.0), 2.25);
    assert_eq!(metres_to_sm(4400.0), 2.5);
    assert_eq!(metres_to_sm(9999.0), 6.0);
    // Ten kilometres and more, as some states write them: 18 km is 11.2 sm.
    assert_eq!(parse("METAR SKBO 021300Z 36005KT 18KM FEW020 12/08 Q1028").unwrap().visibility_sm, Some(11.0));
}

#[test]
fn a_visibility_is_the_reportable_value_at_or_below_never_above() {
    // FMH-1 Table 6-1: sixteenths stop at 3/8; no report writes 7/16,
    // 11/16 or 15/16.
    assert_eq!(statute_miles_down(0.0625), 0.0625);
    assert_eq!(statute_miles_down(0.4375), 0.375);
    assert_eq!(statute_miles_down(0.7456), 0.625);
    assert_eq!(statute_miles_down(0.9942), 0.875);
    assert_eq!(statute_miles_down(1.5), 1.5);
    assert_eq!(statute_miles_down(2.2), 2.0);
    assert_eq!(statute_miles_down(2.3), 2.25);
    assert_eq!(statute_miles_down(4.99), 4.0);
    assert_eq!(statute_miles_down(15.0), 15.0);
    assert_eq!(statute_miles_down(19.9), 15.0);
    assert_eq!(statute_miles_down(23.0), 20.0);
    assert_eq!(statute_miles_down(44.0), 40.0);
}
