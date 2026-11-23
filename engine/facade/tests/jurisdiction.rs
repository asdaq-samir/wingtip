//! jurisdiction_of and route_jurisdiction held to the shared fixture the
//! web reads too (apps/web/src/lib/fixtures/jurisdiction.json): whose rules
//! a point and a route are under (14 CFR 1.1, 91.1, 91.703; decision 0053).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/jurisdiction.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn ask(name: &str, input: &Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap()).unwrap()
}

#[test]
fn each_point_reads_as_its_country() {
    for p in fixture()["points"].as_array().unwrap() {
        let answer = ask("jurisdiction_of", &json!({ "lat": p["lat"], "lon": p["lon"] }));
        assert_eq!(answer["code"], p["code"], "{}", p["why"]);
        assert_eq!(answer["caution"].is_null(), p["code"] == "US", "{}", p["why"]);
    }
}

#[test]
fn each_route_says_its_points_legs_and_the_brief_once() {
    for r in fixture()["routes"].as_array().unwrap() {
        let answer = ask("route_jurisdiction", &json!({ "points": r["points"] }));
        let codes: Vec<&Value> = answer["points"].as_array().unwrap().iter().map(|p| &p["code"]).collect();
        assert_eq!(json!(codes), r["codes"], "{}", r["why"]);
        let legs: Vec<&Value> = answer["legs"].as_array().unwrap().iter().map(|l| &l["codes"]).collect();
        assert_eq!(json!(legs), r["legs"], "{}", r["why"]);
        assert_eq!(answer["outside"], r["outside"], "{}", r["why"]);
        let said: Vec<&Value> = answer["legs"].as_array().unwrap().iter().map(|l| &l["caution"]).collect();
        assert_eq!(json!(said), r["legCautions"], "{}", r["why"]);
        assert_eq!(answer["brief"].get("lead").unwrap_or(&Value::Null), &r["caution"], "{}", r["why"]);
    }
}
