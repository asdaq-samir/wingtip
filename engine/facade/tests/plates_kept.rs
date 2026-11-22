//! diversion_range_nm and plates_kept held to the shared fixture the
//! planner reads too (apps/web/src/lib/fixtures/platesKept.json): the
//! reserve 14 CFR 91.167(a)(3) asks at the airplane's cruise, and the
//! charts each field's part in the flight keeps.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/platesKept.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn ask(name: &str, input: &Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap()).unwrap()
}

#[test]
fn each_range_is_as_the_fixture_says() {
    for case in fixture()["ranges"].as_array().unwrap() {
        let answer = ask("diversion_range_nm", &case["input"]);
        for (key, want) in case["expected"].as_object().unwrap() {
            let same = match (answer[key].as_f64(), want.as_f64()) {
                (Some(a), Some(b)) => (a - b).abs() < 1e-9,
                _ => &answer[key] == want,
            };
            assert!(same, "{key} of {}: {answer}", case["why"]);
        }
    }
}

#[test]
fn a_flight_keeps_each_fields_plates_by_its_part() {
    let flight = &fixture()["flight"];
    let answer = ask("plates_kept", &json!({ "range_nm": flight["range_nm"], "fields": flight["fields"] }));
    let got: Vec<Value> = answer
        .as_array()
        .unwrap()
        .iter()
        .map(|f| {
            let kinds: Vec<Value> = f["charts"].as_array().unwrap().iter().map(|c| c["kind"].clone()).collect();
            json!({ "ident": f["ident"], "role": f["role"], "kinds": kinds })
        })
        .collect();
    assert_eq!(Value::Array(got), flight["expected"]);
}

#[test]
fn with_no_range_no_diversion_is_kept() {
    let flight = &fixture()["flight"];
    let answer = ask("plates_kept", &json!({ "range_nm": null, "fields": flight["fields"] }));
    assert!(answer.as_array().unwrap().iter().all(|f| f["role"] != "diversion"));
}
