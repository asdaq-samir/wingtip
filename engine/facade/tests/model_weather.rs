//! The map's model weather in a pilot's words, held to the shared fixture
//! the web reads too (apps/web/src/lib/fixtures/modelWeather.json): AIM
//! 7-1-12's intensity words, AIM 7-1-28's sky cover, the NWS's CAPE
//! categories and the Z-R relation; and the bands the map is coloured by.
//! Each input and answer is held to the contract's shape here, as
//! contract.rs holds the older fixtures'.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/modelWeather.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn ask(name: &str, input: &Value) -> Value {
    let answer: Value = serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap();
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../contract/engine.schema.json");
    let mut schema: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
    schema["required"] = json!([]);
    let validator = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    let asked = json!({ name: { "input": input, "answer": answer } });
    let errors: Vec<String> = validator.iter_errors(&asked).map(|e| e.to_string()).collect();
    assert!(errors.is_empty(), "{name}: not of the contract's shape: {errors:?}");
    answer
}

#[test]
fn each_case_reads_as_the_fixture_says() {
    for case in fixture()["cases"].as_array().unwrap() {
        let answer = ask(case["rule"].as_str().unwrap(), &case["input"]);
        assert_eq!(answer, case["expected"], "{}", case["why"]);
    }
}

#[test]
fn the_bands_run_upward_from_the_sources_edges() {
    let bands = ask("model_weather_bands", &json!({}));
    let from = |list: &Value| list.as_array().unwrap().iter().map(|b| b["from"].as_f64().unwrap()).collect::<Vec<_>>();
    assert_eq!(from(&bands["precip"]["bands"]), [10.0, 26.0, 40.0, 50.0]);
    assert_eq!(from(&bands["ceiling"]), [0.0, 500.0, 1000.0, 3000.0]);
    assert_eq!(from(&bands["cape"]), [0.0, 1000.0, 2500.0, 4000.0]);
    assert_eq!(bands["precip"]["least_dbz"], json!(10.0));
}
