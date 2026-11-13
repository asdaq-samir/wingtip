//! The figures that are an airplane's own (the owner, 2026-11-09: nothing
//! assumes a Cessna 172): the glide at the profile's own ratio, the start
//! and taxi allowance, the climb speed and the short-field tables' wind
//! notes, each answered as missing where the profile has none, never
//! filled from the 172S's POH. Asked by name, as every host asks them.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;
use wingtip_engine::units::FT_PER_NM;

fn ask(name: &str, input: Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name} answered {text}: {e}"))
}

fn n(v: &Value) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("{v} is not a number"))
}

fn f(v: &Value) -> f64 {
    n(v)
}

fn close(a: f64, b: f64, within: f64) -> bool {
    (a - b).abs() <= within
}

fn c172() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../data/aircraft/c172.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

// The Cessna 172S's 9 to 1 (its POH, Section 3 and figure 3-1, the c172
// profile's glide.ratio): 9,000 ft forward for each 1,000 down, 1.48 nm.

#[test]
fn the_glide_is_the_airplanes_own_ratio_in_the_air() {
    let range = |alt: Value, kt: Value, ground: Value| {
        ask("glide_range", json!({ "altitude_ft": alt, "speed_kt": kt, "ground_ft": ground, "glide_ratio": 9 }))
    };
    assert!(close(n(&range(json!(4800), json!(100), json!(800))), 4.0 * 9000.0 / FT_PER_NM, 1e-9));
    // No airplane, or no glide in its profile: no glide is worked out,
    // never a stock airplane's.
    assert_eq!(ask("glide_range", json!({ "altitude_ft": 4800, "speed_kt": 100, "ground_ft": 800 })), Value::Null);
    assert_eq!(ask("glide_range", json!({ "altitude_ft": 4800, "speed_kt": 100, "ground_ft": 800, "glide_ratio": null })), Value::Null);
    assert_eq!(range(json!(1000), json!(100), json!(800)), Value::Null);
    assert_eq!(range(json!(4800), json!(10), json!(800)), Value::Null);
    assert_eq!(range(Value::Null, json!(100), json!(800)), Value::Null);
    assert_eq!(range(json!(4800), json!(100), Value::Null), Value::Null);
}

#[test]
fn a_field_within_a_glide_is_judged_over_its_own_elevation_at_pattern_height() {
    let reaches = |alt: f64, kt: f64, nm: f64, elevation: Value| {
        ask("glide_reaches", json!({ "altitude_ft": alt, "speed_kt": kt, "distance_nm": nm, "elevation_ft": elevation, "glide_ratio": 9 }))
            .as_bool()
            .unwrap()
    };
    // 5,000 ft over a 600 ft field is 3,400 ft to spare above its pattern:
    // 5.0 nm at 9 to 1. A field 6 nm off at 2,500 ft has 1,500 ft: 2.2 nm.
    assert!(reaches(5000.0, 100.0, 5.0, json!(600)));
    assert!(!reaches(5000.0, 100.0, 6.0, json!(600)));
    assert!(!reaches(5000.0, 100.0, 6.0, json!(2500)));
    assert!(!reaches(5000.0, 10.0, 1.0, json!(600)));
    assert!(!reaches(5000.0, 100.0, 1.0, Value::Null));
    assert!(!reaches(1500.0, 100.0, 0.5, json!(600)));
    // With no glide ratio, nothing is judged within a glide.
    assert_eq!(ask("glide_reaches", json!({ "altitude_ft": 5000, "speed_kt": 100, "distance_nm": 1, "elevation_ft": 600 })), json!(false));
    assert_eq!(ask("underway", json!({ "speed_kt": 40 })), json!(true));
    assert_eq!(ask("underway", json!({ "speed_kt": 39.9 })), json!(false));
    assert_eq!(ask("underway", json!({})), json!(false));
}

