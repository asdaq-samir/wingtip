//! A pilot's own altitude's cautions and the IFR alternate against the
//! shared fixture (apps/web/src/lib/fixtures/cautions.json), made from the
//! planner's tests of the Python they were: 14 CFR 91.119, 91.159, 91.131,
//! 91.155, 71.33, 91.211(a), 91.177(a), 91.179(b), 73.83 and 91.169.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

mod common;
use common::assert_same;

fn fixture() -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures/cautions.json");
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ask(name: &str, input: Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

fn cases<'a>(f: &'a Value, key: &str) -> &'a [Value] {
    f[key].as_array().unwrap_or_else(|| panic!("no {key}"))
}

#[test]
fn a_pilots_own_altitude_is_warned_with_the_rule_it_breaks() {
    let f = fixture();
    for case in cases(&f, "own_altitude") {
        let got = ask(
            "own_altitude_caution",
            json!({ "selection": case["selection"], "legs": case["legs"], "between": case["between"], "profile": case.get("profile") }),
        );
        assert_same(&got, &case["answer"], case);
    }
}

#[test]
fn the_91_119_floor_by_the_rules_own_figure() {
    let f = fixture();
    for case in cases(&f, "floor") {
        let got = ask("floor_caution", json!({ "segment": case["segment"], "altitude_ft": case["altitude_ft"] }));
        assert_same(&got, &case["answer"], case);
    }
}

#[test]
fn prohibited_airspace_is_a_warning() {
    let f = fixture();
    for case in cases(&f, "prohibited") {
        assert_same(&ask("prohibited_caution", json!({ "selection": case["selection"] })), &case["answer"], case);
    }
}

#[test]
fn the_destination_needs_an_alternate_unless_1_2_3() {
    let f = fixture();
    for case in cases(&f, "alternate_destination") {
        let got = ask(
            "ifr_alternate_destination",
            json!({ "ident": case["ident"], "approaches": case["approaches"], "forecast": case["forecast"] }),
        );
        assert_same(&got, &case["answer"], case);
    }
}

#[test]
fn an_alternate_by_its_minimums() {
    let f = fixture();
    for case in cases(&f, "alternate_check") {
        let got =
            ask("ifr_alternate_check", json!({ "ident": case["ident"], "approaches": case["approaches"], "forecast": case["forecast"] }));
        assert_same(&got, &case["answer"], case);
    }
}

#[test]
fn a_military_or_private_alternate_is_the_pilots_to_check() {
    // A field that meets 91.169(c)'s minimums is still landed at only with
    // the service's prior permission or the owner's: offered (meets_standard)
    // but not called good, with why.
    let f = fixture();
    let case = cases(&f, "alternate_check").iter().find(|c| c["answer"]["good"] == json!(true)).unwrap();
    for (usage, words) in [
        (json!({ "military": "military" }), "is military: prior permission required (PPR)."),
        (json!({ "private": true }), "is private: land only with the owner's permission."),
    ] {
        let mut input = json!({ "ident": case["ident"], "approaches": case["approaches"], "forecast": case["forecast"] });
        for (k, v) in usage.as_object().unwrap() {
            input[k] = v.clone();
        }
        let got = ask("ifr_alternate_check", input);
        assert_eq!(got["good"], Value::Null, "{got}");
        assert_eq!(got["meets_standard"], json!(true), "{got}");
        assert!(got["reasons"].as_array().unwrap().iter().any(|r| r.as_str().unwrap().ends_with(words)), "{got}");
    }
    // Joint use is public use: as good as before.
    let mut input = json!({ "ident": case["ident"], "approaches": case["approaches"], "forecast": case["forecast"] });
    input["military"] = json!("joint");
    assert_same(&ask("ifr_alternate_check", input), &case["answer"], case);
}

#[test]
fn the_alternates_offered_good_first_then_nearest() {
    let f = fixture();
    for case in cases(&f, "alternates_ranked") {
        let got = ask("ifr_alternates_ranked", json!({ "checks": case["checks"], "limit": case["limit"] }));
        let idents: Vec<Value> = got.as_array().unwrap().iter().map(|c| c["ident"].clone()).collect();
        assert_same(&Value::Array(idents), &case["answer"], case);
    }
}
