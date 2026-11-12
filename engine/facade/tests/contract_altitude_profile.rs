//! The profile's altitude rules (profile_clearance, altitude_advisor,
//! altitude_change) asked as the apps ask them, each input and answer held
//! to the contract (engine/contract/engine.schema.json), as tests/contract.rs
//! holds the rest; the airplane is the C172 profile of the planner's golden
//! route (services/planner/tests_wingtip/golden/KUGN-KRFD.json).

use serde_json::{json, Value};
use std::path::PathBuf;
use wingtip_engine::call::call;

fn read_json(path: &str) -> Value {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    serde_json::from_str(&std::fs::read_to_string(root.join(path)).unwrap_or_else(|e| panic!("{path}: {e}"))).unwrap()
}

fn ask(validator: &jsonschema::Validator, name: &str, input: Value) -> Value {
    let text = call(name, &input.to_string()).unwrap_or_else(|e| panic!("{name}: {e}"));
    let answer: Value = serde_json::from_str(&text).unwrap();
    let asked = json!({ name: { "input": input, "answer": answer } });
    let errors: Vec<String> = validator.iter_errors(&asked).map(|e| format!("{} at {}", e, e.instance_path())).collect();
    assert!(errors.is_empty(), "{name}: {}\nanswer {answer}", errors.join("\n"));
    answer
}

#[test]
fn the_profile_rules_answer_in_the_contracts_shapes() {
    let mut schema = read_json("engine/contract/engine.schema.json");
    schema["required"] = json!([]);
    let v = jsonschema::draft7::new(&schema).expect("the contract is a draft 7 schema");
    let clearance = ask(
        &v,
        "profile_clearance",
        json!({
            "altitude_ft": 3500, "along_nm": [0, 10, 20], "ground_ft": [900, 3000, 1200],
            "obstacles": [{ "along_nm": 15, "amsl_ft": 3200 }], "points": [{ "ident": "KAAA", "along_nm": 0 }, { "ident": "KXYZ", "along_nm": 20 }],
        }),
    );
    assert_eq!(clearance["words"], "3,500 ft, an obstacle within 300 ft near KXYZ");
    // The corridor the 3D map colours the ground in, the VFR floor's.
    assert_eq!(ask(&v, "floor_corridor_nm", json!({})).as_f64(), Some(5.0));
    let rows = ask(
        &v,
        "altitude_advisor",
        json!({
            "figures": [{ "altitude_ft": 4500, "ete_min": 60, "fuel_gal": 9, "tailwind_kt": -5, "everywhere": true },
                        { "altitude_ft": 6500, "ete_min": 55, "fuel_gal": 9.5, "tailwind_kt": 8, "everywhere": false }],
            "flown_ft": 4500, "plans": [{ "kind": "fastest", "altitude_ft": 6500 }],
        }),
    );
    assert!(rows.as_array().unwrap().iter().any(|r| r["altitude_ft"] == 6500.0 && r["fastest"] == true));
    ask(&v, "altitude_change", json!({ "profile": null, "along_nm": 40, "from_ft": 6500, "to_ft": 4500, "mode": "cross_at" }));
    let profile = read_json("services/planner/tests_wingtip/golden/KUGN-KRFD.json")["given"]["profile"].clone();
    let climb = ask(
        &v,
        "altitude_change",
        json!({
            "profile": profile, "along_nm": 10, "from_ft": 1500, "to_ft": 5500, "mode": "start_at",
            "groundspeed_kt": 100, "tas_kt": 110, "fuel_burn_gph": 8.5, "oat_c": 5,
        }),
    );
    assert!(climb["minutes"].as_f64().unwrap() > 0.0 && climb["ends_nm"].as_f64().unwrap() > 10.0, "{climb}");
}
