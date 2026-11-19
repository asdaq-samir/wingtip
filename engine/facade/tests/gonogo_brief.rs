//! The Brief's Go / No-Go put together (`gonogo_brief`) and its lines as
//! it opens (`gonogo_glance_lines`), held to the shared fixture
//! (apps/web/src/lib/fixtures/goNoGoBrief.json) the web's vitest reads too,
//! and to the rules' boundaries: the alternate an IFR flight's alone (14
//! CFR 91.169(a)), the airplane's findings left out with no airplane, at
//! most three lines of at most 140 characters, the stops first.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/goNoGoBrief.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn ask(name: &str, input: &Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
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
    let f = fixture();
    for (name, key) in [("gonogo_brief", "brief"), ("gonogo_glance_lines", "glance")] {
        for case in f[key].as_array().unwrap() {
            let got = ask(name, &case["input"]);
            assert!(same(&got, &case["answer"]), "{name}, {}:\ngot {got}\nwant {}", case["name"], case["answer"]);
        }
    }
}

#[test]
fn every_line_is_one_sentence_of_at_most_140_characters_at_most_three() {
    for case in fixture()["glance"].as_array().unwrap() {
        let act = ask("gonogo_glance_lines", &case["input"])["act"].as_array().unwrap().clone();
        assert!(act.len() <= 3, "{}", case["name"]);
        for line in act {
            let words = line["line"].as_str().unwrap();
            assert!(words.chars().count() <= 140, "{words}");
            assert!(!words.ends_with(':'), "{words}");
        }
    }
}

fn quiet_verdict(ifr: bool) -> Value {
    json!({
        "weather": { "pending": false, "failed": null, "vfr_not_recommended": [], "under_minimums": [], "hazards": [],
                     "unchecked": [], "worst": null, "ifr": ifr },
        "airspace": { "pending": false, "unchecked": false, "in_force": [], "near": 0, "special_use": [] },
        "altitude": { "pending": false, "problem": null, "cautions": [], "flown": "8,500 ft" },
        "fuel": { "pending": false, "margin_gal": 10, "required_gal": 20, "reserve_min": 45, "ifr": ifr },
        "runways": { "pending": false, "worked": true, "short": [], "crosswind": [], "beyond": [], "unchecked": [] },
        "balance": { "pending": false, "worked": true, "problems": [], "takeoff": null },
        "risk": { "level": "low", "line": "Low · 0 points" }
    })
}

#[test]
fn the_alternate_speaks_under_ifr_alone() {
    // 14 CFR 91.169(a): the alternate is filed for an IFR flight.
    let under = json!({ "destination": { "required": true }, "alternate": { "ident": "KMSP", "good": false, "reasons": [] } });
    let ifr = ask("gonogo_brief", &json!({ "verdict": quiet_verdict(true), "alternate": under, "airplane": true }));
    assert_eq!(ifr["line"]["finding"], "stop");
    assert_eq!(ifr["items"][0]["section"], "Alternate");
    let vfr = ask("gonogo_brief", &json!({ "verdict": quiet_verdict(false), "alternate": under, "airplane": true }));
    assert_eq!(vfr["line"]["finding"], "ok");
}

#[test]
fn with_no_airplane_the_airplanes_findings_are_not_judged() {
    let got = ask("gonogo_brief", &json!({ "verdict": quiet_verdict(false), "airplane": false }));
    let keys: Vec<&str> = got["items"].as_array().unwrap().iter().map(|i| i["key"].as_str().unwrap()).collect();
    assert_eq!(keys, ["weather", "airspace", "altitude", "risk"]);
}
