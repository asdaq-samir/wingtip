//! Forecast icing on an IFR route (#216), held to the shared cases in
//! apps/web/src/lib/fixtures/icingForecast.json, worked by hand from the
//! rule (engine/crates/brief/src/icing_forecast.rs): the levels either side
//! of the altitude flown, the worse of the two; the ground not read; any
//! icing at the altitude the Go / No-Go's line (AIM 7-1-19).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/icingForecast.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

/// Two JSON values the same, a number to a billionth.
fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => (x.as_f64().unwrap() - y.as_f64().unwrap()).abs() < 1e-9,
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| same(v, w))),
        _ => a == b,
    }
}

#[test]
fn each_route_is_read_as_the_rule_reads_it() {
    let all = fixture();
    for case in all["routes"].as_array().unwrap() {
        let input = json!({ "levels_ft": all["levels_ft"], "legs": case["legs"] });
        let text = call("icing_forecast_route", &input.to_string()).unwrap_or_else(|e| panic!("{}: {e}", case["about"]));
        let got: Value = serde_json::from_str(&text).unwrap();
        assert!(same(&got, &case["answer"]), "{}\ngot  {got}\nwant {}", case["about"], case["answer"]);
    }
}

#[test]
fn a_section_not_of_its_shape_is_refused() {
    let all = fixture();
    for case in all["refused"].as_array().unwrap() {
        let input = json!({ "levels_ft": all["levels_ft"], "legs": case["legs"] });
        assert!(call("icing_forecast_route", &input.to_string()).is_err(), "{}", case["about"]);
    }
}

#[test]
fn levels_that_do_not_climb_are_refused() {
    let input = json!({ "levels_ft": [4000, 3000], "legs": [] });
    assert!(call("icing_forecast_route", &input.to_string()).is_err());
}
