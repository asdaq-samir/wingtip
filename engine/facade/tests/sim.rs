//! sim_flight held to the shared fixture the web reads too
//! (apps/web/src/lib/fixtures/simExport.json): a gap splits the flight in
//! two, ten frames a second, the pressure altitude set on the airplane's
//! own altimeter setting, and the airplane on the ground before it flies.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/simExport.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

#[test]
fn the_departure_and_its_gap_read_as_the_fixture_says() {
    let case = &fixture()["departureThenGap"];
    let ready: Value = serde_json::from_str(&call("replay_track", &json!({ "points": case["reports"] }).to_string()).unwrap()).unwrap();
    let settings: Vec<Value> = case["reports"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["qnh_hpa"].is_number())
        .map(|r| json!({ "t": r["t"], "hpa": r["qnh_hpa"], "alt_ft": r["alt_ft"] }))
        .collect();
    let input = json!({ "points": ready["points"], "settings": settings, "ground": case["ground"], "pressure": true, "rate_hz": 10 });
    let answer: Value = serde_json::from_str(&call("sim_flight", &input.to_string()).unwrap()).unwrap();
    let segments = answer["segments"].as_array().unwrap();
    assert_eq!(segments.len() as u64, case["segments"].as_u64().unwrap());
    assert_eq!(segments[0]["rows"].as_array().unwrap().len() as u64, case["firstRows"].as_u64().unwrap());
    assert_eq!(segments[1]["rows"].as_array().unwrap().len() as u64, case["secondRows"].as_u64().unwrap());
    // The first set on the crew's setting, the second left as sent.
    assert_eq!(segments[0]["setting_hpa"].as_f64(), case["settingHpa"].as_f64());
    assert_eq!(segments[1]["msl"], false);
    // Taxiing: on the ground's height, gear down, the taxi light on.
    let taxi = &segments[0]["rows"][0];
    assert_eq!(taxi["ground"], true);
    assert_eq!(taxi["alt_ft"].as_f64(), Some(672.0));
    assert_eq!(taxi["gear_down"], true);
    assert_eq!(taxi["lights"]["taxi"], true);
}
