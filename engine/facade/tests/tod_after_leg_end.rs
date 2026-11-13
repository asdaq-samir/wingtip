//! A top of descent on a leg that flies more than its line at its end
//! (navlog_with_descents with a leg's `procedure` or an `at_end` hold),
//! held to the shared fixture
//! apps/web/src/lib/fixtures/descentAfterLegEnd.json: the pattern's, the
//! approach's or the hold's minutes and gallons, which the planner adds to
//! the leg before the descent is placed, are flown after it (the nav log's
//! row to the top of descent ran 2 to 3 minutes over its miles at its
//! ground speed, navlog-fit.spec, 2026-11-12). The figures are worked from
//! three to one (AIM 2-1-2) by hand in the fixture, not from the code.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/descentAfterLegEnd.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

/// The fixture's one 60 nm leg at 5,500 ft, 100 kt over the ground and
/// 8 gal/h on a course of 045, with what its case adds at its end.
fn leg(case: &Value) -> Value {
    json!({"distance_nm": 60.0, "altitude_ft": 5500.0, "groundspeed_kt": 100.0, "ete_min": case["ete_min"],
        "fuel_gal": case["fuel_gal"], "wind": null, "tas_kt": 100.0, "fuel_burn_gph": 8.0, "oat_c": null,
        "true_course_deg": 45.0, "climb_min": 0.0, "toc": null, "procedure": case["procedure"], "hold": case["hold"]})
}

#[test]
fn a_top_of_descent_leaves_what_the_leg_flies_at_its_end_after_it() {
    let fixes = json!([
        {"name": "AAA", "category": "departure", "lat": 40.0, "lon": -90.0},
        {"name": "BBB", "category": "destination", "lat": 40.7, "lon": -89.1},
    ]);
    for case in fixture()["cases"].as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        let input = json!({"legs": [leg(case)], "fixes": fixes, "end_altitude_ft": 1500.0});
        let got: Value = serde_json::from_str(&call("navlog_with_descents", &input.to_string()).unwrap()).unwrap();
        let tod = &got[0]["tod"];
        for key in ["along_nm", "ete_min", "fuel_gal"] {
            let (g, w) = (tod[key].as_f64().unwrap(), case["tod"][key].as_f64().unwrap());
            assert!((g - w).abs() < 1e-9, "{name}: {key} {g}, want {w}");
        }
        // The leg's own time and fuel are unchanged.
        assert_eq!(got[0]["ete_min"], case["ete_min"], "{name}");
        assert_eq!(got[0]["fuel_gal"], case["fuel_gal"], "{name}");
    }
}
