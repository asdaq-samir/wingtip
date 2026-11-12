//! A special-use area's tab, held to the shared cases in
//! apps/web/src/lib/fixtures/specialUseTab.json, from the FAA's special use
//! airspace data against what the FAA's CIFP writes for the same areas
//! (engine/crates/airspace/src/sua_tab.rs), each input and answer held to
//! the contract (engine/contract/engine.schema.json).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn read_json(path: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    serde_json::from_str(&std::fs::read_to_string(root.join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap()
}

#[test]
fn each_areas_tab_is_written_as_the_faas_cifp_writes_it_in_the_contracts_shape() {
    let mut schema = read_json("engine/contract/engine.schema.json");
    schema["required"] = json!([]);
    let validator = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    let fixture = read_json("apps/web/src/lib/fixtures/specialUseTab.json");
    for case in fixture["cases"].as_array().unwrap() {
        let text = call("special_use_tab", &case["input"].to_string()).unwrap_or_else(|e| panic!("{}: {e}", case["about"]));
        let got: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(got, case["answer"], "{}", case["about"]);
        let asked = json!({ "special_use_tab": { "input": case["input"], "answer": got } });
        let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{} at {}", e, e.instance_path())).collect();
        assert!(errors.is_empty(), "{}: {}", case["about"], errors.join("\n"));
    }
}

#[test]
fn an_area_with_no_name_is_refused() {
    assert!(call("special_use_tab", "{}").is_err());
}
