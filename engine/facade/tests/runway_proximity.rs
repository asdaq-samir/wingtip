//! runway_proximity against the shared cases in apps/web/src/lib/fixtures/
//! runwayProximity.json, asked as the apps ask it: each case's state and
//! words (AC 120-74B 7e(2)(d), AIM 2-3-8 b 1, AIM 4-2-9), both sides of
//! the closing, a closed runway, the pattern's height and a stale fix.

use serde_json::Value;
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/runwayProximity.json");
    serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap()
}

#[test]
fn the_shared_cases_say_what_the_sources_say() {
    for case in fixture()["cases"].as_array().unwrap() {
        let answer: Value = serde_json::from_str(&call("runway_proximity", &case["input"].to_string()).unwrap()).unwrap();
        for key in ["state", "shown", "spoken"] {
            assert_eq!(answer[key], case["expected"][key], "{}: {key}\n{answer}", case["why"]);
        }
    }
}
