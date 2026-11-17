use super::plans_cases::{climbs, course_leg, fixes, profile};
use super::*;

// --- Descents (test_altitude_plans.py) ----------------------------------

pub(super) fn descents(legs: Value, fixes: &[Value], end_ft: Option<f64>, before_nm: Option<f64>, fix: Option<&str>) -> Value {
    ask(
        "navlog_with_descents",
        json!({"legs": legs, "fixes": fixes, "end_altitude_ft": end_ft, "end_before_nm": before_nm, "end_fix": fix}),
    )
}

#[test]
fn the_descent_to_the_pattern_starts_three_miles_out_for_every_thousand_feet() {
    // 5,500 down to a 1,500 ft pattern is 4,000 ft: 12 nm out, at 100 kt
    // 556 fpm -- 550 to the nearest 50 (AIM 2-1-2's ~3 degree path).
    let cruise = json!([course_leg(60.0, 5500.0), course_leg(60.0, 5500.0)]);
    let legs = descents(cruise.clone(), &fixes(), Some(1500.0), Some(0.0), None);
    assert!(legs[0]["tod"].is_null());
    let tod = &legs[1]["tod"];
    assert_eq!((f(&tod["along_nm"]), f(&tod["to_ft"]), &tod["pattern"], f(&tod["fpm"])), (48.0, 1500.0, &json!(true), 550.0));
    assert!(close(f(&tod["ete_min"]), 28.8, 1e-9) && f(&tod["lat"]) > 40.7);
    for i in 0..2 {
        assert_eq!(legs[i]["ete_min"], cruise[i]["ete_min"]);
    }
}

#[test]
fn a_step_down_is_a_descent_to_the_lower_level_by_its_fix() {
    let legs = descents(json!([course_leg(60.0, 5500.0), course_leg(60.0, 3500.0)]), &fixes(), None, Some(0.0), None);
    assert_eq!((f(&legs[0]["tod"]["along_nm"]), f(&legs[0]["tod"]["to_ft"])), (54.0, 3500.0));
    assert_eq!(legs[0]["tod"]["pattern"], json!(false));
    assert!(legs[1]["tod"].is_null());
}

#[test]
fn a_descent_to_an_approach_levels_at_its_fix_short_of_the_field() {
    // 5,500 down to an initial approach fix crossed at 3,000, 15 nm out:
    // 2,500 ft is 7.5 nm, so 22.5 nm before the field, on the last leg.
    let legs = descents(json!([course_leg(60.0, 5500.0), course_leg(60.0, 5500.0)]), &fixes(), Some(3000.0), Some(15.0), Some("ANDOE"));
    let tod = &legs[1]["tod"];
    assert_eq!((f(&tod["along_nm"]), f(&tod["to_ft"]), tod["fix"].as_str(), &tod["pattern"]), (37.5, 3000.0, Some("ANDOE"), &json!(false)));
    assert_eq!(f(&tod["fpm"]), (2500.0_f64 / (7.5 / 100.0 * 60.0) / 50.0).round() * 50.0);
}

#[test]
fn a_fix_further_out_than_the_last_leg_moves_the_descent_onto_the_leg_before() {
    let legs = descents(json!([course_leg(60.0, 5500.0), course_leg(60.0, 5500.0)]), &fixes(), Some(3000.0), Some(70.0), Some("ANDOE"));
    assert!(legs[1]["tod"].is_null());
    assert_eq!(f(&legs[0]["tod"]["along_nm"]), 42.5);
    assert_eq!(legs[0]["tod"]["fix"], "ANDOE");
}

#[test]
fn a_cruise_under_the_fixs_altitude_has_no_descent_to_it() {
    let legs = descents(json!([course_leg(60.0, 2500.0)]), &fixes()[..2], Some(3000.0), Some(10.0), Some("ANDOE"));
    assert!(legs[0]["tod"].is_null());
}

#[test]
fn a_flight_too_short_for_three_to_one_starts_down_at_the_top_of_its_climb() {
    // 10 nm: the climb to 4,500 takes 5 of them, and 3,000 ft down at three
    // to one would take 9.
    let climbed = climbs(json!([course_leg(10.0, 4500.0)]), Some(500.0), profile());
    let tod = descents(climbed.clone(), &fixes()[..2], Some(1500.0), Some(0.0), None)[0]["tod"].clone();
    assert_eq!(tod["along_nm"], climbed[0]["toc"]["along_nm"]);
    assert!(f(&tod["fpm"]) > 550.0);
}

#[test]
fn an_approach_ends_the_descent_at_its_first_fix_under_the_cruise() {
    // The initial approach fix at 3,000 under a 5,500 cruise; cruising at
    // 2,500, the next fix lower (the final approach fix's 2,300); the
    // missed approach's never.
    let fixes = json!([
        {"ident": "ANDOE", "lat": 46.89, "lon": -92.19, "min_ft": 3000, "max_ft": null, "missed": false},
        {"ident": "FAFIX", "lat": 46.86, "lon": -92.19, "min_ft": null, "max_ft": 2300, "missed": false},
        {"ident": "MISSD", "lat": 46.74, "lon": -92.19, "min_ft": 1500, "max_ft": null, "missed": true},
    ]);
    let field = json!({"lat": 46.8421, "lon": -92.1936});
    let high = ask("navlog_approach_end", json!({"fixes": fixes, "cruise_ft": 5500, "field": field}));
    assert_eq!((f(&high["end_altitude_ft"]), high["end_fix"].as_str()), (3000.0, Some("ANDOE")));
    assert!(close(f(&high["end_before_nm"]), 2.87, 0.05), "{high}");
    let low = ask("navlog_approach_end", json!({"fixes": fixes, "cruise_ft": 2500, "field": field}));
    assert_eq!((f(&low["end_altitude_ft"]), low["end_fix"].as_str()), (2300.0, Some("FAFIX")));
    assert!(ask("navlog_approach_end", json!({"fixes": fixes, "cruise_ft": 2000, "field": field})).is_null());
}

// --- Holds -----------------------------------------------------------------

#[test]
fn a_hold_adds_its_minutes_and_fuel_to_the_leg() {
    let mut leg = course_leg(60.0, 5500.0);
    leg["magnetic_variation_deg"] = json!(0.0);
    let hold = json!({"fix": "KMSN", "inbound": 270, "right": true, "leg_min": 1, "leg_nm": null, "turns": 2, "minutes": null});
    let held = ask(
        "navlog_hold",
        json!({"leg": leg, "before": leg, "hold": hold, "fix": {"lat": 43.0, "lon": -89.0}, "variation_deg": 0.0, "at_end": false}),
    );
    // Two laps of a timed hold: 2 x (two 1-minute legs and two minutes
    // of standard-rate turns), FAA-H-8083-15B ch. 7.
    assert_eq!(f(&held["hold"]["minutes"]), 8.0);
    assert_eq!(f(&held["ete_min"]), 44.0);
    assert!(close(f(&held["fuel_gal"]), 4.8 + 8.0 / 60.0 * 8.0, 0.01));
    // Arriving on 045 to an inbound 270 with right turns, 135 degrees
    // round: the teardrop's sector (AIM 5-3-8 j.3).
    assert_eq!(held["hold"]["entry"], "teardrop");
    let path = held["hold"]["path"].as_array().unwrap();
    assert_eq!(path.first(), path.last());
}
