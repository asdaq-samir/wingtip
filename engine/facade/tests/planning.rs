//! Night, the nav log's checkpoint pick and 91.155's
//! basic minimums against the shared fixture apps/web/src/lib/fixtures/
//! planning.json (#482 phase 1, the planner's wingtip.sun and
//! wingtip.checkpoints).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;
use wingtip_engine::sun;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/planning.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ask(name: &str, input: Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

#[test]
fn night_and_night_on_the_way() {
    let f = fixture();
    for case in f["night"].as_array().unwrap() {
        let got = sun::is_night(case["lat"].as_f64().unwrap(), case["lon"].as_f64().unwrap(), case["at_s"].as_f64().unwrap());
        assert_eq!(json!(got), case["night"], "{}", case["why"]);
    }
    for case in f["on_the_way"].as_array().unwrap() {
        let input = json!({ "start": case["start"], "end": case["end"], "depart_s": case["depart_s"], "minutes": case["minutes"] });
        assert_eq!(ask("night_on_the_way", input), case["night"], "{}", case["why"]);
    }
    // Either end: by day at Chicago, at night when it lands at 03:00 CDT.
    let either = |arrive: i64| ask("night_at_either_end", json!({ "start": [41.88, -87.63], "depart_s": 1790096400, "end": [41.88, -87.63], "arrive_s": arrive }));
    assert_eq!(either(1790096400 + 3600), json!(false));
    assert_eq!(either(1790064000 + 86400), json!(true));
}

/// 14 CFR 61.57(b)'s night-passenger period, an hour after sunset to an
/// hour before sunrise, against 1.1's night at the same instants: at
/// Anchorage on the June solstice there is no 1.1 night but there is the
/// period; at Chicago 1.1's night begins first.
#[test]
fn the_61_57_b_period_is_its_own_window() {
    for case in fixture()["passenger_night"].as_array().unwrap() {
        let at = json!({ "lat": case["lat"], "lon": case["lon"], "at_s": case["at_s"] });
        assert_eq!(ask("passenger_night", at.clone()), case["passenger_night"], "{}", case["why"]);
        let night = sun::is_night(case["lat"].as_f64().unwrap(), case["lon"].as_f64().unwrap(), case["at_s"].as_f64().unwrap());
        assert_eq!(json!(night), case["night"], "{}", case["why"]);
    }
    // A flight out of Anchorage to Kenai at 01:00 AKDT on 22 June (09:00
    // UTC), 40 minutes long, is in the period; one leaving at 20:00 AKDT
    // on the 21st is not.
    let flight = |depart_s: i64| {
        ask("passenger_night_on_the_way", json!({ "start": [61.22, -149.9], "end": [60.57, -151.25], "depart_s": depart_s, "minutes": 40 }))
    };
    assert_eq!(flight(1782118800), json!(true));
    assert_eq!(flight(1782100800), json!(false));
}

#[test]
fn the_checkpoints_picked() {
    for case in fixture()["checkpoints"].as_array().unwrap() {
        let candidates: Vec<Value> = case["candidates"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| json!({ "along_track_nm": c[0], "predicted_score": c[1] }))
            .collect();
        let mut input = json!({ "candidates": candidates });
        for key in ["min_spacing_nm", "max_count", "min_score", "length_nm"] {
            if let Some(v) = case.get(key) {
                input[key] = v.clone();
            }
        }
        assert_eq!(ask("checkpoints_select", input), case["picked"], "{}", case["why"]);
    }
}

#[test]
fn below_the_basic_vfr_minimums() {
    for case in fixture()["below_vfr_minimums"].as_array().unwrap() {
        let got = ask("below_vfr_minimums", json!({ "ceiling_ft": case["ceiling_ft"], "visibility_sm": case["visibility_sm"] }));
        assert_eq!(got, case["below"], "{case}");
    }
}
