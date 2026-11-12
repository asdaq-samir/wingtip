//! An airport's remarks in words (the airport card's fuel remarks and
//! courtesy car), held to the shared cases in
//! apps/web/src/lib/fixtures/remarksRead.json -- KPWK's, KOSH's, KDPA's,
//! KHYS's and KRPD's remarks as NASR sends them, each word worked by hand
//! from the Chart Supplement's Abbreviations and JO 7340.2R
//! (engine/crates/weather/src/remarks_read) -- each input and answer held
//! to the contract (engine/contract/engine.schema.json). The planner asks
//! it (wingtip.remarks.service_notes), not the web.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn read_json(path: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    serde_json::from_str(&std::fs::read_to_string(root.join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap()
}

#[test]
fn each_fields_remarks_are_read_into_words_in_the_contracts_shape() {
    let mut schema = read_json("engine/contract/engine.schema.json");
    schema["required"] = json!([]);
    let validator = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    for case in read_json("apps/web/src/lib/fixtures/remarksRead.json")["cases"].as_array().unwrap() {
        let input = json!({ "remarks": case["remarks"] });
        let text = call("remarks_read", &input.to_string()).unwrap_or_else(|e| panic!("{}: {e}", case["about"]));
        let got: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(got["lines"], case["lines"], "{}", case["about"]);
        let asked = json!({ "remarks_read": { "input": input, "answer": got } });
        let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{} at {}", e, e.instance_path())).collect();
        assert!(errors.is_empty(), "{}: {}", case["about"], errors.join("\n"));
    }
}

#[test]
fn remarks_missing_are_refused() {
    assert!(call("remarks_read", "{}").is_err());
}
