//! ready_to_fly held to the shared fixture the web reads too
//! (apps/web/src/lib/fixtures/readyToFly.json): the device's facts in,
//! one line and at most three actions out, a caution at worst.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/readyToFly.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn ask(input: &Value) -> Value {
    serde_json::from_str(&call("ready_to_fly", &input.to_string()).unwrap_or_else(|e| panic!("ready_to_fly: {e}"))).unwrap()
}

fn find<'a>(answer: &'a Value, key: &str) -> &'a Value {
    answer["items"].as_array().unwrap().iter().find(|i| i["key"] == json!(key)).unwrap_or_else(|| panic!("no {key} in {answer}"))
}

#[test]
fn each_case_reads_as_the_fixture_says() {
    for case in fixture()["cases"].as_array().unwrap() {
        let (answer, want, why) = (ask(&case["input"]), &case["expected"], &case["why"]);
        for key in ["ready", "finding", "line", "next_cycle", "next_cycle_ident", "briefing_age_min"] {
            if !want[key].is_null() {
                assert_eq!(answer[key], want[key], "{key} of {why}: {answer}");
            }
        }
        let actions: Vec<&Value> = answer["actions"].as_array().unwrap().iter().map(|a| &a["key"]).collect();
        assert_eq!(json!(actions), want["actions"], "{why}");
        for key in ["charts", "briefing", "kept"] {
            if let Some(line) = want.get(key) {
                assert_eq!(&find(&answer, key)["line"], line, "{why}");
            }
        }
        if let Some(fixes) = want["fixes"].as_object() {
            for (key, fix) in fixes {
                assert_eq!(&find(&answer, key)["fix"], fix, "{key} of {why}");
            }
        }
        if let Some(keys) = want.get("keys") {
            let all: Vec<&Value> = answer["items"].as_array().unwrap().iter().map(|a| &a["key"]).collect();
            assert_eq!(&json!(all), keys, "{why}");
        }
    }
}

#[test]
fn it_warns_and_never_stops() {
    // The owner, 2026-10-23: warn, never limit. Nothing, however missing,
    // is more than a caution.
    let answer = ask(&json!({ "now": 0, "plan": { "route": true }, "charts": { "kept": false }, "packs": {} }));
    assert!(answer["items"].as_array().unwrap().iter().all(|i| i["finding"] == json!("ok") || i["finding"] == json!("caution")));
    assert!(answer["actions"].as_array().unwrap().len() <= 3);
}

#[test]
fn kept_charts_past_their_edition_are_downloaded_again() {
    let answer = ask(&json!({
        "now": 1_794_247_200,
        "plan": { "route": true, "airplane": "N1", "altitude_ft": 3500 },
        "charts": { "kept": true, "edition": "2026-09-03", "download_mb": 80 },
    }));
    let charts = find(&answer, "charts");
    assert_eq!(charts["fix"], json!("download_charts"));
    assert_eq!(charts["detail"], json!("The kept charts went out of date on 29 Oct"));
}

#[test]
fn a_date_that_is_no_day_is_refused_in_words() {
    let err = call("ready_to_fly", &json!({ "now": 0, "packs": { "edition": "soon" } }).to_string()).unwrap_err();
    assert!(err.contains("YYYY-MM-DD"), "{err}");
}
