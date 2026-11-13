//! The Studio's crash drafts' identity check (`occurrence_identity`,
//! crates/procedures/src/occurrence.rs) against the shared fixture
//! (apps/web/src/lib/fixtures/occurrenceIdentity.json): the agreeing case
//! confirmed, each disagreeing source sent to a person, and a day with no
//! report in the window a draft of the place alone. Asked by name, as the
//! jobs ask it through wingtip_native.

use serde_json::Value;
use std::path::PathBuf;
use wingtip_engine::call::call;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn fixture() -> Value {
    let path = root().join("apps/web/src/lib/fixtures/occurrenceIdentity.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

#[test]
fn each_fixture_case_gets_its_verdict_and_its_checks_in_order() {
    let cases = fixture()["cases"].as_array().unwrap().clone();
    assert!(cases.len() >= 8);
    for case in cases {
        let name = case["name"].as_str().unwrap();
        let text = call("occurrence_identity", &case["input"].to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
        let answer: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(answer["verdict"], case["verdict"], "{name}: {answer}");
        let checks: Vec<&str> = answer["checks"].as_array().unwrap().iter().map(|c| c["check"].as_str().unwrap()).collect();
        let expected: Vec<&str> = case["checks"].as_array().unwrap().iter().map(|c| c.as_str().unwrap()).collect();
        assert_eq!(checks, expected, "{name}");
        // Only a confirmed answer has every check passed.
        let all_ok = answer["checks"].as_array().unwrap().iter().all(|c| c["ok"] == true);
        assert_eq!(all_ok, case["verdict"] == "confirmed", "{name}: {answer}");
    }
}

#[test]
fn the_confirmed_case_names_its_nearest_report_and_the_window_in_utc() {
    let case = fixture()["cases"][0].clone();
    let answer: Value = serde_json::from_str(&call("occurrence_identity", &case["input"].to_string()).unwrap()).unwrap();
    // 14:25 CST is 20:25Z (1794169500): an hour before to fifteen minutes after.
    assert_eq!(answer["window"]["start"].as_f64(), Some(1_794_169_500.0 - 3600.0));
    assert_eq!(answer["window"]["end"].as_f64(), Some(1_794_169_500.0 + 900.0));
    assert_eq!(answer["within_nm"].as_f64(), Some(20.0));
    let d = answer["nearest"]["distance_nm"].as_f64().unwrap();
    assert!(d > 0.5 && d < 2.0, "{d}");
}

#[test]
fn every_fixture_answer_is_of_the_contracts_shape() {
    // As contract.rs holds the other fixtures: the rule's entry in
    // engine/contract/engine.schema.json, the input and the answer asked.
    let contract: Value =
        serde_json::from_str(&std::fs::read_to_string(root().join("engine/contract/engine.schema.json")).unwrap()).unwrap();
    let mut entry = contract["properties"]["occurrence_identity"].clone();
    entry["definitions"] = contract["definitions"].clone();
    let validator = jsonschema::draft7::new(&entry).expect("the entry is a draft 7 schema");
    for case in fixture()["cases"].as_array().unwrap() {
        let answer: Value = serde_json::from_str(&call("occurrence_identity", &case["input"].to_string()).unwrap()).unwrap();
        let asked = serde_json::json!({ "input": case["input"], "answer": answer });
        let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{e} at {}", e.instance_path())).collect();
        assert!(errors.is_empty(), "{}: {}", case["name"], errors.join("; "));
    }
}
