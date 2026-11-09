//! A flight's NOTAMs ranked (the Brief's "NOTAMs that matter"), held to
//! the shared cases in apps/web/src/lib/fixtures/notamsRanked.json, worked
//! by hand from the rule's table (engine/crates/weather/src/notam_rank.rs).

use serde_json::Value;
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/notamsRanked.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

#[test]
fn each_flight_is_ranked_as_the_table_scores_it() {
    for case in fixture()["cases"].as_array().unwrap() {
        let text = call("notams_ranked", &case["input"].to_string()).unwrap_or_else(|e| panic!("{}: {e}", case["about"]));
        let got: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(got, case["answer"], "{}", case["about"]);
    }
}

#[test]
fn a_flight_with_no_notams_list_is_refused() {
    assert!(call("notams_ranked", "{}").is_err());
}

#[test]
fn every_notam_given_comes_back() {
    let case = &fixture()["cases"][0];
    let got: Value = serde_json::from_str(&call("notams_ranked", &case["input"].to_string()).unwrap()).unwrap();
    assert_eq!(got["ranked"].as_array().unwrap().len(), case["input"]["notams"].as_array().unwrap().len());
}
