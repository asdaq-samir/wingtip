//! time_ago and route_procedures held to the shared fixtures the web and
//! both phones read too (apps/web/src/lib/fixtures/timeAgo.json and
//! routeProcedures.json): the one "... ago", and the SIDs and STARs typed
//! among a route's words. A route file's reading is route_file.rs's.

use serde_json::Value;
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture(name: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures").join(name);
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn each_case(rule: &str, file: &str) {
    for case in fixture(file)["cases"].as_array().unwrap() {
        let answer: Value = call(rule, &case["input"].to_string())
            .map(|t| serde_json::from_str(&t).unwrap())
            .unwrap_or_else(|e| panic!("{}: {e}", case["why"]));
        assert_eq!(answer, case["expected"], "{}", case["why"]);
    }
}

#[test]
fn time_ago_reads_as_the_fixture_says() {
    each_case("time_ago", "timeAgo.json");
}

#[test]
fn route_procedures_reads_as_the_fixture_says() {
    each_case("route_procedures", "routeProcedures.json");
}
