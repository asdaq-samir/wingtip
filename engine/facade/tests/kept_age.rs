//! kept_age held to the shared fixture the web and both phones read too
//! (apps/web/src/lib/fixtures/keptAge.json): a kept answer's age, and a
//! caution past ready_to_fly's own freshness for its kind.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/keptAge.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn ask(input: &Value) -> Result<Value, String> {
    call("kept_age", &input.to_string()).map(|t| serde_json::from_str(&t).unwrap())
}

#[test]
fn each_case_reads_as_the_fixture_says() {
    for case in fixture()["cases"].as_array().unwrap() {
        let answer = ask(&case["input"]).unwrap_or_else(|e| panic!("{}: {e}", case["why"]));
        for (key, want) in case["expected"].as_object().unwrap() {
            assert_eq!(&answer[key], want, "{key} of {}: {answer}", case["why"]);
        }
    }
}

#[test]
fn every_kind_is_answered_and_never_more_than_a_caution() {
    for kind in ["briefing", "weather", "notams", "airports", "plates", "plan", "go_no_go", "weather_loop"] {
        let answer = ask(&json!({ "now": 1_794_247_200, "fetched_at": 0, "kind": kind })).unwrap();
        assert_eq!(answer["finding"], json!("caution"), "{kind}: {answer}");
    }
}

#[test]
fn a_kind_not_known_is_refused_in_words() {
    let err = ask(&json!({ "now": 0, "fetched_at": 0, "kind": "tiles" })).unwrap_err();
    assert!(err.contains("no kind called"), "{err}");
}

#[test]
fn plates_fetched_before_0901z_on_the_changeover_day_are_of_the_last_cycle() {
    // AIRAC 2612 takes over at 0901Z on 26 Nov 2026 ("Effective 0901 UTC",
    // the Federal Register's amendments). Plates fetched at 0300Z that day
    // are 2611's; asked at 0900Z they are still current, at 0901Z and after
    // they are not.
    let fetched = 1795662000;
    for (now, finding) in [(1795683600, "ok"), (1795683660, "caution"), (1795683720, "caution")] {
        let answer = ask(&json!({ "now": now, "fetched_at": fetched, "kind": "plates" })).unwrap();
        assert_eq!(answer["finding"], json!(finding), "{now}: {answer}");
    }
    // Fetched at 0901Z, of the new cycle.
    let answer = ask(&json!({ "now": 1795683720, "fetched_at": 1795683660, "kind": "plates" })).unwrap();
    assert_eq!(answer["finding"], json!("ok"), "{answer}");
}

