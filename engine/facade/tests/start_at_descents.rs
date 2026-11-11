//! A pilot's Start At descent in the nav log (navlog_with_descents, a leg
//! marked start_at), held to the shared fixture
//! apps/web/src/lib/fixtures/startAtDescents.json, which the web's
//! startAtDescents test reads as well. The figures are worked from three
//! to one (333 ft a nm, AIM 2-1-2's 3 degree glide path) by hand, not
//! from the code.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/startAtDescents.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

/// A leg as the fixture gives it: [distance_nm, altitude_ft, start_at], at
/// 100 kt over the ground, 8 gal/h, on a course of 045.
fn leg(spec: &Value) -> Value {
    let (distance, altitude) = (spec[0].as_f64().unwrap(), spec[1].as_f64().unwrap());
    json!({"distance_nm": distance, "altitude_ft": altitude, "groundspeed_kt": 100.0, "ete_min": distance / 100.0 * 60.0,
        "fuel_gal": distance / 100.0 * 8.0, "wind": null, "tas_kt": 100.0, "fuel_burn_gph": 8.0, "oat_c": null,
        "true_course_deg": 45.0, "climb_min": 0.0, "toc": null, "start_at": spec[2]})
}

fn fixes() -> Value {
    json!([
        {"name": "AAA", "category": "departure", "lat": 40.0, "lon": -90.0},
        {"name": "Lake", "category": "lake", "lat": 40.7, "lon": -89.1},
        {"name": "BBB", "category": "destination", "lat": 41.4, "lon": -88.2},
    ])
}

#[test]
fn start_at_descents_are_the_shared_fixtures() {
    for case in fixture()["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let legs: Vec<Value> = case["legs"].as_array().unwrap().iter().map(leg).collect();
        let input = json!({"legs": legs, "fixes": fixes(), "end_altitude_ft": case["end_altitude_ft"]});
        let got: Value = serde_json::from_str(&call("navlog_with_descents", &input.to_string()).unwrap()).unwrap();
        for (i, want) in case["tods"].as_array().unwrap().iter().enumerate() {
            let tod = &got[i]["tod"];
            if want.is_null() {
                assert!(tod.is_null(), "{name}: leg {i} has a top of descent {tod}");
                continue;
            }
            for key in ["along_nm", "altitude_ft", "to_ft", "fpm", "ete_min"] {
                let (g, w) = (tod[key].as_f64().unwrap(), want[key].as_f64().unwrap());
                assert!((g - w).abs() < 1e-9, "{name}: leg {i}'s {key} {g}, want {w}");
            }
            assert_eq!(tod["pattern"], want["pattern"], "{name}: leg {i}");
            // The times and fuel are the legs' own, unchanged.
            assert_eq!(got[i]["ete_min"], legs[i]["ete_min"], "{name}: leg {i}");
        }
    }
}

#[test]
fn a_start_at_descents_top_is_at_the_waypoint() {
    // The second case: the top of descent at the end of the leg into
    // Lake, so at Lake itself.
    let case = &fixture()["cases"][1];
    let legs: Vec<Value> = case["legs"].as_array().unwrap().iter().map(leg).collect();
    let input = json!({"legs": legs, "fixes": fixes()});
    let got: Value = serde_json::from_str(&call("navlog_with_descents", &input.to_string()).unwrap()).unwrap();
    let tod = &got[0]["tod"];
    let (lat, lon) = (tod["lat"].as_f64().unwrap(), tod["lon"].as_f64().unwrap());
    let from_lake = wingtip_engine::geo::distance_nm(lat, lon, 40.7, -89.1);
    // 60 nm out from AAA on 045 lands within a few miles of Lake (the
    // fixes are round figures, not exactly 60 nm apart).
    assert!(from_lake < 10.0, "{from_lake} nm from Lake");
}
