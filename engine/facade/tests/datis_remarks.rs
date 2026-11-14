//! A D-ATIS's remarks as the airport card shows them, held to the shared
//! cases in apps/web/src/lib/fixtures/datisRemarks.json (KORD's of the
//! owner's screenshot, 2026-11-14, and KMSP's), worked by hand from the
//! text (engine/crates/radio/src/datis_remarks), each answer held to the
//! contract (engine/contract/engine.schema.json).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn read_json(path: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    serde_json::from_str(&std::fs::read_to_string(root.join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap()
}

#[test]
fn each_d_atis_gives_its_remarks_an_item_each_in_the_contracts_shape() {
    let mut schema = read_json("engine/contract/engine.schema.json");
    schema["required"] = json!([]);
    let validator = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    for case in read_json("apps/web/src/lib/fixtures/datisRemarks.json")["cases"].as_array().unwrap() {
        let input = json!({ "text": case["text"] });
        let text = call("datis_remarks", &input.to_string()).unwrap_or_else(|e| panic!("{}: {e}", case["about"]));
        let got: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(got, case["answer"], "{}", case["about"]);
        let asked = json!({ "datis_remarks": { "input": input, "answer": got } });
        let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{} at {}", e, e.instance_path())).collect();
        assert!(errors.is_empty(), "{}: {}", case["about"], errors.join("\n"));
    }
}
