//! The small rules every app once wrote for itself (the simplicity
//! measure of 2026-11-10: aircraft form limits, the traffic notice, the
//! paperwork's due tone, the drills' boxes, the geodesic figures, the IFR
//! alternate's window), each held to its shared fixture
//! (apps/web/src/lib/fixtures) and its answers to the contract
//! (engine/contract/engine.schema.json), asked by name as every host asks;
//! and the AWC METARs' answer, typed in the contract with its ceiling's
//! cover.

mod common;

use common::assert_same;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::sync::OnceLock;
use wingtip_engine::call::call;

fn read(path: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").join(path);
    serde_json::from_str(&std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))).unwrap()
}

fn fixture(name: &str) -> Value {
    read(&format!("apps/web/src/lib/fixtures/{name}"))
}

/// The rule asked, its input and answer held to the contract; the answer.
fn ask(name: &str, input: Value) -> Value {
    static CONTRACT: OnceLock<jsonschema::Validator> = OnceLock::new();
    let validator = CONTRACT.get_or_init(|| {
        let mut schema = read("engine/contract/engine.schema.json");
        schema["required"] = json!([]);
        jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema")
    });
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    let answer: Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{name} answered {text}: {e}"));
    let mut asked = Map::new();
    asked.insert(name.to_owned(), json!({ "input": input, "answer": answer }));
    let errors: Vec<String> = validator.iter_errors(&Value::Object(asked)).map(|e| format!("{e} at {}", e.instance_path())).collect();
    assert!(errors.is_empty(), "{name}: not of the contract's shape:\n{}\nanswer {answer}", errors.join("\n"));
    answer
}

fn close(got: &Value, want: &Value, what: &str) {
    let (g, w) = (got.as_f64().unwrap_or(f64::NAN), want.as_f64().unwrap_or(f64::NAN));
    assert!((g - w).abs() < 1e-9, "{what}: got {got}, want {want}");
}

#[test]
fn the_aircraft_form_says_what_is_wrong_by_field() {
    for case in fixture("aircraftForm.json")["cases"].as_array().unwrap() {
        assert_same(&ask("aircraft_problems", case["form"].clone()), &case["problems"], &case["form"]);
    }
}

#[test]
fn the_traffic_notice_and_what_is_fresh() {
    let traffic = fixture("traffic.json");
    for case in traffic["notice"].as_array().unwrap() {
        let mark = &ask("traffic_marks", json!({ "own_ft": case["ownFt"], "own": case["own"], "planes": [case["plane"]] }))[0];
        for key in ["near", "tell"] {
            assert_eq!(mark[key], case[key], "{key}: {case}");
        }
        for key in ["nm", "bearing_deg"] {
            if case[key].is_null() {
                assert!(mark[key].is_null(), "{key}: {case}");
            } else {
                close(&mark[key], &case[key], key);
            }
        }
    }
    // Many at once, in order, the old label and near unchanged.
    let many = ask("traffic_marks", json!({ "own_ft": 3000, "planes": [{ "altitude_ft": 3520 }, { "altitude_ft": null }] }));
    assert_same(
        &many,
        &json!([{ "label": "+05", "near": true, "nm": null, "bearing_deg": null, "tell": false },
            { "label": "", "near": false, "nm": null, "bearing_deg": null, "tell": false }]),
        "two at once",
    );
    for case in traffic["fresh"].as_array().unwrap() {
        let fresh = ask("traffic_fresh", json!({ "age_s": case["age_s"], "planes": [{ "seen_s": case["seen_s"] }] }));
        assert_eq!(fresh[0], case["fresh"], "{case}");
    }
}

#[test]
fn the_paperworks_due_tone() {
    for case in fixture("records.json")["dueTone"].as_array().unwrap() {
        assert_eq!(ask("due_tone", json!({ "days_left": case["days_left"], "hours_left": case["hours_left"] })), case["tone"], "{case}");
    }
}

