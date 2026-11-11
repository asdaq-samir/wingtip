//! What one NOTAM addresses on an airport's card (its badges), held to the
//! shared cases in apps/web/src/lib/fixtures/notamSubject.json, worked from
//! FAA Order JO 7930.2 (engine/crates/weather/src/notam_subject), each
//! input and answer held to the contract (engine/contract/engine.schema.json).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn read_json(path: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    serde_json::from_str(&std::fs::read_to_string(root.join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap()
}

#[test]
fn each_notam_badges_what_it_addresses_in_the_contracts_shape() {
    let mut schema = read_json("engine/contract/engine.schema.json");
    schema["required"] = json!([]);
    let validator = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    let fixture = read_json("apps/web/src/lib/fixtures/notamSubject.json");
    for case in fixture["cases"].as_array().unwrap() {
        let mut input = fixture["card"].clone();
        input["text"] = case["text"].clone();
        let text = call("notam_subject", &input.to_string()).unwrap_or_else(|e| panic!("{}: {e}", case["about"]));
        let got: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(got, case["answer"], "{}", case["about"]);
        let asked = json!({ "notam_subject": { "input": input, "answer": got } });
        let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{} at {}", e, e.instance_path())).collect();
        assert!(errors.is_empty(), "{}: {}", case["about"], errors.join("\n"));
    }
}

#[test]
fn a_notam_with_no_text_is_refused() {
    assert!(call("notam_subject", "{}").is_err());
}
