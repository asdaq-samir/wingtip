//! "When should I go?" (wingtip_engine::gonogo::window), held to the shared
//! fixture (apps/web/src/lib/fixtures/departureWindow.json) the web's
//! vitest and the planner's tests read too, and to the rule's boundaries:
//! an hour judged by the Go / No-Go's own findings, its night by the sun
//! (14 CFR 1.1, 61.57(b)), the airplane's findings left out with no
//! airplane, and the windows ranked by margin, then ETE.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;
use wingtip_engine::gonogo::window::{self, Judged, MARGIN_CAP};

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/departureWindow.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn ask(input: &Value) -> Value {
    let text = call("departure_window", &input.to_string()).unwrap_or_else(|e| panic!("departure_window: {e}"));
    serde_json::from_str(&text).unwrap()
}

/// Two JSON values the same, a number by its value.
fn same(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => x.as_f64() == y.as_f64(),
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| same(p, q)),
        (Value::Object(x), Value::Object(y)) => x.len() == y.len() && x.iter().all(|(k, v)| y.get(k).is_some_and(|w| same(v, w))),
        _ => a == b,
    }
}

#[test]
fn the_shared_cases() {
    for case in fixture()["cases"].as_array().unwrap() {
        let got = ask(&case["input"]);
        assert!(same(&got, &case["answer"]), "{}:\ngot {got}", case["name"]);
    }
}

#[test]
fn the_margin_is_the_lesser_ratio_over_the_minimums_held_to_its_cap() {
    // 91.155(c), (d)'s 1,000 ft and 3 sm where the pilot set none.
    assert_eq!(window::margin(Some(2000.0), Some(6.0), None, None), Some(2.0));
    assert_eq!(window::margin(Some(1000.0), Some(3.0), None, None), Some(1.0));
    // The pilot's own: 3,000 ft and 5 sm.
    assert_eq!(window::margin(Some(4500.0), Some(6.0), Some(3000.0), Some(5.0)), Some(1.2));
    // No ceiling: the visibility alone; nothing forecast: not known.
    assert_eq!(window::margin(None, Some(6.0), None, None), Some(2.0));
    assert_eq!(window::margin(None, Some(10.0), None, None), Some(MARGIN_CAP));
    assert_eq!(window::margin(None, None, None, None), None);
}

fn go(depart_s: f64, margin: Option<f64>, ete_min: Option<f64>) -> Judged {
    Judged { depart_s, verdict: "go", reasons: vec![], ete_min, fuel_gal: None, night: false, night_passengers: false, margin }
}

#[test]
fn windows_are_runs_of_go_hours_ranked_by_margin_then_ete() {
    let mut caution = go(3.0 * 3600.0, Some(3.0), Some(50.0));
    caution.verdict = "caution";
    let hours = vec![
        go(0.0, Some(1.5), Some(60.0)),
        go(3600.0, Some(1.2), Some(55.0)),
        go(2.0 * 3600.0, Some(1.4), Some(58.0)),
        caution,
        go(4.0 * 3600.0, Some(1.2), Some(52.0)),
        // A gap of two hours: a window of its own.
        go(6.0 * 3600.0, Some(2.0), Some(61.0)),
    ];
    let w = window::windows(&hours);
    assert_eq!(w.len(), 3);
    // The most margin first.
    assert_eq!((w[0].from_s, w[0].hours), (6.0 * 3600.0, 1));
    // Two at 1.2 (the least of their hours): the shorter ETE first.
    assert_eq!((w[1].from_s, w[1].last_s, w[1].ete_min, w[1].quickest_s), (4.0 * 3600.0, 4.0 * 3600.0, Some(52.0), 4.0 * 3600.0));
    assert_eq!((w[2].from_s, w[2].last_s, w[2].hours, w[2].ete_min, w[2].quickest_s), (0.0, 7200.0, 3, Some(55.0), 3600.0));
}

#[test]
fn an_hour_past_the_forecasts_is_not_known_whatever_its_findings() {
    let mut input = fixture()["cases"][0]["input"].clone();
    input["hours"] = json!([input["hours"][3].clone()]);
    input["hours"][0]["reaches"] = json!(false);
    let got = ask(&input);
    assert_eq!(got["hours"][0]["verdict"], "unknown");
    assert_eq!(got["windows"], json!([]));
}
