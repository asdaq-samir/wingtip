//! A NOTAM read for a pilot (the airport card's NOTAMs), held to the shared
//! cases in apps/web/src/lib/fixtures/notamRead.json, worked by hand from
//! FAA Order JO 7930.2 (engine/crates/weather/src/notam_read), each input
//! and answer held to the contract (engine/contract/engine.schema.json), as
//! tests/contract.rs holds the rest.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn read_json(path: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    serde_json::from_str(&std::fs::read_to_string(root.join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap()
}

#[test]
fn each_notam_is_read_as_the_order_writes_it_out_in_the_contracts_shape() {
    let mut schema = read_json("engine/contract/engine.schema.json");
    schema["required"] = json!([]);
    let validator = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    for case in read_json("apps/web/src/lib/fixtures/notamRead.json")["cases"].as_array().unwrap() {
        let input = json!({ "text": case["text"], "idents": ["OSH", "KOSH"] });
        let text = call("notam_read", &input.to_string()).unwrap_or_else(|e| panic!("{}: {e}", case["about"]));
        let got: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(got, case["answer"], "{}", case["about"]);
        let asked = json!({ "notam_read": { "input": input, "answer": got } });
        let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{} at {}", e, e.instance_path())).collect();
        assert!(errors.is_empty(), "{}: {}", case["about"], errors.join("\n"));
    }
}

#[test]
fn a_notam_with_no_text_is_refused() {
    assert!(call("notam_read", "{}").is_err());
}
