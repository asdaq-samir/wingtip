//! The altitudes a flight may be planned at, 91.155's minimums and the
//! oral's drills against the shared fixtures (apps/web/src/lib/fixtures
//! altitudes.json and drills.json), which the web and the phones are held
//! to as well.

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn fixture(name: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../apps/web/src/lib/fixtures").join(name);
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn ask(name: &str, input: Value) -> Value {
    serde_json::from_str(&call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"))).unwrap()
}

#[test]
fn the_limits_and_the_altitudes_allowed() {
    let f = fixture("altitudes.json");
    for case in f["limits"].as_array().unwrap() {
        assert_eq!(ask("altitude_limits", json!({ "ifr": case["ifr"] })), case["answer"]);
    }
    for case in f["allowed"].as_array().unwrap() {
        assert_eq!(ask("altitude_allowed", json!({ "ft": case["ft"], "ifr": case["ifr"] })), case["allowed"], "{case}");
    }
    for case in f["said"].as_array().unwrap() {
        assert_eq!(ask("altitude_said", json!({ "ft": case["ft"] })), case["said"]);
    }
    for case in f["filed"].as_array().unwrap() {
        assert_eq!(ask("filed_level", json!({ "ft": case["ft"] })), case["filed"]);
    }
    let wheel = ask("vfr_altitudes", json!({ "from_ft": f["wheel"]["from_ft"] }));
    let wheel = wheel.as_array().unwrap();
    assert_eq!(wheel.len() as u64, f["wheel"]["count"].as_u64().unwrap());
    assert_eq!(wheel[0], f["wheel"]["first"]);
    assert_eq!(wheel[wheel.len() - 1], f["wheel"]["last"]);
}

#[test]
fn the_91_155_table_by_name() {
    for case in fixture("altitudes.json")["minimums"].as_array().unwrap() {
        let got = ask("vfr_minimums", json!({ "class": case["class"], "altitude_ft": case["altitude_ft"], "agl_ft": case.get("agl_ft") }));
        if case.get("none").is_some() {
            assert!(got.is_null(), "{case}");
            continue;
        }
        for when in ["day", "night"] {
            let Some(want) = case.get(when) else { continue };
            for key in ["visibility_sm", "below_ft", "above_ft", "horizontal_ft"] {
                assert_eq!(got[when][key], want[key], "{case} {when} {key}");
            }
        }
    }
}

#[test]
fn the_drills_decks_are_the_fixtures() {
    let want = fixture("drills.json")["decks"].clone();
    assert_eq!(ask("drill_decks", json!({})), want);
}

#[test]
fn where_the_airplane_is_along_the_route() {
    for case in fixture("routePosition.json")["cases"].as_array().unwrap() {
        let got = ask("route_position", case["input"].clone());
        let want = &case["answer"];
        if want.is_null() {
            assert!(got.is_null(), "{}", case["name"]);
            continue;
        }
        for (key, w) in want.as_object().unwrap() {
            match w {
                Value::Number(n) => assert!((got[key].as_f64().unwrap() - n.as_f64().unwrap()).abs() < 0.01, "{}: {key} {}", case["name"], got[key]),
                _ => assert_eq!(&got[key], w, "{}: {key}", case["name"]),
            }
        }
    }
}

#[test]
fn the_filing_forms_items() {
    let f = fixture("filingForm.json");
    for c in f["cruisingSpeed"].as_array().unwrap() {
        assert_eq!(ask("filed_speed", json!({ "tas_kt": c["tasKt"] })), c["item"]);
    }
    for c in f["cruisingLevel"].as_array().unwrap() {
        assert_eq!(ask("filed_level", json!({ "ft": c["altitudeFt"] })), c["item"]);
    }
    for c in f["hhmm"].as_array().unwrap() {
        assert_eq!(ask("filed_duration", json!({ "minutes": c["minutes"] })), c["item"]);
    }
    for c in f["route"].as_array().unwrap() {
        assert_eq!(ask("filed_route", json!({ "stops": c["stops"], "airways": c["airways"] })), c["item"]);
    }
    assert_eq!(ask("filed_wake", json!({ "max_takeoff_lb": 2550 })), json!("L"));
    assert_eq!(ask("filed_zzzz", json!({ "ident": "C81" })), json!(true));
}
