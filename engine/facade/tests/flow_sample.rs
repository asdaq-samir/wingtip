//! Model Weather's reading at a point, held to the shared cases in
//! apps/web/src/lib/fixtures/flowSample.json, which the web's
//! flowTexture.test.ts reads too (engine/crates/weather/src/flow_sample.rs),
//! each input and answer held to the contract (engine/contract/engine.schema.json).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn read_json(path: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    serde_json::from_str(&std::fs::read_to_string(root.join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap()
}

#[test]
fn each_cell_and_reading_is_as_the_fixture_says_in_the_contracts_shape() {
    let mut schema = read_json("engine/contract/engine.schema.json");
    schema["required"] = json!([]);
    let validator = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    let fixture = read_json("apps/web/src/lib/fixtures/flowSample.json");
    for (rule, list) in [("flow_cell", "cells"), ("flow_sample", "samples")] {
        for case in fixture[list].as_array().unwrap() {
            let text = call(rule, &case["input"].to_string()).unwrap_or_else(|e| panic!("{}: {e}", case["about"]));
            let got: Value = serde_json::from_str(&text).unwrap();
            assert_eq!(got, case["answer"], "{}", case["about"]);
            let asked = json!({ rule: { "input": case["input"], "answer": got } });
            let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{} at {}", e, e.instance_path())).collect();
            assert!(errors.is_empty(), "{}: {}", case["about"], errors.join("\n"));
        }
    }
}
