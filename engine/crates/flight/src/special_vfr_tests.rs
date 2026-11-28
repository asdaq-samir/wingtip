//! special_vfr.rs's cases, each boundary of 91.157 and 91.155(b)(2) from
//! both sides (eCFR, current on 2026-11-21).

use super::*;

fn class_d() -> Asked {
    Asked { surface_area: Some('D'), airport: "DPA".into(), altitude_ft: Some(1500.0), night: Some(false), ..Asked::default() }
}

#[test]
fn a_class_d_by_day_in_a_mile_is_special_vfr_and_under_a_mile_is_not() {
    let at = |sm: f64| special_vfr(&Asked { flight_visibility_sm: Some(sm), clear_of_clouds: Some(true), ..class_d() });
    assert!(at(1.0).available);
    let under = at(0.99);
    assert!(!under.available);
    assert_eq!(under.problems[0].source, "14 CFR 91.157(b)(3)");
}

#[test]
fn below_ten_thousand_msl_and_not_at_it() {
    assert!(special_vfr(&Asked { altitude_ft: Some(9999.0), ..class_d() }).available);
    assert!(!special_vfr(&Asked { altitude_ft: Some(10_000.0), ..class_d() }).available);
}

#[test]
fn only_in_a_surface_area() {
    for c in ['B', 'C', 'D', 'E'] {
        assert!(special_vfr(&Asked { surface_area: Some(c), ..class_d() }).available, "{c}");
    }
    for c in [None, Some('G'), Some('A')] {
        assert!(!special_vfr(&Asked { surface_area: c, ..class_d() }).available, "{c:?}");
    }
}

#[test]
fn the_appendix_d_airports_by_either_ident() {
    for ident in ["ORD", "kord", "PHNL", "HNL", "DAL", "ADW"] {
        let a = special_vfr(&Asked { surface_area: Some('B'), airport: ident.into(), ..class_d() });
        assert!(!a.available, "{ident}");
        assert!(a.problems[0].source.contains("appendix D, section 3"));
    }
    // Midway is under O'Hare's Class B but not in the appendix.
    assert!(special_vfr(&Asked { surface_area: Some('C'), airport: "MDW".into(), ..class_d() }).available);
    assert_eq!(special_vfr_airports::NO_FIXED_WING_SVFR.len(), 33);
}

#[test]
fn at_night_only_rated_and_equipped() {
    let night = |rated, equipped| special_vfr(&Asked { night: Some(true), instrument_current: rated, ifr_equipped: equipped, ..class_d() });
    assert!(night(Some(true), Some(true)).available);
    assert!(!night(Some(false), Some(true)).available);
    assert!(!night(Some(true), Some(false)).available);
    // Not known: not ruled out, but still asked.
    let unknown = night(None, None);
    assert!(unknown.available);
    assert!(unknown.needs.iter().any(|l| l.source == "14 CFR 91.157(b)(4)"));
    // By day, not asked.
    assert!(!special_vfr(&class_d()).needs.iter().any(|l| l.source == "14 CFR 91.157(b)(4)"));
}

#[test]
fn in_alaska_the_sun_six_degrees_down_is_still_day() {
    let alaska = |elevation: f64| {
        special_vfr(&Asked {
            alaska: true,
            night: Some(true),
            sun_elevation_deg: Some(elevation),
            instrument_current: Some(false),
            ..class_d()
        })
    };
    assert!(alaska(-6.0).available);
    assert!(!alaska(-6.1).available);
}

#[test]
fn to_take_off_or_land_the_ground_visibility_then_the_flight_visibility() {
    let off = |ground, flight| {
        special_vfr(&Asked { takeoff_or_landing: true, ground_visibility_sm: ground, flight_visibility_sm: flight, ..class_d() })
    };
    assert!(off(Some(1.0), Some(1.0)).available);
    assert_eq!(off(Some(0.75), Some(1.0)).problems[0].source, "14 CFR 91.157(c)(1)");
    assert_eq!(off(None, Some(0.5)).problems.last().map(|l| l.source), Some("14 CFR 91.157(c)(2)"));
    assert!(off(None, None).available);
}

#[test]
fn class_g_at_night_in_the_pattern_below_1200_ft() {
    let ex = |agl: f64, night, pattern, sm| vfr::night_pattern_exception(true, agl, night, pattern, sm);
    assert!(ex(1199.0, true, true, Some(1.0)));
    assert!(ex(1199.0, true, true, Some(2.9)));
    // "below 1,200 feet above the surface": not at it.
    assert!(!ex(1200.0, true, true, Some(2.0)));
    // Under 1 sm, or 3 sm and more (the table's night row again).
    assert!(!ex(800.0, true, true, Some(0.9)));
    assert!(!ex(800.0, true, true, Some(3.0)));
    // By day, or outside the pattern.
    assert!(!ex(800.0, false, true, Some(2.0)));
    assert!(!ex(800.0, true, false, Some(2.0)));
    assert!(!vfr::night_pattern_exception(false, 800.0, true, true, Some(2.0)));
}

#[test]
fn appendix_d_section_4_bars_solo_students_at_twelve_airports() {
    // 14 CFR part 91, appendix D, section 4 (eCFR, 2026-11-19): 12 airports.
    assert_eq!(special_vfr_airports::NO_SOLO_STUDENT.len(), 12);
    for ident in ["KATL", "bos", "ADW", "KORD", "DFW", "KLAX", "MIA", "EWR", "KJFK", "LGA", "SFO", "DCA"] {
        assert!(special_vfr_airports::class_b_solo_barred(ident).is_some(), "{ident}");
    }
    // In section 3 but not 4, and a Class B satellite: not barred.
    for ident in ["BWI", "KDEN", "MDW", "SEA", ""] {
        assert!(special_vfr_airports::class_b_solo_barred(ident).is_none(), "{ident}");
    }
}
