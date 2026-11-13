//! The places a clearance heard named, held to the shared cases in
//! apps/web/src/lib/fixtures/clearancePlaces.json (the engine's
//! clearance_places, engine/crates/airspace/src/spoken_ask.rs, as the
//! planner asks it), each input and answer held to the contract
//! (engine/contract/engine.schema.json).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn read_json(path: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    serde_json::from_str(&std::fs::read_to_string(root.join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap()
}

#[test]
fn each_clearances_places_are_found_as_the_shared_cases_say_in_the_contracts_shape() {
    let mut schema = read_json("engine/contract/engine.schema.json");
    schema["required"] = json!([]);
    let validator = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    let fixture = read_json("apps/web/src/lib/fixtures/clearancePlaces.json");
    for case in fixture["cases"].as_array().unwrap() {
        let text = call("clearance_places", &case["input"].to_string()).unwrap_or_else(|e| panic!("{}: {e}", case["about"]));
        let got: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(got, case["answer"], "{}", case["about"]);
        let asked = json!({ "clearance_places": { "input": case["input"], "answer": got } });
        let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{} at {}", e, e.instance_path())).collect();
        assert!(errors.is_empty(), "{}: {}", case["about"], errors.join("\n"));
    }
}

#[test]
fn a_place_that_is_not_an_airport_navaid_or_fix_is_refused() {
    assert!(call("clearance_places", r#"{"places":[{"ident":"X","what":"city","lat":1.5,"lon":2.5}]}"#).is_err());
}
