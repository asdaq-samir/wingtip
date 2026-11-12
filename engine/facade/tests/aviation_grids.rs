//! The Aviation Weather Center's grids in a pilot's words, held to the
//! shared fixture the web reads too (apps/web/src/lib/fixtures/
//! aviationGrids.json): AWC's icing categories, its GTG thresholds by
//! weight class and its GFA cloud text; and the levels the map draws.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/aviationGrids.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn ask(name: &str, input: &Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

#[test]
fn each_case_reads_as_the_fixture_says() {
    for case in fixture()["cases"].as_array().unwrap() {
        let answer = ask(case["rule"].as_str().unwrap(), &case["input"]);
        assert_eq!(answer, case["expected"], "{}", case["why"]);
    }
}

#[test]
fn the_levels_are_awcs_names_and_their_feet() {
    let levels = ask("flow_levels", &json!({}));
    let ids = |k: &str| levels[k].as_array().unwrap().iter().map(|l| l["id"].as_str().unwrap().to_string()).collect::<Vec<_>>();
    assert_eq!(ids("wind"), ["sfc", "030", "060", "090", "120", "180", "240", "300", "max"]);
    assert_eq!(levels["wind"][2]["ft"], json!(6000.0));
    // FL180's standard pressure, about 506 hPa (ICAO Doc 7488).
    let fl180 = levels["wind"][5]["isa_hpa"].as_f64().unwrap();
    assert!((fl180 - 505.8).abs() < 0.5, "{fl180}");
    assert_eq!(levels["flight_levels_from_ft"], json!(18000.0));
}
