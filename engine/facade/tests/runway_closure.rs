//! Where the card's sketch lays a field's runways and where a closed
//! runway's crosses go on it, held to the shared cases in
//! apps/web/src/lib/fixtures/runwaySketch.json (NASR's runway ends on the
//! engine's flat frame) and runwayClosureMarks.json (AC 150/5340-1M 5.6
//! and 5.7 and AIM 2-3-6), worked by hand
//! (engine/crates/weather/src/runway_closure), each input and answer held
//! to the contract (engine/contract/engine.schema.json).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn read_json(path: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    serde_json::from_str(&std::fs::read_to_string(root.join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap()
}

/// Equal, numbers as numbers: the fixture's 0 is the engine's 0.0.
fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| same(v, w))),
        _ => a == b,
    }
}

/// Each case of `fixture` asked of `rule`, its answer the case's and the contract's shape.
fn holds_to(rule: &str, fixture: &str) {
    let mut schema = read_json("engine/contract/engine.schema.json");
    schema["required"] = json!([]);
    let validator = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    for case in read_json(fixture)["cases"].as_array().unwrap() {
        let text = call(rule, &case["input"].to_string()).unwrap_or_else(|e| panic!("{}: {e}", case["about"]));
        let got: Value = serde_json::from_str(&text).unwrap();
        assert!(same(&got, &case["answer"]), "{}: {got}", case["about"]);
        let asked = json!({ rule: { "input": case["input"], "answer": got } });
        let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{} at {}", e, e.instance_path())).collect();
        assert!(errors.is_empty(), "{}: {}", case["about"], errors.join("\n"));
    }
}

#[test]
fn each_closed_runway_is_crossed_where_the_ac_marks_it_in_the_contracts_shape() {
    holds_to("runway_closure_marks", "apps/web/src/lib/fixtures/runwayClosureMarks.json");
}

#[test]
fn each_runway_is_laid_where_nasr_puts_it_or_guessed_along_its_heading() {
    holds_to("runway_sketch", "apps/web/src/lib/fixtures/runwaySketch.json");
}

#[test]
fn a_runway_with_no_ends_is_refused() {
    assert!(call("runway_closure_marks", r#"{"mark_ft":30,"runways":[{"a":[0,0]}]}"#).is_err());
}

#[test]
fn a_sketch_with_no_field_point_is_refused() {
    assert!(call("runway_sketch", r#"{"runways":[]}"#).is_err());
}
