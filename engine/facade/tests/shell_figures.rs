//! The figures the apps once kept for themselves and now ask by name
//! (#482): the live feeds' cadence (weather's live_feeds), the hours a
//! search's "VFR at…" offers (weather's forecast/ahead) and how far back an
//! instructor's page lists (pilot's instructor_records), each held to the
//! shared cases in apps/web/src/lib/fixtures/shellFigures.json and its
//! input and answer to the contract (engine/contract/engine.schema.json).

mod common;

use common::assert_same;
use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn read(path: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").join(path);
    serde_json::from_str(&std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))).unwrap()
}

/// Each case of `rule` asked, its answer the fixture's and of the contract's shape.
fn holds(rule: &str, cases: &[Value]) {
    let mut schema = read("engine/contract/engine.schema.json");
    schema["required"] = json!([]);
    let validator = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    for case in cases {
        let text = call(rule, &case["input"].to_string()).unwrap_or_else(|e| panic!("{}: {e}", case["about"]));
        let got: Value = serde_json::from_str(&text).unwrap();
        assert_same(&got, &case["answer"], &case["about"]);
        let asked = json!({ rule: { "input": case["input"], "answer": got } });
        let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{e} at {}", e.instance_path())).collect();
        assert!(errors.is_empty(), "{}: {}", case["about"], errors.join("\n"));
    }
}

#[test]
fn the_live_feeds_are_asked_again_as_the_fixture_says() {
    let fixture = read("apps/web/src/lib/fixtures/shellFigures.json");
    holds("live_feed_refresh", fixture["live_feed_refresh"].as_array().unwrap());
}

#[test]
fn vfr_at_offers_the_fixtures_hours() {
    let fixture = read("apps/web/src/lib/fixtures/shellFigures.json");
    holds("vfr_at_hours", std::slice::from_ref(&fixture["vfr_at_hours"]));
}

#[test]
fn an_instructors_page_lists_three_years_back() {
    let fixture = read("apps/web/src/lib/fixtures/shellFigures.json");
    holds("instructor_records_since", fixture["instructor_records_since"].as_array().unwrap());
}

#[test]
fn a_feed_it_does_not_know_is_refused() {
    assert!(call("live_feed_refresh", r#"{"feed":"metar"}"#).is_err());
}
