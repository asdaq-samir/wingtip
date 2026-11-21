//! route_headwind held to the shared fixture the web reads too
//! (apps/web/src/lib/fixtures/routeHeadwind.json): the leg flown most into
//! the wind aloft, its headwind the wind's component along its true course
//! (FAA-H-8083-25C ch. 16), a tailwind negative.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/routeHeadwind.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

#[test]
fn each_case_answers_as_the_fixture_says() {
    for case in fixture()["cases"].as_array().unwrap() {
        let answer: Value = serde_json::from_str(&call("route_headwind", &json!({ "legs": case["legs"] }).to_string()).unwrap()).unwrap();
        let want = &case["expected"];
        if want.is_null() {
            assert!(answer.is_null(), "{}: {answer}", case["why"]);
            continue;
        }
        // By value: the engine writes 25.0 where the fixture has 25.
        for (key, want) in want.as_object().unwrap() {
            match want.as_f64() {
                Some(n) => assert!((answer[key].as_f64().unwrap() - n).abs() < 1e-9, "{key} of {}: {answer}", case["why"]),
                None => assert_eq!(&answer[key], want, "{key} of {}", case["why"]),
            }
        }
    }
}
