//! replay_track held to the shared fixture the web reads too
//! (apps/web/src/lib/fixtures/replay.json): two minutes unheard a gap, and
//! a climb read through the transponder's 25 ft steps.

use serde_json::Value;
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/replay.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

#[test]
fn the_gap_and_the_climb_read_as_the_fixture_says() {
    let case = &fixture()["climbThenGap"];
    let ready: Value = serde_json::from_str(&call("replay_track", &case["input"].to_string()).unwrap()).unwrap();
    assert_eq!(ready["gaps"][0]["from"].as_f64(), case["gapAfter"].as_f64());
    assert_eq!(ready["gaps"][0]["to"].as_f64(), case["gapUntil"].as_f64());
    let climb = ready["points"][3]["vs_fpm"].as_f64().unwrap();
    assert!((climb - case["climbFpmNear"].as_f64().unwrap()).abs() < 60.0, "{climb}");
    assert_eq!(ready["points"][8]["vs_fpm"].as_f64(), case["levelFpm"].as_f64());
    // Nothing drawn across it: the report after it marked, the one before not.
    assert_eq!(ready["points"][7]["gap"], true);
    assert_eq!(ready["points"][6]["gap"], false);
}
