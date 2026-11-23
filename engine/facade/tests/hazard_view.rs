//! hazard_view and profile_obstacles held to the shared fixture the web
//! reads too (apps/web/src/lib/fixtures/hazardView.json): the map's
//! ground and obstacles against the altitude flown, red within the
//! pilot's clearance (14 CFR 91.119(b) and (c), 91.177(a)(2)), yellow
//! a further 1,000 ft under it; the profile's obstacles as its ground.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/hazardView.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

/// `want`'s members in `got`, numbers by value (25.0 is 25).
fn holds(got: &Value, want: &Value, why: &Value) {
    match (got, want) {
        (Value::Number(g), Value::Number(w)) => assert!((g.as_f64().unwrap() - w.as_f64().unwrap()).abs() < 1e-9, "{why}: {got} {want}"),
        (Value::Object(_), Value::Object(w)) => w.iter().for_each(|(k, w)| holds(&got[k], w, why)),
        (Value::Array(g), Value::Array(w)) => {
            assert_eq!(g.len(), w.len(), "{why}: {got}");
            g.iter().zip(w).for_each(|(g, w)| holds(g, w, why));
        }
        _ => assert_eq!(got, want, "{why}"),
    }
}

#[test]
fn each_view_answers_as_the_fixture_says() {
    for case in fixture()["views"].as_array().unwrap() {
        let answer: Value = serde_json::from_str(&call("hazard_view", &case["input"].to_string()).unwrap()).unwrap();
        holds(&answer, &case["expected"], &case["why"]);
    }
}

#[test]
fn the_profiles_obstacles_coloured_and_the_tallest_apart_named() {
    let f = fixture();
    let answer: Value = serde_json::from_str(&call("profile_obstacles", &f["obstacles"]["input"].to_string()).unwrap()).unwrap();
    holds(&answer, &f["obstacles"]["expected"], &json!("profile_obstacles"));
}
