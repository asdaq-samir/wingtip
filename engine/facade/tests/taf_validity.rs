//! taf_validity held to the shared fixture the web reads too
//! (apps/web/src/lib/fixtures/tafValidity.json): a TAF's issue time and
//! valid period as its header gives them, and whether it speaks for now
//! (FAA-H-8083-28B 27.4.1).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/tafValidity.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn ask(input: &Value) -> Value {
    serde_json::from_str(&call("taf_validity", &input.to_string()).unwrap()).unwrap()
}

#[test]
fn each_case_reads_as_the_fixture_says() {
    let f = fixture();
    for case in f["cases"].as_array().unwrap() {
        let answer = ask(&json!({ "taf": f["taf"], "now": case["now"] }));
        for (key, want) in case["expected"].as_object().unwrap() {
            assert_eq!(&answer[key], want, "{key} of {}: {answer}", case["why"]);
        }
    }
}

#[test]
fn words_that_are_no_taf_are_null() {
    assert_eq!(ask(&json!({ "taf": "NIL", "now": 0 })), Value::Null);
}
