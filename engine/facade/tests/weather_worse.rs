//! weather_worse held to the shared fixture the iPhone reads too
//! (apps/web/src/lib/fixtures/weatherWorse.json): two readings of a
//! route's briefing in, the ways it got worse out, each keyed and worded.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/weatherWorse.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

#[test]
fn each_case_reads_as_the_fixture_says() {
    for case in fixture()["cases"].as_array().unwrap() {
        let answer: Value = serde_json::from_str(&call("weather_worse", &case["input"].to_string()).unwrap()).unwrap();
        let worse = answer["worse"].as_array().unwrap();
        let keys: Vec<&Value> = worse.iter().map(|w| &w["key"]).collect();
        let lines: Vec<&Value> = worse.iter().map(|w| &w["line"]).collect();
        assert_eq!(json!(keys), case["keys"], "{}", case["why"]);
        assert_eq!(json!(lines), case["lines"], "{}", case["why"]);
        for w in worse {
            assert!(w["source"].as_str().unwrap().starts_with("AIM 7-1-"), "{w}");
        }
    }
}

#[test]
fn a_reading_missing_is_refused_in_words() {
    let e = call("weather_worse", r#"{"now":{}}"#).unwrap_err();
    assert!(e.contains("\"then\""), "{e}");
}
