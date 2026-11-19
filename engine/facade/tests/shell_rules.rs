//! The rules the apps and the gateway once worked out for themselves and
//! now ask by name (the simplicity wave, 2026-11-18): the copilot's planned
//! flight, a past flight's average ground speed, the nav log's miles along,
//! the filed form's EET and endurance, a hold's inbound course, the planner's
//! procedure path figures, the MAYDAY's altitude, 91.169(b)'s words and the
//! paperwork list's names and rules. Each is held to its cases in the shared
//! fixtures (apps/web/src/lib/fixtures), which the web's tests read too, and
//! its input and answer to the contract (engine/contract/engine.schema.json).

mod common;

use common::assert_same;
use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn read(path: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").join(path);
    serde_json::from_str(&std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))).unwrap()
}

fn fixture(name: &str) -> Value {
    read(&format!("apps/web/src/lib/fixtures/{name}"))
}

/// `rule` asked `input`: its answer, held to the contract's shape.
fn ask(rule: &str, input: Value) -> Value {
    let mut schema = read("engine/contract/engine.schema.json");
    schema["required"] = json!([]);
    let validator = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    let text = call(rule, &input.to_string()).unwrap_or_else(|e| panic!("{rule}: {e}"));
    let got: Value = serde_json::from_str(&text).unwrap();
    let asked = json!({ rule: { "input": input, "answer": got } });
    let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{e} at {}", e.instance_path())).collect();
    assert!(errors.is_empty(), "{rule} {input}: {}", errors.join("\n"));
    got
}

#[test]
fn the_copilots_planned_flight() {
    for case in fixture("copilot.json")["flight"].as_array().unwrap() {
        assert_same(&ask("copilot_flight", case["input"].clone()), &case["answer"], &case["name"]);
    }
}

#[test]
fn the_average_ground_speed_and_the_miles_along() {
    let f = fixture("flightRules.json");
    for case in f["averageGroundspeed"].as_array().unwrap() {
        let got = ask("average_groundspeed_kt", json!({ "distance_nm": case["distance_nm"], "minutes": case["minutes"] }));
        assert_same(&got, &case["kt"], case);
    }
    for case in f["nmAlong"].as_array().unwrap() {
        assert_same(&ask("nm_along", json!({ "legs_nm": case["legs_nm"] })), &case["along"], case);
    }
}

#[test]
fn the_filed_eet_and_endurance() {
    for case in fixture("filingForm.json")["times"].as_array().unwrap() {
        let input = json!({ "ete_min": case["ete_min"], "fuel_gal": case["fuel_gal"], "legs": case["legs"],
            "cruise_burn_gph": case["cruise_burn_gph"] });
        assert_same(&ask("filed_times", input), &case["answer"], &case["name"]);
    }
}

#[test]
fn a_holds_inbound_course_and_the_procedure_path_figures() {
    let f = fixture("holds.json");
    for case in f["inbound"].as_array().unwrap() {
        let got = ask("hold_inbound_deg", json!({ "course_deg": case["course_deg"], "outbound": case["outbound"] }));
        assert_same(&got, &case["inbound_deg"], case);
    }
    let figures = &f["pathFigures"];
    let got = ask("procedure_path_figures", json!({}));
    for key in ["hold_turn_nm", "vectors_join_nm", "vectors_intercept_deg"] {
        assert_same(&got[key], &figures[key], key);
    }
}

#[test]
fn the_mayday_says_its_altitude_to_the_hundred_feet() {
    for case in fixture("emergency.json")["maydayAltitude"].as_array().unwrap() {
        let got = ask("mayday_call", json!({ "altitude_ft": case["altitude_ft"], "frequencies": [] }));
        assert!(got["lines"].as_array().unwrap().contains(&case["said"]), "{case}: {got}");
    }
}

#[test]
fn no_alternate_is_needed_in_91_169bs_own_figures() {
    assert_eq!(
        ask("ifr_alternate_not_required", json!({})),
        json!("An approach, and 2,000 ft and 3 sm an hour either side of the ETA (14 CFR 91.169(b)).")
    );
}

#[test]
fn the_paperwork_list_names_and_cites_each_item() {
    for case in fixture("records.json")["inspections"].as_array().unwrap() {
        assert_same(&ask("inspections_due", case["input"].clone())["due"], &case["answer"]["due"], &case["input"]);
    }
}
