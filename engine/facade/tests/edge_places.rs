//! Unusual places and routes held to the shared fixture the web reads too
//! (apps/web/src/lib/fixtures/edgePlaces.json): the ADIZs of 14 CFR
//! 99.43-99.49, night along a leg across the antimeridian (1.1, 91.151(a)),
//! water runways for an airplane on wheels, and the kinds of field an
//! airplane lands at (NASR APT_BASE's SITE_TYPE_CODE).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/edgePlaces.json");
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}

fn ask(name: &str, input: &Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

#[test]
fn each_route_meets_its_adizs_and_the_brief_says_them_once() {
    for r in fixture()["adiz"]["routes"].as_array().unwrap() {
        let answer = ask("route_adiz", &json!({ "points": r["points"] }));
        assert_eq!(answer["zones"], r["zones"], "{}", r["why"]);
        assert_eq!(answer["brief"].get("lead").unwrap_or(&Value::Null), &r["lead"], "{}", r["why"]);
        if !answer["brief"].is_null() {
            assert!(answer["brief"]["cite"].as_str().unwrap().starts_with("14 CFR 99."), "{}", r["why"]);
        }
    }
}

#[test]
fn night_is_read_along_the_geodesic_across_the_antimeridian() {
    for c in fixture()["night"].as_array().unwrap() {
        let input = json!({ "start": c["start"], "end": c["end"], "depart_s": c["depart_s"], "minutes": c["minutes"] });
        assert_eq!(ask("night_on_the_way", &input), c["night"], "{}", c["why"]);
    }
}

#[test]
fn a_water_runway_is_no_landing_for_an_airplane_on_wheels() {
    let case = &fixture()["waterRunways"];
    let answer = ask("best_fields", &case["input"]);
    let field = |ident: &str| answer["fields"].as_array().unwrap().iter().find(|f| f["ident"] == json!(ident)).unwrap().clone();
    assert_eq!(field("LHD")["runway"]["end"], case["lakeHoodEnd"], "{}", case["why"]);
    let lake = field("XAC1");
    assert!(lake["runway"].is_null(), "{}", case["why"]);
    assert!(lake["reasons"].as_array().unwrap().iter().any(|r| r["text"] == case["waterOnly"]), "{}", case["why"]);
}

#[test]
fn only_a_strip_of_ground_is_an_airplanes_landing_site() {
    for s in fixture()["sites"].as_array().unwrap() {
        assert_eq!(ask("field_site_type", &json!({ "site_type": s["site_type"] }))["airplane"], s["airplane"], "{}", s["site_type"]);
    }
}

#[test]
fn the_tafs_along_a_leg_across_the_antimeridian_are_its_own() {
    let case = &fixture()["tafsAcross"];
    let answer = ask("tafs_along_route", &case["input"]);
    let idents: Vec<&Value> = answer["stations"].as_array().unwrap().iter().map(|s| &s["icaoId"]).collect();
    assert_eq!(json!(idents), case["stations"], "{}", case["why"]);
    assert_eq!(answer["min_ceiling_ft"], case["min_ceiling_ft"], "{}", case["why"]);
}