#[test]
fn the_fuel_required_includes_start_taxi_and_takeoff() {
    let plan = ask(
        "navlog_fuel_plan",
        json!({"total_fuel_gal": 20.0, "profile": {"fuel_burn_gph": 8.0, "usable_fuel_gal": 40, "taxi_fuel_gal": 1.4}, "night": false}),
    );
    // The profile's own 1.4 gal (the c172's, its POH's), and 30 minutes at
    // 8 gph by day (91.151(a)(1)).
    assert_eq!(f(&plan["taxi_gal"]), 1.4);
    assert_eq!(f(&plan["fuel_required_gal"]), 25.4);
    assert_eq!(f(&plan["fuel_margin_gal"]), 14.6);
    // A profile with no allowance of its own: none is assumed, the taxi
    // null and the fuel required the trip and reserve alone.
    let bare =
        ask("navlog_fuel_plan", json!({"total_fuel_gal": 20.0, "profile": {"fuel_burn_gph": 8.0, "usable_fuel_gal": 40}, "night": false}));
    assert!(bare["taxi_gal"].is_null());
    assert_eq!(f(&bare["fuel_required_gal"]), 24.0);
    let own =
        ask("navlog_fuel_plan", json!({"total_fuel_gal": 20.0, "profile": {"fuel_burn_gph": 8.0, "taxi_fuel_gal": 2.0}, "night": false}));
    assert_eq!(f(&own["fuel_required_gal"]), 26.0);
    assert!(own["fuel_margin_gal"].is_null());
}

#[test]
fn a_profile_with_no_climb_speed_flies_no_climb_rather_than_a_stock_airplanes() {
    // No ratio of climb to cruise is taken from another airplane (the
    // owner, 2026-11-09): the leg as it was, with no top of climb.
    let bare = json!({"cruise_tas_kt": 100.0, "fuel_burn_gph": 8.0, "service_ceiling_ft": 14000.0});
    let leg = json!([{"distance_nm": 60.0, "altitude_ft": 3500.0, "groundspeed_kt": 100.0, "ete_min": 36.0,
        "fuel_gal": 4.8, "wind": null, "tas_kt": 100.0, "fuel_burn_gph": 8.0, "oat_c": null}]);
    assert_eq!(ask("navlog_with_climbs", json!({"legs": leg, "start_altitude_ft": 500.0, "profile": bare})), leg);
}

#[test]
fn an_own_airplane_with_no_climb_rate_or_ceiling_flies_no_climb() {
    // A pilot's own airplane of no stock type, whose record has its climb
    // speed but not its rate or its ceiling: the climb's minutes are the
    // rate falling to 100 fpm at the ceiling, and neither is guessed, so
    // the legs fly level -- and no ceiling is asked of it at all.
    let leg = json!([{"distance_nm": 60.0, "altitude_ft": 3500.0, "groundspeed_kt": 100.0, "ete_min": 36.0,
        "fuel_gal": 4.8, "wind": null, "tas_kt": 100.0, "fuel_burn_gph": 8.0, "oat_c": null}]);
    let no_rate = json!({"cruise_tas_kt": 100.0, "fuel_burn_gph": 8.0, "climb_tas_kt": 70.0, "service_ceiling_ft": 14000.0});
    assert_eq!(ask("navlog_with_climbs", json!({"legs": leg, "start_altitude_ft": 500.0, "profile": no_rate})), leg);
    let no_ceiling = json!({"cruise_tas_kt": 100.0, "fuel_burn_gph": 8.0, "climb_tas_kt": 70.0, "climb_rate_fpm_sea_level": 700.0});
    assert_eq!(ask("navlog_with_climbs", json!({"legs": leg, "start_altitude_ft": 500.0, "profile": no_ceiling})), leg);
    // With all three it climbs.
    let all = json!({"cruise_tas_kt": 100.0, "fuel_burn_gph": 8.0, "climb_tas_kt": 70.0, "climb_rate_fpm_sea_level": 700.0,
        "service_ceiling_ft": 14000.0});
    let climbed = ask("navlog_with_climbs", json!({"legs": leg, "start_altitude_ft": 500.0, "profile": all}));
    assert!(f(&climbed[0]["climb_min"]) > 0.0);
}

