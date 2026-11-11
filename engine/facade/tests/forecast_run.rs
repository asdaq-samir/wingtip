//! The dry run played against the forecast (forecast_run), asked as the
//! planner asks it with the shared fixture apps/web/src/lib/fixtures/
//! forecastRun.json -- the planner's tests_wingtip/test_forecast_run.py
//! holds its gathering to the same one -- its answer held to the contract's
//! shape (engine/contract/engine.schema.json) as contract.rs holds the
//! others'.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn read_json(path: &str) -> Value {
    let at = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").join(path);
    serde_json::from_str(&std::fs::read_to_string(&at).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap()
}

#[test]
fn the_fixtures_run_meets_the_forecast_for_its_times() {
    let run = read_json("apps/web/src/lib/fixtures/forecastRun.json");
    let input = run["input"].clone();
    let got: Value = serde_json::from_str(&call("forecast_run", &input.to_string()).unwrap()).unwrap();

    // Of the contract's shape.
    let mut schema = read_json("engine/contract/engine.schema.json");
    schema["required"] = json!([]);
    let validator = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    let asked = json!({ "forecast_run": { "input": input, "answer": got } });
    let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{} at {}", e, e.instance_path())).collect();
    assert!(errors.is_empty(), "not of the contract's shape:\n{}", errors.join("\n"));

    let legs: Vec<Value> = got["legs"].as_array().unwrap().iter().map(|l| json!([l["row"], l["category"]])).collect();
    assert_eq!(Value::Array(legs), run["expect"]["legs"]);
    let kinds: Vec<Value> = got["alerts"].as_array().unwrap().iter().map(|a| a["kind"].clone()).collect();
    assert_eq!(Value::Array(kinds), run["expect"]["alert_kinds"]);
    let wind: Vec<f64> = ["wind_dir_true_deg", "wind_speed_kt"].iter().map(|k| got["samples"][0][k].as_f64().unwrap()).collect();
    let want: Vec<f64> = run["expect"]["wind_first"].as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect();
    assert_eq!(wind, want);
    // Every alert cites its rule or product.
    assert!(got["alerts"].as_array().unwrap().iter().all(|a| !a["source"].as_str().unwrap().is_empty()));
}

#[test]
fn a_tafs_ceiling_of_unknown_height_beats_a_modelled_vfr() {
    // The fixture's run with KAAA's TAF "OVC/// 6SM" throughout and the
    // Gridded LAMP's VFR at the first sample: a ceiling of unknown height
    // is a ceiling not known to be high enough (14 CFR 1.1 "ceiling"), so
    // the run warns of it under 91.155 rather than taking the model's VFR.
    let run = read_json("apps/web/src/lib/fixtures/forecastRun.json");
    let mut input = run["input"].clone();
    input["sigmets"] = json!([]);
    input["outlooks"] = json!([]);
    input["tafs"][0]["fcsts"] =
        json!([{ "timeFrom": 0, "timeTo": 7200, "change": "", "ceiling_ft": null, "ceiling_unknown": true, "visibility_sm": 6 }]);
    let got: Value = serde_json::from_str(&call("forecast_run", &input.to_string()).unwrap()).unwrap();
    let alerts = got["alerts"].as_array().unwrap();
    // The first sample, at 600 s, is where the model has its VFR.
    let along = alerts.iter().find(|a| a["kind"] == "vfr_minimums" && a["t"] == json!(600.0));
    assert!(
        along.is_some_and(|a| a.to_string().contains("ceiling of unknown height") && a["source"].as_str().unwrap().contains("TAF KAAA")),
        "no unknown-ceiling alert along the way: {}",
        Value::Array(alerts.clone())
    );
}
