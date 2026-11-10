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

fn ask(name: &str, input: &Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
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