#[test]
fn an_estimate_carries_the_taxi_allowance_and_45_minutes() {
    // 120 nm at 120 kt is an hour; at 8 gph, 8 gal; with 1.4 gal to start
    // and taxi and 45 minutes' reserve (14 CFR 91.151(a)(2), 91.167(a)(3)),
    // 6 gal, 15.4.
    let a = ask("fuel_estimate", json!({"distance_nm": 120.0, "cruise_tas_kt": 120.0, "fuel_burn_gph": 8.0, "taxi_fuel_gal": 1.4}));
    assert_eq!(a["minutes"], json!(60.0));
    assert_eq!(a["trip_gal"], json!(8.0));
    assert!((a["required_gal"].as_f64().unwrap() - 15.4).abs() < 1e-9);
    // No allowance in the airplane's profile: none assumed, 14.0.
    let bare = ask("fuel_estimate", json!({"distance_nm": 120.0, "cruise_tas_kt": 120.0, "fuel_burn_gph": 8.0}));
    assert!((bare["required_gal"].as_f64().unwrap() - 14.0).abs() < 1e-9);
    let none = ask("fuel_estimate", json!({"distance_nm": 120.0, "cruise_tas_kt": 120.0}));
    assert_eq!(none["required_gal"], serde_json::Value::Null);
    assert_eq!(ask("fuel_estimate", json!({"distance_nm": 120.0}))["minutes"], serde_json::Value::Null);
}

#[test]
fn endurance_keeps_the_reserve_the_rules_ask_back() {
    // 53 gal at 10 gph lasts 318 minutes; IFR keeps 45 back (14 CFR
    // 91.167(a)(3)), 7.5 gal, leaving 273; day VFR keeps 30 (91.151(a)(1)).
    let ifr = ask("endurance", json!({"usable_gal": 53.0, "burn_gph": 10.0, "reserve": "ifr"}));
    assert_eq!((ifr["minutes"].as_f64(), ifr["reserve_gal"].as_f64()), (Some(318.0), Some(7.5)));
    assert_eq!((ifr["after_reserve_min"].as_f64(), ifr["below_reserve"].as_bool()), (Some(273.0), Some(false)));
    let day = ask("endurance", json!({"usable_gal": 53.0, "burn_gph": 10.0, "reserve": "vfr_day"}));
    assert_eq!(day["after_reserve_min"].as_f64(), Some(288.0));
    // Under the reserve: zero left and flagged, never refused.
    let short = ask("endurance", json!({"usable_gal": 4.0, "burn_gph": 10.0, "reserve": "vfr_night"}));
    assert_eq!((short["after_reserve_min"].as_f64(), short["below_reserve"].as_bool()), (Some(0.0), Some(true)));
    // No usable fuel in the profile: no figure, none assumed.
    assert_eq!(ask("endurance", json!({"burn_gph": 10.0, "reserve": "ifr"}))["minutes"], serde_json::Value::Null);
}

#[test]
fn a_table_without_its_pohs_wind_notes_takes_no_other_airplanes() {
    // The 172S's takeoff table with its notes taken out: no credit for a
    // headwind, and a tailwind said rather than corrected by its notes.
    let full = c172()["takeoff"].clone();
    // With the 172S's own notes: a tenth off for each 9 kt of headwind, a
    // tenth on for each 2 kt of tailwind (its POH, figures 5-5 and 5-11).
    let roll = |wind: f64| {
        let d =
            ask("gonogo_end_distance", json!({"table": full, "pressure_alt_ft": 0, "temp_c": 10, "weight_lb": 2550, "headwind_kt": wind}));
        d["ground_roll_ft"].as_f64().unwrap()
    };
    assert_eq!((roll(9.0), roll(-2.0)), (835.0, 1020.0));
    // With them, past the 172S's 10 kt of tailwind its POH gives no
    // figures, and says so.
    let past =
        ask("gonogo_end_distance", json!({"table": full, "pressure_alt_ft": 0, "temp_c": 10, "weight_lb": 2550, "headwind_kt": -12}));
    assert_eq!(past["caveats"], json!(["the POH gives no figures for a tailwind this strong"]));
    let mut table = full.clone();
    for k in ["headwind_kt_per_10pct", "tailwind_kt_per_10pct", "tailwind_max_kt"] {
        table.as_object_mut().unwrap().remove(k);
    }
    let at = |wind: f64| {
        ask("gonogo_end_distance", json!({"table": table, "pressure_alt_ft": 0, "temp_c": 10, "weight_lb": 2550, "headwind_kt": wind}))
    };
    let still = at(0.0);
    assert!(still["ground_roll_ft"].is_number(), "{still}");
    assert_eq!(at(9.0)["ground_roll_ft"], still["ground_roll_ft"], "{still}");
    let tail = at(-2.0);
    assert_eq!(tail["ground_roll_ft"], still["ground_roll_ft"]);
    assert_eq!(tail["caveats"], json!(["the wind correction is not in this airplane's profile"]));
}
