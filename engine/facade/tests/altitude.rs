//! The altitude rules (crate::altitude, #482 phase 3) asked by name as the
//! hosts ask them, held to the shared fixture apps/web/src/lib/fixtures/
//! altitude.json -- made from the planner's own tests of wingtip.altitude,
//! wingtip.ifr and app.planning before the move -- and to the planner's
//! select_cruise_altitude cases with their data stubbed.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

mod common;
use common::assert_same;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/altitude.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ask(name: &str, input: Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

#[test]
fn the_cruising_altitudes_are_91_159s_and_91_179s() {
    for case in fixture()["legal"].as_array().unwrap() {
        let answer = ask("legal_cruising_altitudes", case["input"].clone());
        let first = case["first"].as_array().unwrap();
        assert_same(&Value::Array(answer.as_array().unwrap()[..first.len()].to_vec()), &case["first"], &case["input"]);
        if first.is_empty() {
            assert!(answer.as_array().unwrap().is_empty());
        }
    }
}

#[test]
fn the_distance_under_the_clouds() {
    let f = fixture();
    for case in f["underClouds"].as_array().unwrap() {
        assert_eq!(ask("highest_under_clouds_ft", json!({ "cloud_base_ft": case["cloud_base_ft"] })).as_f64(), case["answer"].as_f64());
    }
}

#[test]
fn a_route_with_no_legal_altitude_is_flown_anyway_and_says_why() {
    let f = fixture();
    for case in f["anyway"].as_array().unwrap() {
        assert_eq!(
            ask("altitude_anyway", json!({ "selection": case["selection"] })).as_f64(),
            case["answer"].as_f64(),
            "{}",
            case["selection"]
        );
    }
    for case in f["noAltitude"].as_array().unwrap() {
        let why = ask("no_altitude", case["input"].clone());
        assert_eq!(why["brief"], case["brief"]);
        assert_eq!(why["class_b"], case["classB"]);
    }
}

const DEP: [f64; 2] = [45.0, -90.0];
const DOGLEG: [f64; 2] = [45.5, -89.85];
const DEST: [f64; 2] = [46.0, -90.0];

/// The planner's stubbed sources: a flat 2,000 ft floor over 1,500 ft
/// ground, so 91.159's rule begins at 4,500 ft; no airspace or variation.
fn selected(extra: Value) -> Value {
    let mut input = json!({
        "start": DEP, "end": DEST, "fixes": [DEP, DOGLEG, DEST], "breaks_nm": [0.0, 30.0, 60.0],
        "floors": [{ "floor_ft": 2000, "lowest_ground_ft": 1500 }, { "floor_ft": 2000, "lowest_ground_ft": 1500 }],
        "airspace_ceilings_ft": [null, null], "service_ceilings_ft": [14000, 14000],
        "variation_deg": 0, "leg_variations_deg": [0, 0], "stations": [], "special_use": [], "hazards": [],
        "weather_unavailable": [],
    });
    for (k, v) in extra.as_object().unwrap() {
        input[k] = v.clone();
    }
    ask("select_cruise_altitude", input)
}

#[test]
fn each_leg_is_rounded_to_its_own_magnetic_course() {
    let result = selected(json!({}));
    let above = |s: &Value| -> Vec<f64> {
        let from = s["hemispheric_rule_from_ft"].as_f64().unwrap();
        s["candidates_ft"].as_array().unwrap().iter().filter_map(Value::as_f64).filter(|&a| a > from).collect()
    };
    let (first, second) = (&result["segments"][0], &result["segments"][1]);
    assert_eq!(first["eastbound"], json!(true));
    assert_eq!(&above(first)[..2], &[5500.0, 7500.0]);
    assert_eq!(second["eastbound"], json!(false));
    assert_eq!(&above(second)[..2], &[6500.0, 8500.0]);
    assert_eq!(result["hemispheric_rule_from_ft"], json!(4500.0));
}

#[test]
fn the_clouds_cap_a_leg_and_leave_it_its_band_where_they_leave_none() {
    // A ceiling of 1,100 ft over 900 ft field: a 2,000 ft base, nothing
    // keeps 500 ft under it over a 2,000 ft floor.
    let station = json!([{ "icaoId": "KXYZ", "lat": 45.5, "lon": -90.0, "ceiling_ft": 1100, "elevation_ft": 900 }]);
    let result = selected(json!({ "stations": station, "min_ceiling_ft": 1100 }));
    assert_eq!(result["cloud_clearance_kept"], json!(false));
    assert_eq!(result["cloud_station"], json!("KXYZ"));
    // A higher base: the legs keep 500 ft under 4,000.
    let station = json!([{ "icaoId": "KXYZ", "lat": 45.5, "lon": -90.0, "ceiling_ft": 3100, "elevation_ft": 900 }]);
    let result = selected(json!({ "stations": station }));
    assert_eq!(result["cloud_clearance_kept"], json!(true));
    assert_eq!(result["band_ceiling_ft"], json!(3500.0));
    assert_eq!(*result["candidates_ft"].as_array().unwrap().last().unwrap(), json!(3500.0));
}

#[test]
fn a_class_b_shelf_floor_is_not_a_cruising_altitude() {
    // A Class B shelf "from 3,500 feet MSL" upward: 3,500 is inside it, and
    // 14 CFR 91.131(a)(1) takes no flight in without a clearance. Over a
    // 2,000 ft floor (91.159 from 4,500) the band is 2,000 to 3,000, never
    // 3,500; tight() and cautions.rs's "Into Class B" (alt >= shelf) agree.
    let result = selected(json!({ "airspace_ceilings_ft": [3500, 3500] }));
    for leg in result["segments"].as_array().unwrap() {
        let altitudes: Vec<f64> = leg["candidates_ft"].as_array().unwrap().iter().filter_map(Value::as_f64).collect();
        assert_eq!(altitudes, vec![2000.0, 2500.0, 3000.0], "{leg}");
    }
    // A shelf 100 ft above a step keeps the step: 3,600 allows 3,500.
    let result = selected(json!({ "airspace_ceilings_ft": [3600, 3600] }));
    let top = result["segments"][0]["candidates_ft"].as_array().unwrap().iter().filter_map(Value::as_f64).fold(0.0, f64::max);
    assert_eq!(top, 3500.0);
}

#[test]
fn icing_where_a_legal_altitude_reaches_the_freezing_level_with_moisture() {
    let dry = selected(json!({ "freezing": { "ft": 8000, "at_or_below": false } }));
    assert_eq!(dry["icing_possible"], json!(false));
    let wet = selected(json!({ "freezing": { "ft": 8000, "at_or_below": false }, "hazards": [{ "hazard": "ICE" }] }));
    assert_eq!(wet["icing_possible"], json!(true));
    let unknown = selected(json!({ "weather_unavailable": ["freezing_level"] }));
    assert_eq!(unknown["icing_possible"], Value::Null);
}

#[test]
fn no_altitude_enters_a_prohibited_area_the_route_crosses() {
    let area = json!([{ "name": "P-00", "type": "P", "floor_ft": 0, "ceiling_ft": 5000, "ceiling_ref": "MSL", "legs": [0, 1] }]);
    let result = selected(json!({ "special_use": area }));
    assert!(result["candidates_ft"].as_array().unwrap().iter().all(|a| a.as_f64().unwrap() > 5000.0));
}

#[test]
fn under_ifr_each_leg_flies_thousands_from_its_minimum_ifr_altitude() {
    let floors = json!([
        { "floor_ft": 3100, "highest_ft": 2050, "highest_is_obstacle": false, "mountainous": true },
        { "floor_ft": 3100, "highest_ft": 2050, "highest_is_obstacle": false, "mountainous": false },
    ]);
    let result = selected(json!({ "rules": "ifr", "floors": floors, "airspace_ceilings_ft": [3000, 3000] }));
    assert_eq!(result["rules"], json!("ifr"));
    let (first, second) = (&result["segments"][0], &result["segments"][1]);
    assert_eq!(&first["candidates_ft"].as_array().unwrap()[..3], &[json!(5000.0), json!(7000.0), json!(9000.0)]);
    assert_eq!(&second["candidates_ft"].as_array().unwrap()[..3], &[json!(4000.0), json!(6000.0), json!(8000.0)]);
    assert_eq!(first["obstacle_clearance_ft"], json!(2000.0));
    assert_eq!(second["obstacle_clearance_ft"], json!(1000.0));
    assert_eq!(result["mountainous"], json!(true));
    assert_eq!(first["airspace_ceiling_ft"], Value::Null);
}

#[test]
fn under_ifr_along_an_airway_the_mea_is_the_floor_and_the_maa_a_ceiling() {
    let airway = json!({ "id": "V100", "mea_ft": 5500, "gnss_mea_ft": null, "moca_ft": 2600, "maa_ft": 9000 });
    let result = selected(json!({
        "rules": "ifr", "airway": airway, "floors": [], "fixes": [DEP, DEST], "breaks_nm": [0.0, 60.0],
        "service_ceilings_ft": [25000], "leg_variations_deg": [0], "airspace_ceilings_ft": [null],
    }));
    let leg = &result["segments"][0];
    assert_eq!(leg["floor_ft"], json!(5500.0));
    assert_eq!(leg["band_ceiling_ft"], json!(9000.0));
    assert_eq!(leg["candidates_ft"], json!([7000.0, 9000.0]));
    assert_eq!(leg["airway"]["id"], json!("V100"));
}

#[test]
fn with_no_airplane_no_service_ceiling_caps_the_band() {
    // A 14,000 ft ceiling stops a VFR leg at 13,500; with no airplane the
    // band is the rules' -- up to 17,500 under Class A (14 CFR 71.33,
    // 91.159) -- and the segments say no ceiling.
    let capped = selected(json!({}));
    let free = selected(json!({ "service_ceilings_ft": [null, null] }));
    let top =
        |r: &Value, i: usize| r["segments"][i]["candidates_ft"].as_array().unwrap().iter().filter_map(Value::as_f64).fold(0.0, f64::max);
    assert!(top(&capped, 0) <= 14000.0);
    assert!(top(&free, 0) > 14000.0 && top(&free, 0) <= 17500.0, "{}", free["segments"][0]);
    assert!(free["segments"][0]["service_ceiling_ft"].is_null() && free["service_ceiling_ft"].is_null());
    // Under IFR, up to FL410 (14 CFR 91.179(b)).
    let ifr = selected(json!({ "service_ceilings_ft": [null, null], "rules": "ifr" }));
    assert!(top(&ifr, 0) > 17500.0 && top(&ifr, 0) <= 41000.0);
}
