//! Rules the web app held and the engine now answers (#482 phase 1),
//! against the shared fixture apps/web/src/lib/fixtures/webRules.json: the
//! TAF that speaks for a field, a route's radio calls and a student's solo
//! endorsement's standing.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

mod common;
use common::assert_same;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/webRules.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ask(name: &str, input: Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

#[test]
fn the_taf_that_speaks_for_a_field() {
    for case in fixture()["fieldTaf"].as_array().unwrap() {
        let got = ask("field_taf", case["input"].clone());
        if let Some(want) = case.get("answer") {
            assert_same(&got, want, &case["about"]);
        } else {
            assert_same(&got["index"], &case["index"], &case["about"]);
            assert!(got["nm"].as_f64().unwrap() < case["nm_under"].as_f64().unwrap(), "{}", case["about"]);
        }
    }
}

#[test]
fn call_signs_and_place_names_as_spoken() {
    let f = fixture();
    for case in f["callSign"].as_array().unwrap() {
        assert_eq!(ask("radio_call_sign", json!({ "make": case["make"], "tail": case["tail"] })), case["said"]);
    }
    for case in f["placeName"].as_array().unwrap() {
        assert_eq!(ask("radio_place_name", json!({ "name": case["name"], "ident": case["ident"] })), case["said"]);
    }
}

#[test]
fn the_radio_calls_word_for_word() {
    let f = fixture();
    let script = ask("radio_script", f["radioScript"]["input"].clone());
    let want = f["radioScript"]["phases"].as_array().unwrap();
    assert_eq!(script.as_array().unwrap().len(), want.len());
    for (got, want) in script.as_array().unwrap().iter().zip(want) {
        assert_eq!(got["title"], want["title"]);
        assert_eq!(got["kind"], want["kind"]);
        let calls = got["calls"].as_array().unwrap();
        assert_eq!(calls.len(), want["calls"].as_array().unwrap().len(), "{}", want["title"]);
        for (c, w) in calls.iter().zip(want["calls"].as_array().unwrap()) {
            for key in ["to", "mhz", "words"] {
                assert_eq!(c[key], w[key], "{} {key}", want["title"]);
            }
            assert_eq!(c.get("listen").cloned().unwrap_or(Value::Bool(false)), w.get("listen").cloned().unwrap_or(Value::Bool(false)));
            if let Some(part) = w.get("note_has").and_then(Value::as_str) {
                assert!(c["note"].as_str().unwrap().contains(part), "{}", c["note"]);
            }
        }
    }
}

/// #482 phase 0's copies the apps kept, answered by the engine.
#[test]
fn the_lists_and_figures_the_apps_kept() {
    let f = fixture();
    assert_eq!(ask("passenger_briefing", json!({})), f["passengerBriefing"]);
    assert_eq!(ask("solo_xc_determinations", json!({})), f["soloXcDeterminations"]);
    for case in f["diagramFix"].as_array().unwrap() {
        let got = ask("diagram_fix_usable", json!({ "age_s": case["age_s"], "accuracy_m": case["accuracy_m"] }));
        assert_eq!(got, case["usable"], "{case}");
    }
    for case in f["terrainViewBands"].as_array().unwrap() {
        let got = ask("terrain_view_bands", json!({ "altitude_ft": case["altitude_ft"] }));
        assert_eq!(got["caution_from_ft"].as_f64(), case["caution_from_ft"].as_f64(), "{case}");
        assert_eq!(got["warning_from_ft"].as_f64(), case["warning_from_ft"].as_f64(), "{case}");
    }
    assert_eq!(ask("floor_corridor_nm", json!({})).as_f64(), f["floorCorridorNm"].as_f64());
    let reach = ask("traffic_reach", json!({}));
    assert_eq!(reach["around_nm"].as_f64(), f["trafficReach"]["around_nm"].as_f64());
    assert_eq!(reach["relation_nm"].as_f64(), f["trafficReach"]["relation_nm"].as_f64());
    let phases = serde_json::from_str::<Value>(
        &std::fs::read_to_string(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/checklist.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(ask("checklist_phases", json!({ "kind": "normal" })), phases["phases"]["normal"]);
    assert_eq!(ask("checklist_phases", json!({ "kind": "emergency" })), phases["phases"]["emergency"]);
    let lost = ask("lost_comms", json!({ "segments": [] }));
    assert_eq!(lost["altitude"], f["lostCommsAltitude"]);
}

#[test]
fn a_solo_endorsement_lapsing_within_a_week() {
    for case in fixture()["soloStanding"].as_array().unwrap() {
        let got = ask("solo_standing", json!({ "until": case["until"], "today": case["today"] }));
        assert_eq!(got["days"].as_f64(), case["days"].as_f64(), "{case}");
        assert_eq!(got["standing"], case["standing"], "{case}");
    }
}

/// The Profile card's Class B band at an altitude (14 CFR 91.131(a)(1)),
/// asked of the engine where the view compared it with a 10,000 ft guess.
#[test]
fn the_class_b_band_an_altitude_is_in() {
    for case in fixture()["classBAtAltitude"].as_array().unwrap() {
        assert_eq!(ask("class_b_at_altitude", case["input"].clone()), case["band"], "{}", case["about"]);
    }
}

/// The Go / No-Go's fuel and TFR figures, one copy for the web and the
/// planner (14 CFR 91.151(a), 91.167; 91.137-91.145).
#[test]
fn the_go_no_go_route_figures() {
    for case in fixture()["gonogoRouteFigures"].as_array().unwrap() {
        assert_same(&ask("gonogo_route_figures", case["input"].clone()), &case["answer"], &case["about"]);
    }
}

/// A way's warning, the worst it crosses, for every app (route_way_warning).
#[test]
fn a_ways_warning_is_the_worst_it_crosses() {
    for case in fixture()["routeWayWarning"].as_array().unwrap() {
        assert_eq!(ask("route_way_warning", json!({ "kinds": case["kinds"] })), case["warning"], "{}", case["about"]);
    }
}
