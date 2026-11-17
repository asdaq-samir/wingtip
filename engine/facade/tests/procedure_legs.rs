//! How a procedure's open legs are drawn, where a course reversal is
//! flown and the ground's figures, moved from the planner's
//! wingtip.procedures, wingtip.procedure_paths, wingtip.elevation,
//! wingtip.profile, wingtip.terrain_view and wingtip.terrain_fine (#482),
//! held to the shared fixture (apps/web/src/lib/fixtures/procedureLegs.json)
//! as the planner asks them (wingtip_native.call).

use serde_json::Value;
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/procedureLegs.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn ask(name: &str, input: &Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

fn cases(name: &str, section: &str) {
    let all = fixture();
    let cases = all[section].as_array().unwrap();
    assert!(!cases.is_empty());
    for case in cases {
        let got = ask(name, &case["input"]);
        let want = &case["answer"];
        let same = match (got.as_f64(), want.as_f64()) {
            (Some(a), Some(b)) => (a - b).abs() < 1e-9,
            _ => &got == want,
        };
        assert!(same, "{name}: {case}\ngot {got}");
    }
}

#[test]
fn an_open_leg_is_drawn_as_far_as_its_kind_goes() {
    cases("procedure_leg_nm", "legNm");
}

#[test]
fn a_course_reversal_is_flown_where_the_path_turns_back() {
    cases("procedure_reversal", "reversal");
}

#[test]
fn the_ground_figures() {
    let got = ask("ground_figures", &serde_json::json!({}));
    let want = &fixture()["groundFigures"];
    for (key, value) in want.as_object().unwrap() {
        assert_eq!(got[key].as_f64(), value.as_f64(), "{key}");
    }
    assert_eq!(got.as_object().unwrap().len(), want.as_object().unwrap().len());
}
