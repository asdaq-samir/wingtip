//! A field's lighting remarks read for a pilot (the airport card's
//! Lights), held to the shared cases in
//! apps/web/src/lib/fixtures/lightingRead.json -- Oshkosh's, Waukegan's and
//! Madison's remarks as NASR sends them, each system's way of being turned
//! on worked by hand from the Chart Supplement legend and AIM 2-1-8
//! (engine/crates/weather/src/lighting_read) -- each input and answer held
//! to the contract (engine/contract/engine.schema.json), as tests/contract.rs
//! holds the rest. The planner asks it (wingtip.remarks), not the web.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn read_json(path: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    serde_json::from_str(&std::fs::read_to_string(root.join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap()
}

#[test]
fn each_fields_lights_are_read_as_the_legend_and_the_aim_say_in_the_contracts_shape() {
    let mut schema = read_json("engine/contract/engine.schema.json");
    schema["required"] = json!([]);
    let validator = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    for case in read_json("apps/web/src/lib/fixtures/lightingRead.json")["cases"].as_array().unwrap() {
        let input = json!({ "lighting": case["lighting"], "beacon": case["beacon"] });
        let text = call("lighting_read", &input.to_string()).unwrap_or_else(|e| panic!("{}: {e}", case["about"]));
        let got: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(got, case["answer"], "{}", case["about"]);
        let asked = json!({ "lighting_read": { "input": input, "answer": got } });
        let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{} at {}", e, e.instance_path())).collect();
        assert!(errors.is_empty(), "{}: {}", case["about"], errors.join("\n"));
    }
}

#[test]
fn remarks_with_no_lighting_list_are_refused() {
    assert!(call("lighting_read", "{}").is_err());
}