#[test]
fn the_drills_boxes() {
    let drills = fixture("drills.json");
    for case in drills["next"].as_array().unwrap() {
        assert_same(&ask("drill_next", json!({ "box": case["box"], "knew": case["knew"] })), &case["result"], case);
    }
    // Each box's interval is the fixture's own list.
    for (i, days) in drills["intervalDays"].as_array().unwrap().iter().enumerate().skip(1) {
        let next = ask("drill_next", json!({ "box": i, "knew": true }));
        let to = next["box"].as_f64().unwrap() as usize;
        close(&next["in_days"], &drills["intervalDays"][to - 1], "in_days");
        assert!(days.is_number());
    }
}

#[test]
fn the_geodesic_figures() {
    let geodesic = fixture("geodesic.json");
    for case in geodesic["distance"].as_array().unwrap() {
        let input = json!({ "lat1": case["lat1"], "lon1": case["lon1"], "lat2": case["lat2"], "lon2": case["lon2"] });
        close(&ask("distance_nm", input), &case["nm"], "distance_nm");
    }
    for case in geodesic["bearing"].as_array().unwrap() {
        let input = json!({ "lat1": case["lat1"], "lon1": case["lon1"], "lat2": case["lat2"], "lon2": case["lon2"] });
        close(&ask("bearing_deg", input), &case["deg"], "bearing_deg");
    }
    // The same legs at once (great_circles, the planner's corridors and
    // the web's trails): each row the one-at-a-time answer.
    for (list, key, figure) in [("distance", "nm", "distance_nm"), ("bearing", "deg", "bearing_deg")] {
        let cases = geodesic[list].as_array().unwrap();
        let column = |k: &str| Value::Array(cases.iter().map(|c| c[k].clone()).collect());
        let got =
            ask("great_circles", json!({ "lat1": column("lat1"), "lon1": column("lon1"), "lat2": column("lat2"), "lon2": column("lon2") }));
        assert_eq!(got[figure].as_array().unwrap().len(), cases.len());
        for (row, case) in got[figure].as_array().unwrap().iter().zip(cases) {
            close(row, &case[key], figure);
        }
    }
    let cases = geodesic["destination"].as_array().unwrap();
    let points: Vec<Value> =
        cases.iter().map(|c| json!({ "lat": c["lat"], "lon": c["lon"], "bearing_deg": c["bearing_deg"], "nm": c["nm"] })).collect();
    let to = ask("destination", json!({ "points": points }));
    assert_eq!(to.as_array().unwrap().len(), cases.len());
    for (got, case) in to.as_array().unwrap().iter().zip(cases) {
        close(&got["lat"], &case["to"]["lat"], "lat");
        close(&got["lon"], &case["to"]["lon"], "lon");
    }
}

#[test]
fn the_ifr_alternates_window() {
    for case in fixture("plannerRules.json")["alternateWindow"].as_array().unwrap() {
        let window = ask("ifr_alternate_window", json!({ "eta": case["eta"], "for": case["for"] }));
        close(&window["start"], &case["start"], "start");
        close(&window["end"], &case["end"], "end");
    }
}

#[test]
fn a_metar_reads_with_its_ceilings_cover() {
    let xml = "<response><data><METAR><raw_text>KMSN 101853Z 22012KT 10SM OVC008 05/02 A3001</raw_text>\
        <station_id>KMSN</station_id><observation_time>2026-11-10T18:53:00Z</observation_time>\
        <latitude>43.14</latitude><longitude>-89.34</longitude><wind_dir_degrees>220</wind_dir_degrees>\
        <wind_speed_kt>12</wind_speed_kt><visibility_statute_mi>10+</visibility_statute_mi><altim_in_hg>30.01</altim_in_hg>\
        <sky_condition sky_cover=\"OVC\" cloud_base_ft_agl=\"800\"/><flight_category>IFR</flight_category></METAR></data></response>";
    let read = ask("awc_metars_read", json!({ "text": xml }));
    assert_eq!(read["KMSN"]["ceiling_cover"], "OVC");
    close(&read["KMSN"]["ceiling_ft"], &json!(800), "ceiling_ft");
}
