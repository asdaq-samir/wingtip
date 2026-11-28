//! The airport weather marks held to the shared fixture the web and the
//! phones read too (apps/web/src/lib/fixtures/airportWeatherMarks.json):
//! a field's least crosswind, its wind arrow and whether it is red, the
//! station model's barb, and the getting-worse badge, which is
//! weather_worse asked with the field's METAR now as the earlier reading
//! and its TAF for the flight's time there as the later one.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/airportWeatherMarks.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

/// The rule `name` asked `input`, its input and answer held to the
/// contract (engine/contract/engine.schema.json), as tests/contract.rs
/// holds the other fixtures'; the answer.
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
fn least_crosswind_is_the_fixtures() {
    for case in fixture()["leastCrosswind"].as_array().unwrap() {
        assert_eq!(ask("least_crosswind", &case["input"]), case["answer"], "{}", case["why"]);
    }
}

#[test]
fn the_wind_arrow_is_the_fixtures() {
    for case in fixture()["windArrow"].as_array().unwrap() {
        assert_eq!(ask("wind_arrow", &case["input"]), case["answer"], "{}", case["why"]);
    }
}

#[test]
fn the_wind_barb_is_the_fixtures() {
    for case in fixture()["windBarb"].as_array().unwrap() {
        assert_eq!(ask("wind_barb", &json!({ "speed_kt": case["speed_kt"] })), case["answer"], "{}", case["why"]);
    }
}

/// The list form answers each field as the two rules do alone: the
/// arrow cases asked at once, each with its barb, and a field with no wind
/// with none.
#[test]
fn wind_marks_is_the_arrow_and_the_barb_of_each_field() {
    let cases = fixture()["windArrow"].as_array().unwrap().clone();
    let fields: Vec<Value> = cases.iter().map(|c| c["input"].clone()).collect();
    let answers = ask("wind_marks", &json!({ "fields": fields }));
    for (case, got) in cases.iter().zip(answers.as_array().unwrap()) {
        assert_eq!(got["shown"], case["answer"]["shown"], "{}", case["why"]);
        assert_eq!(got["over"], case["answer"]["over"], "{}", case["why"]);
        let expected = match case["input"]["speed_kt"].as_f64() {
            Some(kt) => ask("wind_barb", &json!({ "speed_kt": kt })),
            None => Value::Null,
        };
        assert_eq!(got["barb"], expected, "{}", case["why"]);
    }
}

#[test]
fn the_worse_badge_is_weather_worse_from_now_to_the_eta() {
    for case in fixture()["worseByArrival"].as_array().unwrap() {
        let at_eta: Vec<Value> = case["atEta"]
            .as_array()
            .unwrap()
            .iter()
            .map(|f| {
                let mut f = f.clone();
                f["arrival"] = json!(true);
                f
            })
            .collect();
        let answer = ask("weather_worse", &json!({ "then": { "tafs": case["now"] }, "now": { "tafs": at_eta } }));
        let badged: Vec<&Value> = answer["worse"].as_array().unwrap().iter().map(|w| &w["ident"]).collect();
        assert_eq!(json!(badged), case["badged"], "{}", case["why"]);
    }
}
