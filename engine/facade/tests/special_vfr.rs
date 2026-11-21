//! 14 CFR 91.157 special VFR and 91.155(b)(2)'s Class G night pattern
//! exception asked by name, as the hosts ask them, each held to the shared
//! cases in apps/web/src/lib/fixtures/specialVfr.json (both sides of each
//! line: 1 sm, 10,000 ft MSL, 1,200 ft above the surface, 3 sm, the sun 6
//! degrees down in Alaska, the airports of part 91 appendix D, section 3)
//! and to the contract's shapes.

mod common;

use common::{fixture, holds_cases};

#[test]
fn special_vfr_as_the_fixture_says() {
    holds_cases("special_vfr", fixture("specialVfr.json")["special_vfr"].as_array().unwrap());
}

#[test]
fn the_class_g_night_pattern_exception_as_the_fixture_says() {
    holds_cases("vfr_class_g_night_pattern", fixture("specialVfr.json")["vfr_class_g_night_pattern"].as_array().unwrap());
}

#[test]
fn a_class_letter_not_known_is_refused() {
    assert!(wingtip_engine::call::call("special_vfr", r#"{"surface_area":"X"}"#).is_err());
    assert!(wingtip_engine::call::call("vfr_class_g_night_pattern", r#"{"class":"G"}"#).is_err());
}
